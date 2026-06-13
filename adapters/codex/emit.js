#!/usr/bin/env node
/**
 * AgentForge — Codex CLI adapter emitter.
 *
 * Reads spec/*.yaml from the AgentForge repo and emits the Codex-native posture
 * (AGENTS.md + ~/.codex/config.toml + scripts/ + crontab entry hint) into a target dir.
 *
 * Usage:
 *   node adapters/codex/emit.js <target-dir>
 *
 * Idempotent: re-running with no spec changes produces zero diff (modulo the
 * "Last updated" timestamp line in AGENTS.md — held stable by reading existing
 * AGENTS.md and reusing its date if spec sha is unchanged).
 *
 * Git checkpoint: best-effort `git add -A && git commit` inside the target dir,
 * but only when it is already a git repo — never `git init` a fresh target.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SPEC_DIR = path.join(REPO_ROOT, 'spec');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const ADAPTER_SCRIPTS_DIR = path.join(__dirname, 'scripts');
const UNIVERSAL_INSTALLERS_DIR = path.join(REPO_ROOT, 'universal', 'lib', 'installers');

const SPEC_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Minimal YAML parser (sufficient for AgentForge spec shape only).
// Supports: nested mappings via 2-space indent, sequences (`- foo` or `- key: val`),
// scalars (quoted or bare), inline flow sequences (`[a, b, 'c d']`), block scalars (`|`),
// and `# comments`. Not a general YAML parser — only spec-shape coverage.
// ---------------------------------------------------------------------------
function parseYaml(text) {
  // Strip BOM, normalize newlines.
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const rawLines = text.split('\n');
  // Pre-process: strip full-line comments and blank lines, but keep line indices for block scalars.
  const lines = rawLines.map((l) => {
    // Preserve leading whitespace; strip trailing comments only if not inside quotes (best-effort).
    return l;
  });

  let i = 0;

  function lineIndent(s) {
    const m = s.match(/^( *)/);
    return m ? m[1].length : 0;
  }

  function isBlankOrComment(s) {
    const t = s.trim();
    return t === '' || t.startsWith('#');
  }

  function stripInlineComment(s) {
    // Strip ` # comment` when not inside quotes. Best-effort scan.
    let inSingle = false;
    let inDouble = false;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === '#' && !inSingle && !inDouble) {
        // Require whitespace before #.
        if (k === 0 || /\s/.test(s[k - 1])) return s.slice(0, k).replace(/\s+$/, '');
      }
    }
    return s;
  }

  function parseScalar(raw) {
    const v = raw.trim();
    if (v === '' || v === '~' || v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    // Quoted strings — preserve content; unescape minimally.
    if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
      return v.slice(1, -1).replace(/''/g, "'");
    }
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
    }
    // Flow sequence: [a, b, c]
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1);
      return splitFlow(inner).map((s) => parseScalar(s));
    }
    // Flow mapping not used in AgentForge spec; return raw.
    return v;
  }

  // Split a flow sequence respecting quotes and brackets.
  function splitFlow(s) {
    const out = [];
    let buf = '';
    let inSingle = false;
    let inDouble = false;
    let depth = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) {
          out.push(buf.trim());
          buf = '';
          continue;
        }
      }
      buf += c;
    }
    if (buf.trim() !== '') out.push(buf.trim());
    return out;
  }

  // Parse a block at the given indent. Returns { value, nextLine }.
  function parseBlock(indent) {
    // Decide: mapping vs sequence vs end.
    while (i < lines.length && isBlankOrComment(lines[i])) i++;
    if (i >= lines.length) return null;
    const cur = lines[i];
    const curIndent = lineIndent(cur);
    if (curIndent < indent) return null;
    const stripped = cur.slice(curIndent);
    if (stripped.startsWith('- ') || stripped === '-') {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function flowBalanced(s) {
    let inSingle = false, inDouble = false, depth = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') depth--;
      }
    }
    return depth === 0;
  }

  // Starting at lines[i] (an indented line beginning with [ or {),
  // consume lines until the flow expression is balanced. Returns concatenated text.
  function gobbleFlow(parentIndent) {
    let buf = '';
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '') { i++; continue; }
      const ind = lineIndent(l);
      if (ind <= parentIndent && buf !== '') break;
      buf += (buf === '' ? '' : ' ') + l.trim();
      i++;
      if (flowBalanced(buf)) break;
    }
    return buf;
  }

  function gobbleFlowFromBuffer(initial, parentIndent) {
    let buf = initial;
    while (i < lines.length && !flowBalanced(buf)) {
      const l = lines[i];
      if (l.trim() === '') { i++; continue; }
      const ind = lineIndent(l);
      if (ind <= parentIndent) break;
      buf += ' ' + l.trim();
      i++;
    }
    return buf;
  }

  function parseMapping(indent) {
    const obj = {};
    while (i < lines.length) {
      if (isBlankOrComment(lines[i])) {
        i++;
        continue;
      }
      const cur = lines[i];
      const curIndent = lineIndent(cur);
      if (curIndent < indent) break;
      if (curIndent > indent) break; // shouldn't happen if caller drove indent correctly
      const stripped = stripInlineComment(cur.slice(curIndent));
      if (stripped.startsWith('- ')) break;
      const colonIdx = findMapColon(stripped);
      if (colonIdx === -1) {
        // Bad line — skip defensively.
        i++;
        continue;
      }
      const key = stripped.slice(0, colonIdx).trim();
      let rest = stripped.slice(colonIdx + 1).trim();
      i++;
      if (rest === '' ) {
        // Could be nested mapping/sequence, a multi-line flow sequence/mapping,
        // OR an empty value. Peek next non-blank line to decide.
        let j = i;
        while (j < lines.length && isBlankOrComment(lines[j])) j++;
        if (j >= lines.length) {
          obj[key] = null;
          continue;
        }
        const childIndent = lineIndent(lines[j]);
        const childFirst = lines[j].slice(childIndent);
        if (childIndent > indent && (childFirst.startsWith('[') || childFirst.startsWith('{'))) {
          // Multi-line flow sequence/mapping — gobble until matched bracket.
          i = j;
          const gobbled = gobbleFlow(indent);
          obj[key] = parseScalar(gobbled);
        } else if (childIndent > indent) {
          const child = parseBlock(childIndent);
          obj[key] = child === null ? null : child;
        } else {
          obj[key] = null;
        }
      } else if (rest.startsWith('[') && !flowBalanced(rest)) {
        // Inline-start multi-line flow sequence.
        const gobbled = gobbleFlowFromBuffer(rest, indent);
        obj[key] = parseScalar(gobbled);
      } else if (rest === '|' || rest === '|-' || rest === '|+') {
        // Block scalar: collect lines indented more than `indent`.
        const chompMode = rest === '|-' ? 'strip' : rest === '|+' ? 'keep' : 'clip';
        const buf = [];
        let blockIndent = null;
        while (i < lines.length) {
          const l = lines[i];
          if (l.trim() === '') {
            buf.push('');
            i++;
            continue;
          }
          const ind = lineIndent(l);
          if (ind <= indent) break;
          if (blockIndent === null) blockIndent = ind;
          buf.push(l.slice(blockIndent));
          i++;
        }
        // Trim trailing blanks per chomp.
        let result = buf.join('\n');
        if (chompMode === 'strip') {
          result = result.replace(/\n+$/, '');
        } else if (chompMode === 'clip') {
          result = result.replace(/\n+$/, '\n');
        }
        obj[key] = result;
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  function parseSequence(indent) {
    const arr = [];
    while (i < lines.length) {
      if (isBlankOrComment(lines[i])) {
        i++;
        continue;
      }
      const cur = lines[i];
      const curIndent = lineIndent(cur);
      if (curIndent < indent) break;
      if (curIndent > indent) break;
      const stripped = stripInlineComment(cur.slice(curIndent));
      if (!stripped.startsWith('-')) break;
      let rest = stripped === '-' ? '' : stripped.slice(2);
      // Determine if this list item is an inline scalar or a mapping starter.
      // Mapping starter: `- key: value` or `- key:` (with following children).
      const looksLikeMap = rest !== '' && findMapColon(rest) !== -1;
      if (rest === '') {
        // Nested block — consume next indented block.
        i++;
        let j = i;
        while (j < lines.length && isBlankOrComment(lines[j])) j++;
        if (j < lines.length && lineIndent(lines[j]) > indent) {
          arr.push(parseBlock(lineIndent(lines[j])));
        } else {
          arr.push(null);
        }
      } else if (looksLikeMap) {
        // Convert this line into a mapping start at indent+2, and consume any
        // continuation lines that belong to it.
        const colonIdx = findMapColon(rest);
        const firstKey = rest.slice(0, colonIdx).trim();
        let firstVal = rest.slice(colonIdx + 1).trim();
        const itemIndent = curIndent + 2;
        // Synthesize: replace current line with `<itemIndent spaces>key: val`, re-process at itemIndent.
        lines[i] = ' '.repeat(itemIndent) + firstKey + (firstVal ? ': ' + firstVal : ':');
        const item = parseMapping(itemIndent);
        arr.push(item);
      } else {
        arr.push(parseScalar(rest));
        i++;
      }
    }
    return arr;
  }

  function findMapColon(s) {
    // Find first `:` not inside quotes/brackets, followed by space or end-of-line.
    let inSingle = false;
    let inDouble = false;
    let depth = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') depth--;
        else if (c === ':' && depth === 0) {
          const next = s[k + 1];
          if (next === undefined || next === ' ' || next === '\t') return k;
        }
      }
    }
    return -1;
  }

  // Top-level: skip leading blanks/comments, then parse mapping at indent 0.
  while (i < lines.length && isBlankOrComment(lines[i])) i++;
  if (i >= lines.length) return {};
  return parseMapping(0);
}

// ---------------------------------------------------------------------------
// Spec loading + validation
// ---------------------------------------------------------------------------
function loadSpec() {
  const files = [
    'identity.yaml',
    'router.yaml',
    'memory.yaml',
    'telemetry.yaml',
    'automation.yaml',
  ];
  const spec = {};
  for (const f of files) {
    const p = path.join(SPEC_DIR, f);
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = parseYaml(raw);
    if (parsed.schema_version !== SPEC_SCHEMA_VERSION) {
      throw new Error(
        `Refusing to emit: ${f} has schema_version ${parsed.schema_version}, ` +
          `adapter supports ${SPEC_SCHEMA_VERSION}.`
      );
    }
    spec[f.replace('.yaml', '')] = parsed;
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderTemplate(tmpl, vars) {
  // Replace {{name}} and {name} with vars[name]. {{}} wins when both present.
  let out = tmpl;
  // Double-brace first.
  out = out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, k) => {
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  });
  // Single-brace for config.toml.tmpl substitution variables.
  out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => {
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  });
  return out;
}

function renderIdentityFile(spec) {
  const identity = spec.identity;
  const router = spec.router;

  const userBlock = identity.user;
  const stack = identity.stack;

  // Shorthand summary — render as compact sentence.
  const sh = stack.shorthand;
  const shorthandParts = [
    sh.frontend,
    sh.backend,
    sh.styling,
    `state: ${sh.state.server} (server) + ${sh.state.ui} (UI)`,
    sh.background_jobs,
    sh.email,
    sh.cache,
    `obs: ${(sh.observability || []).join(', ')}`,
    sh.payments,
    sh.deployment,
    sh.commits,
  ];
  const stack_shorthand = shorthandParts.filter(Boolean).join('; ');

  // Execution rules: list of single-key objects.
  const execRules = (identity.execution_rules || []).map((r) => {
    const k = Object.keys(r)[0];
    return `- **${prettyKey(k)}:** ${r[k]}`;
  });
  const execution_rules_block = execRules.join('\n');

  // Context discipline: same shape.
  const ctxRules = (identity.context_discipline || []).map((r) => {
    const k = Object.keys(r)[0];
    return `- **${prettyKey(k)}:** ${r[k]}`;
  });
  const context_discipline_block = ctxRules.join('\n');

  // Manual routes table.
  const manualRows = (router.manual_routes || []).map((route) => {
    const triggers = (route.triggers || []).join(', ');
    const target = route.target || {};
    let load;
    if (target.kind === 'local_skill') {
      load = '`' + (target.name || '') + '`' + (target.note ? ' — ' + target.note : '');
    } else {
      load = target.codex || target.generic || target.claude_code || '(unspecified)';
    }
    return `| ${triggers} | ${load} |`;
  });
  const manual_routes_block = manualRows.join('\n');

  const priority_line = (router.priority || []).join('. ') + '.';

  // Auto-local-skills block — Codex has no auto-discovery yet, so emit placeholder rows.
  const auto_local_skills_marker_start = router.auto_local_skills_block
    ? router.auto_local_skills_block.marker_start
    : '<!-- AUTO-LOCAL-SKILLS:START -->';
  const auto_local_skills_marker_end = router.auto_local_skills_block
    ? router.auto_local_skills_block.marker_end
    : '<!-- AUTO-LOCAL-SKILLS:END -->';
  const auto_local_skills_rows =
    '| _(none registered yet — populated by sync-local-skill-router.js when skills land in `~/.codex/skills/`)_ | _ |';

  // Self-healing block.
  const sh_target = identity.self_healing.per_repo_target_lines;
  const sh_sections = (identity.self_healing.required_sections || []).join('** + **');
  const sh_eos = (identity.self_healing.end_of_session_protocol || []).join(', ');

  // Embedded skills block — Codex has no native skill loader; we point at the
  // skills root rather than inlining all bodies (keeps AGENTS.md under 400 lines).
  const embedded_skills_block = [
    '_Skill bodies are stored under_ `~/.codex/skills/<name>/SKILL.md`. _Read the body of the matched skill on demand. The auto-registered table above lists what is currently installed._',
    '',
    '_When the universal layer ships skill content into_ `~/.codex/skills/`, _re-run the adapter and the auto-registered table above will populate from disk._',
  ].join('\n');

  const tmplPath = path.join(TEMPLATES_DIR, 'AGENTS.md.tmpl');
  const tmpl = fs.readFileSync(tmplPath, 'utf8');

  const vars = {
    user_name: userBlock.name,
    address_as: userBlock.address_as,
    location: userBlock.location,
    os: userBlock.os,
    base_path: userBlock.base_path,
    role: userBlock.role,
    certifications: (userBlock.certifications || []).join(', '),
    stack_authoritative_skill: stack.authoritative_skill,
    stack_baseline_doctrine: stack.baseline_doctrine,
    stack_baseline_score: stack.baseline_score,
    stack_shorthand,
    execution_rules_block,
    manual_routes_block,
    priority_line,
    auto_local_skills_marker_start,
    auto_local_skills_marker_end,
    auto_local_skills_rows,
    context_discipline_block,
    project_override_path: identity.project_conventions.override_path,
    project_issue_tracker: identity.project_conventions.issue_tracker,
    project_triage_labels: identity.project_conventions.triage_labels,
    project_domain_single: identity.project_conventions.domain_docs.single,
    project_domain_monorepo: identity.project_conventions.domain_docs.monorepo,
    self_healing_target_lines: sh_target,
    self_healing_sections: sh_sections,
    self_healing_eos: sh_eos,
    embedded_skills_block,
    date: new Date().toISOString().slice(0, 10),
  };

  return renderTemplate(tmpl, vars);
}

function prettyKey(k) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderConfigToml(spec, targetDir) {
  const automation = spec.automation;
  const tmplPath = path.join(TEMPLATES_DIR, 'config.toml.tmpl');
  const tmpl = fs.readFileSync(tmplPath, 'utf8');
  const agentHome = posixify(targetDir);
  const vars = {
    agent_home: agentHome,
    telemetry_skills_path: posixify(path.join(targetDir, 'telemetry', 'skill-invocations.jsonl')),
    telemetry_prompts_path: posixify(path.join(targetDir, 'telemetry', 'prompts.jsonl')),
    codex_noninteractive_flags:
      automation.weekly_prune.agent_invocation.flag_per_platform.codex,
    date: new Date().toISOString().slice(0, 10),
  };
  return renderTemplate(tmpl, vars);
}

function posixify(p) {
  return p.replace(/\\/g, '/');
}

function renderMemoryIndex(spec) {
  const memory = spec.memory;
  const bucketSections = (memory.buckets || [])
    .map(
      (b) =>
        `## ${prettyKey(b.name)}\n_${b.purpose}_\n\n_(entries appended on demand)_\n`
    )
    .join('\n');
  return memory.index_template.replace('{bucket_sections}', bucketSections);
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfChanged(p, content) {
  ensureDir(path.dirname(p));
  let existing = null;
  try {
    existing = fs.readFileSync(p, 'utf8');
  } catch (_) {
    /* missing */
  }
  if (existing === content) return { path: p, changed: false };
  fs.writeFileSync(p, content);
  return { path: p, changed: true };
}

function writeIfChangedExec(p, content) {
  const r = writeIfChanged(p, content);
  try {
    fs.chmodSync(p, 0o755);
  } catch (_) {
    /* non-fatal on Windows */
  }
  return r;
}

// ---------------------------------------------------------------------------
// Merge-safe writers — preserve hand-authored user content on adoption.
// ---------------------------------------------------------------------------
const AF_BLOCK_BEGIN =
  '<!-- AGENTFORGE:BEGIN — managed by AgentForge; edits inside this block are overwritten on re-emit -->';
const AF_BLOCK_END = '<!-- AGENTFORGE:END -->';
// Stable sentinel present in every AgentForge-rendered config.toml header.
const AF_CONFIG_SENTINEL = 'emitted by AgentForge';

function buildManagedBlock(body) {
  return AF_BLOCK_BEGIN + '\n' + String(body).replace(/\s+$/, '') + '\n' + AF_BLOCK_END;
}

// Write an identity file (AGENTS.md) without destroying user content:
//   - no file               -> write the managed block
//   - file has BEGIN/END     -> replace only the block, keep surrounding content
//   - file without markers   -> adoption: prepend the block, preserve the rest
function writeIdentityFile(p, body) {
  const block = buildManagedBlock(body);
  let existing = null;
  try {
    existing = fs.readFileSync(p, 'utf8');
  } catch (_) {
    /* missing */
  }
  if (existing === null) {
    return writeIfChanged(p, block + '\n');
  }
  const b = existing.indexOf(AF_BLOCK_BEGIN);
  const e = existing.indexOf(AF_BLOCK_END);
  if (b !== -1 && e !== -1 && e > b) {
    const before = existing.slice(0, b);
    const after = existing.slice(e + AF_BLOCK_END.length);
    return writeIfChanged(p, before + block + after);
  }
  // Adoption: no markers yet. Keep the user's file, mount the managed block atop it.
  return writeIfChanged(p, block + '\n\n' + existing);
}

// Write config.toml without destroying a user's existing real config:
//   - no file / our own file -> write managed config (idempotent)
//   - user's own config       -> leave it untouched; drop config.agentforge.toml
//                                sidecar carrying the managed config for manual merge.
function writeConfigTomlSafe(targetDir, content) {
  const p = path.join(targetDir, 'config.toml');
  let existing = null;
  try {
    existing = fs.readFileSync(p, 'utf8');
  } catch (_) {
    /* missing */
  }
  if (existing === null || existing.includes(AF_CONFIG_SENTINEL)) {
    return [writeIfChanged(p, content)];
  }
  const sidecar = path.join(targetDir, 'config.agentforge.toml');
  return [
    { path: p, changed: false, preserved: true },
    writeIfChanged(sidecar, content),
  ];
}

function copyScripts(targetDir) {
  const results = [];
  if (!fs.existsSync(ADAPTER_SCRIPTS_DIR)) return results;
  const outDir = path.join(targetDir, 'scripts');
  ensureDir(outDir);
  for (const f of fs.readdirSync(ADAPTER_SCRIPTS_DIR)) {
    const src = path.join(ADAPTER_SCRIPTS_DIR, f);
    if (!fs.statSync(src).isFile()) continue;
    const content = fs.readFileSync(src, 'utf8');
    results.push(writeIfChangedExec(path.join(outDir, f), content));
  }
  return results;
}

function copyUniversalInstallers(targetDir) {
  // Copy universal/lib/installers/* into <target>/scripts/installers/ byte-identical.
  // The adapter's scripts/install-cron.sh wrapper invokes the universal one.
  const results = [];
  if (!fs.existsSync(UNIVERSAL_INSTALLERS_DIR)) return results;
  const outDir = path.join(targetDir, 'scripts', 'installers');
  ensureDir(outDir);
  for (const f of fs.readdirSync(UNIVERSAL_INSTALLERS_DIR)) {
    const src = path.join(UNIVERSAL_INSTALLERS_DIR, f);
    if (!fs.statSync(src).isFile()) continue;
    const content = fs.readFileSync(src, 'utf8');
    results.push(writeIfChangedExec(path.join(outDir, f), content));
  }
  return results;
}

function writeCronEntry(spec, targetDir) {
  const a = spec.automation.weekly_prune;
  const cronLine =
    `# ${a.name} — installed by adapters/codex/scripts/install-cron.sh\n` +
    `${a.schedule.cron_local} ${posixify(path.join(targetDir, 'scripts', 'auto-prune-weekly.sh'))}\n`;
  return writeIfChanged(path.join(targetDir, 'crontab.entry'), cronLine);
}

function writeMemoryStructure(spec, targetDir) {
  const results = [];
  const memory = spec.memory;
  for (const b of memory.buckets || []) {
    const dir = path.join(targetDir, 'memory', b.name);
    ensureDir(dir);
    // .gitkeep so the bucket survives git checkpoints when empty.
    results.push(writeIfChanged(path.join(dir, '.gitkeep'), ''));
    if (b.seed && Array.isArray(b.seeded_files)) {
      for (const sf of b.seeded_files) {
        results.push(writeIfChanged(path.join(dir, sf.name), sf.template || ''));
      }
    }
  }
  // MEMORY.md index.
  results.push(writeIfChanged(path.join(targetDir, 'MEMORY.md'), renderMemoryIndex(spec)));
  return results;
}

function writeTelemetrySinks(targetDir) {
  const dir = path.join(targetDir, 'telemetry');
  ensureDir(dir);
  // Create empty sinks if missing; do not truncate existing data.
  const results = [];
  for (const f of ['skill-invocations.jsonl', 'prompts.jsonl', 'auto-prune.log']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, '');
      results.push({ path: p, changed: true });
    } else {
      results.push({ path: p, changed: false });
    }
  }
  return results;
}

function gitCheckpoint(targetDir) {
  // Best-effort checkpoint of a PRE-EXISTING repo. Never `git init` a fresh
  // target: that would sweep unrelated target contents (e.g. ~/.codex secrets
  // like .credentials.json / auth.json) into a new repo via `git add -A`.
  // Mirrors the cursor adapter. Never fail the emit.
  try {
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: targetDir, stdio: 'ignore' });
    } catch (_) {
      // Target is not a git repo — skip the checkpoint, do not create one.
      return null;
    }
    execFileSync('git', ['add', '-A'], { cwd: targetDir, stdio: 'ignore' });
    // Only commit if there are staged changes.
    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: targetDir, stdio: 'ignore' });
      return null;
    } catch (_) {
      execFileSync(
        'git',
        ['-c', 'user.email=agentforge@local', '-c', 'user.name=AgentForge', 'commit', '-q', '-m', 'agentforge(codex): emit'],
        { cwd: targetDir, stdio: 'ignore' }
      );
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: targetDir, encoding: 'utf8' }).trim();
    }
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('Usage: node adapters/codex/emit.js <target-dir>\n');
    process.exit(2);
  }
  const targetDir = path.resolve(target);
  ensureDir(targetDir);

  const spec = loadSpec();

  const results = [];
  results.push(writeIdentityFile(path.join(targetDir, 'AGENTS.md'), renderIdentityFile(spec)));
  results.push(...writeConfigTomlSafe(targetDir, renderConfigToml(spec, targetDir)));
  results.push(...writeMemoryStructure(spec, targetDir));
  results.push(...writeTelemetrySinks(targetDir));
  results.push(...copyScripts(targetDir));
  results.push(...copyUniversalInstallers(targetDir));
  results.push(writeCronEntry(spec, targetDir));

  const checkpoint = gitCheckpoint(targetDir);

  const summary = {
    target: targetDir,
    checkpoint_sha: checkpoint,
    files_written: results.length,
    files_changed: results.filter((r) => r.changed).length,
    details: results.map((r) => ({
      path: path.relative(targetDir, r.path),
      changed: r.changed,
    })),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write('emit failed: ' + e.message + '\n');
    process.exit(1);
  }
}

module.exports = { parseYaml, loadSpec, renderIdentityFile, renderConfigToml };
