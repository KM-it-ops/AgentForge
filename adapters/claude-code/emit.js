#!/usr/bin/env node
// AgentForge — Claude Code adapter emit.
// Reads spec/*.yaml and emits a Claude Code config tree at <target>.
//
// Usage:
//   node emit.js <target-dir>
//   node emit.js ~/.claude
//   node emit.js C:/tmp/agentforge-test-claude
//
// Idempotent. Reversible via git checkpoint created in <target>.
// Template syntax: Mustache-style {{variable}}.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const SCHEMA_VERSION = 1;
const ADAPTER_DIR = __dirname;
const REPO_ROOT = path.resolve(ADAPTER_DIR, "..", "..");
const SPEC_DIR = path.join(REPO_ROOT, "spec");
const TEMPLATES_DIR = path.join(ADAPTER_DIR, "templates");
const SCRIPTS_DIR = path.join(ADAPTER_DIR, "scripts");

// ---------------------------------------------------------------------------
// Minimal YAML loader (subset sufficient for our spec files).
// Supports: nested maps via indentation, scalars, quoted strings, lists
// (dash items + inline flow `[a, b]`), block scalars `|` and `>`, comments.
// Refuses anchors/aliases/complex types — those aren't in our spec.
// ---------------------------------------------------------------------------

function tryLoadJsYaml() {
  try {
    return require("js-yaml");
  } catch {
    return null;
  }
}

function parseYaml(text) {
  const lib = tryLoadJsYaml();
  if (lib) return lib.load(text);
  return miniYaml(text);
}

function miniYaml(text) {
  text = text.replace(/\r\n/g, "\n");
  // Strip whole-line and trailing comments — but only where `#` is at the start
  // of the line (after whitespace) OR preceded by a whitespace character.
  // Block-scalar contents are handled by NOT stripping inside `# Memory Index`-style
  // lines: those have `#` preceded by spaces but FOLLOWED by non-space and the
  // line is inside a block-scalar — detect block-scalar ranges first.
  const rawLines = text.split("\n");
  // Pass 1: mark line indices inside block scalars.
  const inBlock = new Array(rawLines.length).fill(false);
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(/^(\s*)[^:#\s][^:]*:\s*([|>])\s*(?:[+-]\d*|\d+[+-]?)?\s*$/);
    if (!m) continue;
    const baseIndent = m[1].length;
    let j = i + 1;
    while (j < rawLines.length) {
      const ln = rawLines[j];
      if (/^\s*$/.test(ln)) { inBlock[j] = true; j++; continue; }
      const ind = ln.match(/^(\s*)/)[1].length;
      if (ind <= baseIndent) break;
      inBlock[j] = true;
      j++;
    }
  }
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let raw = rawLines[i];
    if (inBlock[i]) { lines.push(raw.replace(/\s+$/, "")); continue; }
    // strip trailing comments naively, respecting quotes and `#`-with-prev-space rule
    let inS = false, inD = false, cut = -1;
    for (let k = 0; k < raw.length; k++) {
      const c = raw[k];
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (c === "#" && !inS && !inD) {
        const prev = k === 0 ? " " : raw[k - 1];
        if (prev === " " || prev === "\t") { cut = k; break; }
      }
    }
    if (cut >= 0) raw = raw.slice(0, cut);
    lines.push(raw.replace(/\s+$/, ""));
  }

  let i = 0;
  function indent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }
  function isBlank(line) {
    return !line || /^\s*$/.test(line);
  }

  function unquote(v) {
    v = v.trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
    }
    if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
      return v.slice(1, -1).replace(/''/g, "'");
    }
    return v;
  }

  function parseScalar(v) {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    if (t === "") return null;
    if (t === "null" || t === "~") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    return unquote(t);
  }

  function parseFlow(v) {
    v = v.trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      if (!inner) return [];
      // split on commas, respecting quotes
      const items = [];
      let cur = "", inS = false, inD = false, depth = 0;
      for (const c of inner) {
        if (c === "'" && !inD) { inS = !inS; cur += c; }
        else if (c === '"' && !inS) { inD = !inD; cur += c; }
        else if ((c === "[" || c === "{") && !inS && !inD) { depth++; cur += c; }
        else if ((c === "]" || c === "}") && !inS && !inD) { depth--; cur += c; }
        else if (c === "," && !inS && !inD && depth === 0) { items.push(cur); cur = ""; }
        else cur += c;
      }
      if (cur.trim()) items.push(cur);
      return items.map((s) => parseScalar(s));
    }
    return parseScalar(v);
  }

  function readBlockScalar(baseIndent, style) {
    // style: '|' (literal) or '>' (folded)
    const collected = [];
    let minIndent = null;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { collected.push(""); i++; continue; }
      const ind = indent(line);
      if (ind <= baseIndent) break;
      if (minIndent === null) minIndent = ind;
      collected.push(line.slice(minIndent));
      i++;
    }
    // trim trailing blanks
    while (collected.length && collected[collected.length - 1] === "") collected.pop();
    if (style === "|") return collected.join("\n") + "\n";
    // folded: join with spaces, blank lines become newlines
    const out = [];
    let para = [];
    for (const ln of collected) {
      if (ln === "") {
        if (para.length) { out.push(para.join(" ")); para = []; }
        out.push("");
      } else {
        para.push(ln);
      }
    }
    if (para.length) out.push(para.join(" "));
    return out.join("\n") + "\n";
  }

  // Consume a multi-line flow value [ ... ] or { ... } starting at lines[j].
  // Returns { value, nextI } where nextI is the line index after the closer.
  function consumeMultilineFlow(j) {
    const childText = lines[j].slice(indent(lines[j]));
    const opener = childText[0];
    const closer = opener === "[" ? "]" : "}";
    let buf = "";
    let depth = 0, inS = false, inD = false, done = false;
    let k = j;
    while (k < lines.length && !done) {
      const l = lines[k];
      for (const c of l) {
        if (c === "'" && !inD) inS = !inS;
        else if (c === '"' && !inS) inD = !inD;
        else if (!inS && !inD) {
          if (c === opener) depth++;
          else if (c === closer) { depth--; }
        }
        buf += c;
        if (depth === 0 && c === closer) { done = true; break; }
      }
      if (!done) buf += " ";
      k++;
    }
    return { value: parseFlow(buf.trim()), nextI: k };
  }

  function parseMap(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }
      const ind = indent(line);
      if (ind < baseIndent) return obj;
      if (ind > baseIndent) {
        throw new Error(`unexpected indent at line ${i + 1}: '${line}'`);
      }
      const trimmed = line.slice(ind);
      if (trimmed.startsWith("- ")) return obj; // caller will handle as list
      const kv = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!kv) throw new Error(`expected key:value at line ${i + 1}: '${line}'`);
      const key = kv[1].trim();
      const rest = kv[2];
      i++;
      if (rest === "" || rest === undefined) {
        // value is on subsequent indented lines (map or list, or multi-line flow)
        // skip blanks
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) { obj[key] = null; continue; }
        const childIndent = indent(lines[j]);
        if (childIndent <= baseIndent) { obj[key] = null; continue; }
        const childText = lines[j].slice(childIndent);
        // multi-line flow sequence/mapping starting with [ or {
        if (childText.startsWith("[") || childText.startsWith("{")) {
          const r = consumeMultilineFlow(j);
          obj[key] = r.value;
          i = r.nextI;
          continue;
        }
        i = j;
        if (lines[j].slice(childIndent).startsWith("- ")) {
          obj[key] = parseList(childIndent);
        } else {
          obj[key] = parseMap(childIndent);
        }
      } else if (rest === "|" || rest === ">") {
        obj[key] = readBlockScalar(baseIndent, rest);
      } else if (rest.trim().startsWith("[") || rest.trim().startsWith("{")) {
        obj[key] = parseFlow(rest);
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  function parseList(baseIndent) {
    const arr = [];
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }
      const ind = indent(line);
      if (ind < baseIndent) return arr;
      const trimmed = line.slice(ind);
      if (!trimmed.startsWith("- ")) return arr;
      const after = trimmed.slice(2);
      i++;
      if (after === "" || after === undefined) {
        // child block follows
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) { arr.push(null); continue; }
        const childIndent = indent(lines[j]);
        if (childIndent <= baseIndent) { arr.push(null); continue; }
        i = j;
        if (lines[j].slice(childIndent).startsWith("- ")) {
          arr.push(parseList(childIndent));
        } else {
          arr.push(parseMap(childIndent));
        }
      } else if (/^[^:]+:\s*(.*)$/.test(after) && !after.trim().startsWith("[") && !after.trim().startsWith("{") && !/^["'].*["']$/.test(after)) {
        // inline map item: "- key: val\n  key2: val2"
        const kv = after.match(/^([^:]+):\s*(.*)$/);
        if (kv) {
          // synthesize a sub-map starting from current line; rewind one and re-parse a map at deeper indent
          // The item starts at indent baseIndent+2.
          const item = {};
          const itemIndent = baseIndent + 2;
          const k = kv[1].trim();
          const v = kv[2];
          if (v === "" || v === undefined) {
            // child of this key
            let j = i;
            while (j < lines.length && isBlank(lines[j])) j++;
            if (j < lines.length && indent(lines[j]) > itemIndent) {
              const ct = lines[j].slice(indent(lines[j]));
              if (ct.startsWith("[") || ct.startsWith("{")) {
                const r = consumeMultilineFlow(j);
                item[k] = r.value;
                i = r.nextI;
              } else {
                i = j;
                if (ct.startsWith("- ")) item[k] = parseList(indent(lines[j]));
                else item[k] = parseMap(indent(lines[j]));
              }
            } else {
              item[k] = null;
            }
          } else if (v === "|" || v === ">") {
            item[k] = readBlockScalar(itemIndent, v);
          } else if (v.trim().startsWith("[") || v.trim().startsWith("{")) {
            item[k] = parseFlow(v);
          } else {
            item[k] = parseScalar(v);
          }
          // continue with remaining keys at itemIndent
          while (i < lines.length) {
            const nl = lines[i];
            if (isBlank(nl)) { i++; continue; }
            const ni = indent(nl);
            if (ni < itemIndent) break;
            if (ni > itemIndent) {
              throw new Error(`unexpected deeper indent at line ${i + 1}`);
            }
            const nt = nl.slice(ni);
            if (nt.startsWith("- ")) break;
            const nkv = nt.match(/^([^:]+):\s*(.*)$/);
            if (!nkv) break;
            const nk = nkv[1].trim();
            const nv = nkv[2];
            i++;
            if (nv === "" || nv === undefined) {
              let jj = i;
              while (jj < lines.length && isBlank(lines[jj])) jj++;
              if (jj < lines.length && indent(lines[jj]) > itemIndent) {
                const ct2 = lines[jj].slice(indent(lines[jj]));
                if (ct2.startsWith("[") || ct2.startsWith("{")) {
                  const r2 = consumeMultilineFlow(jj);
                  item[nk] = r2.value;
                  i = r2.nextI;
                } else {
                  i = jj;
                  if (ct2.startsWith("- ")) item[nk] = parseList(indent(lines[jj]));
                  else item[nk] = parseMap(indent(lines[jj]));
                }
              } else item[nk] = null;
            } else if (nv === "|" || nv === ">") {
              item[nk] = readBlockScalar(itemIndent, nv);
            } else if (nv.trim().startsWith("[") || nv.trim().startsWith("{")) {
              item[nk] = parseFlow(nv);
            } else {
              item[nk] = parseScalar(nv);
            }
          }
          arr.push(item);
          continue;
        }
      } else if (after.trim().startsWith("[") || after.trim().startsWith("{")) {
        arr.push(parseFlow(after));
      } else {
        arr.push(parseScalar(after));
      }
    }
    return arr;
  }

  // skip leading blanks
  while (i < lines.length && isBlank(lines[i])) i++;
  return parseMap(0);
}

// ---------------------------------------------------------------------------
// Spec loader
// ---------------------------------------------------------------------------

function loadSpec() {
  const files = ["identity.yaml", "router.yaml", "memory.yaml", "telemetry.yaml", "automation.yaml"];
  const spec = {};
  for (const f of files) {
    const p = path.join(SPEC_DIR, f);
    if (!fs.existsSync(p)) abort(`spec file missing: ${p}`);
    const text = fs.readFileSync(p, "utf8");
    const parsed = parseYaml(text);
    if (!parsed || typeof parsed !== "object") abort(`failed to parse ${f}`);
    if (parsed.schema_version !== SCHEMA_VERSION) {
      abort(`schema_version mismatch in ${f}: expected ${SCHEMA_VERSION}, got ${parsed.schema_version}`);
    }
    spec[f.replace(".yaml", "")] = parsed;
  }
  return spec;
}

function abort(msg) {
  console.error(`\n[agentforge:claude-code] ABORT: ${msg}\n`);
  console.error(`No files written. Resolve the spec gap and re-run.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function expandTarget(arg) {
  if (!arg) abort("missing required CLI arg: target directory");
  let p = arg;
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

function toNative(p) {
  // forward slashes for Bash, but Bash on Windows tolerates C:/...
  return p.replace(/\\/g, "/");
}

function toPosix(p) {
  // /c/Users/... style for Git-Bash hook commands
  let f = p.replace(/\\/g, "/");
  const m = f.match(/^([A-Za-z]):\/(.*)$/);
  if (m) return `/${m[1].toLowerCase()}/${m[2]}`;
  return f;
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function render(tmpl, vars) {
  return tmpl.replace(/\{\{([\w_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) {
      abort(`template variable not provided: {{${k}}}`);
    }
    return vars[k];
  });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfChanged(p, content) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p)) {
    const prev = fs.readFileSync(p, "utf8");
    if (prev === content) return false;
  }
  fs.writeFileSync(p, content);
  return true;
}

// ---------------------------------------------------------------------------
// Builders for CLAUDE.md sections
// ---------------------------------------------------------------------------

function buildIdentityVars(identity) {
  const u = identity.user || {};
  const stack = identity.stack || {};
  const sh = stack.shorthand || {};

  function req(v, name) {
    if (v === undefined || v === null || v === "") abort(`identity.${name} missing or empty`);
    return v;
  }

  const certs = Array.isArray(u.certifications) ? u.certifications.join(", ") : (u.certifications || "");
  const observability = Array.isArray(sh.observability) ? sh.observability.join(" + ") : (sh.observability || "");
  const stateServer = sh.state && sh.state.server ? sh.state.server : "";
  const stateUi = sh.state && sh.state.ui ? sh.state.ui : "";

  // Reassemble to match the original CLAUDE.md cadence:
  // "... TanStack Query (server) + Zustand (UI), ..., Vercel. Conventional commits, squash merge."
  const stateCombined = (stateServer && stateUi)
    ? `${stateServer} (server) + ${stateUi} (UI)`
    : (stateServer ? `${stateServer} (server)` : (stateUi ? `${stateUi} (UI)` : ""));
  const preCommits = [
    sh.frontend,
    sh.backend,
    sh.styling,
    stateCombined,
    sh.background_jobs,
    sh.email,
    sh.cache,
    observability,
    sh.payments,
    sh.deployment,
  ].filter(Boolean).join(", ");
  // Capitalize the first word of commits ("conventional" -> "Conventional") and join with period.
  let commits = sh.commits || "";
  if (commits) commits = commits.charAt(0).toUpperCase() + commits.slice(1);
  const stackShorthand = commits ? `${preCommits}. ${commits}` : preCommits;

  // Execution rules — render with the exact bolded labels in the original.
  const labelMap = {
    act_first: "Act first.",
    strict_typescript: "Strict TypeScript.",
    secrets: "Never commit `.env` or secrets.",
    confidence_rule: "95% Confidence Rule:",
    time_format: "Time format:",
    db_rls: "DB:",
  };
  const ruleLines = [];
  let idx = 1;
  for (const entry of identity.execution_rules || []) {
    const key = Object.keys(entry)[0];
    const val = entry[key];
    const label = labelMap[key];
    if (!label) abort(`unknown execution_rule key: ${key}`);
    // For keys whose label already IS the value (secrets), don't repeat
    if (key === "secrets") {
      ruleLines.push(`${idx}. **${label}**`);
    } else if (key === "act_first" || key === "strict_typescript") {
      ruleLines.push(`${idx}. **${label}** ${val}`);
    } else {
      ruleLines.push(`${idx}. **${label}** ${val}`);
    }
    idx++;
  }
  const execBlock = ruleLines.join("\n");

  // Context discipline bullets
  const ctxMap = {
    compact_threshold: (v) => `\`/compact\` at >60% used. \`/clear\` only when switching domains.`,
    skill_load_cap: () => `Max 2 full skills loaded + 1 summary. Never bulk-load.`,
    file_mentions: () => `Prefer \`@file\` mentions over broad codebase searches.`,
    no_duplicate_calls: () => `**Don't fire duplicate tool calls** — output is re-billed.`,
    no_risky_batches: () => `**Don't batch a risky Bash with Edits/Reads in one message** — sibling cancel risk.`,
    python_quoting: () => `\`python -c\`: single-quote OUTER; for anything non-trivial use a temp \`.py\`.`,
    long_jobs: () => `Long jobs: background + ONE completion signal (no per-line polling).`,
  };
  const ctxLines = [];
  for (const entry of identity.context_discipline || []) {
    const key = Object.keys(entry)[0];
    if (!ctxMap[key]) abort(`unknown context_discipline key: ${key}`);
    ctxLines.push(`- ${ctxMap[key](entry[key])}`);
  }
  const ctxBlock = ctxLines.join("\n");

  // Self-healing
  const sh2 = identity.self_healing || {};
  const sections = Array.isArray(sh2.required_sections) ? sh2.required_sections.join("** + **") : "";
  const eos = Array.isArray(sh2.end_of_session_protocol) ? sh2.end_of_session_protocol.join(" + ") : "";

  // Project conventions
  const pc = identity.project_conventions || {};
  const dd = pc.domain_docs || {};

  return {
    user_name: req(u.name, "user.name"),
    address_as: req(u.address_as, "user.address_as"),
    location: req(u.location, "user.location"),
    os: req(u.os, "user.os"),
    base_path: req(u.base_path, "user.base_path"),
    role: req(u.role, "user.role"),
    certifications: certs,
    stack_authoritative_skill: req(stack.authoritative_skill, "stack.authoritative_skill"),
    stack_baseline_score: req(stack.baseline_score, "stack.baseline_score"),
    stack_baseline_doctrine: req(stack.baseline_doctrine, "stack.baseline_doctrine"),
    stack_shorthand: stackShorthand,
    execution_rules_block: execBlock,
    context_discipline_block: ctxBlock,
    project_override_path: req(pc.override_path, "project_conventions.override_path"),
    project_issue_tracker: req(pc.issue_tracker, "project_conventions.issue_tracker"),
    project_triage_labels: req(pc.triage_labels, "project_conventions.triage_labels"),
    project_domain_single: req(dd.single, "project_conventions.domain_docs.single"),
    project_domain_monorepo: req(dd.monorepo, "project_conventions.domain_docs.monorepo"),
    self_healing_target_lines: req(sh2.per_repo_target_lines, "self_healing.per_repo_target_lines"),
    self_healing_sections: sections,
    self_healing_eos: eos,
  };
}

function buildRouterVars(router) {
  const platformKey = "claude_code";
  const rows = [];
  for (const route of router.manual_routes || []) {
    const triggers = Array.isArray(route.triggers) ? route.triggers.join(", ") : route.triggers;
    const t = route.target || {};
    let load;
    if (t.kind === "local_skill") {
      const note = t.note ? ` (${t.note})` : "";
      load = `\`${t.name}\` local skill${note}`;
    } else if (t.kind === "plugin_or_skill") {
      const val = t[platformKey];
      if (!val) abort(`router route ${route.id} missing target.${platformKey}`);
      // wrap backticks around bare names in the original format — values already contain them.
      load = val;
    } else {
      abort(`unknown route target.kind: ${t.kind} (route ${route.id})`);
    }
    rows.push(`| ${triggers} | ${load} |`);
  }
  const priorityList = Array.isArray(router.priority) ? router.priority : [];
  // Original: "explicit `/slash` invocation wins. Else first-match wins. Else, no skill load."
  const priorityLine = priorityList
    .map((s) => {
      if (s === "explicit slash invocation") return "explicit `/slash` invocation wins";
      if (s === "first match wins") return "Else first-match wins";
      if (s === "no skill load") return "Else, no skill load";
      return s;
    })
    .join(". ") + ".";

  const block = router.auto_local_skills_block || {};
  return {
    manual_routes_block: rows.join("\n"),
    priority_line: priorityLine,
    auto_local_skills_marker_start: block.marker_start || "<!-- AUTO-LOCAL-SKILLS:START -->",
    auto_local_skills_marker_end: block.marker_end || "<!-- AUTO-LOCAL-SKILLS:END -->",
    auto_local_skills_rows: "<!-- populated at runtime by sync-local-skill-router.js -->",
  };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

function buildMemoryFiles(memory, targetDir) {
  const buckets = memory.buckets || [];
  const written = [];

  // Create bucket dirs and seeded files
  for (const b of buckets) {
    const dir = path.join(targetDir, "memory", b.name);
    ensureDir(dir);
    if (b.seed && Array.isArray(b.seeded_files)) {
      for (const sf of b.seeded_files) {
        const p = path.join(dir, sf.name);
        if (!fs.existsSync(p)) {
          fs.writeFileSync(p, sf.template);
          written.push(p);
        }
      }
    }
  }

  // MEMORY.md index
  const sections = buckets.map((b) => {
    return `## ${b.name}\n\n${b.purpose}\n\nFiles: \`memory/${b.name}/\``;
  }).join("\n\n");
  const idx = (memory.index_template || "").replace("{bucket_sections}", sections);
  const idxPath = path.join(targetDir, "MEMORY.md");
  if (writeIfChanged(idxPath, idx)) written.push(idxPath);

  return written;
}

// ---------------------------------------------------------------------------
// Hook scripts
// ---------------------------------------------------------------------------

function emitHookScripts(targetDir, vars) {
  const dest = path.join(targetDir, "hooks", "scripts");
  ensureDir(dest);
  const scripts = [
    "log-skill-invocation.sh",
    "log-prompt.sh",
    "log-session-end.sh",
    "dead-skills-report.sh",
    "auto-prune-weekly.sh",
  ];
  const written = [];
  for (const s of scripts) {
    const src = fs.readFileSync(path.join(SCRIPTS_DIR, s), "utf8");
    const rendered = render(src, vars);
    const out = path.join(dest, s);
    if (writeIfChanged(out, rendered)) written.push(out);
    try { fs.chmodSync(out, 0o755); } catch {}
  }
  // sync-local-skill-router.js: copy verbatim (it uses os.homedir() so portable)
  const syncSrc = path.join(path.dirname(__dirname), "..", "universal", "lib", "sync-local-skill-router.js");
  let syncContent;
  if (fs.existsSync(syncSrc)) {
    syncContent = fs.readFileSync(syncSrc, "utf8");
  } else {
    // fallback: use the version under user's .claude (reference) — but only if we're not in test
    // Build a portable version inline.
    syncContent = portableSyncScript();
  }
  const syncDest = path.join(dest, "sync-local-skill-router.js");
  if (writeIfChanged(syncDest, syncContent)) written.push(syncDest);
  try { fs.chmodSync(syncDest, 0o755); } catch {}
  return written;
}

function portableSyncScript() {
  // Inline portable version. Uses CLAUDE_HOME env var with os.homedir() fallback.
  return `#!/usr/bin/env node
// Sync AUTO-LOCAL-SKILLS section of CLAUDE.md from skills/*/SKILL.md.
// Portable: honors $CLAUDE_HOME env var, else ~/.claude.
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
const CLAUDE_MD = path.join(HOME, "CLAUDE.md");
const SKILLS_DIR = path.join(HOME, "skills");
const START = "<!-- AUTO-LOCAL-SKILLS:START";
const END = "<!-- AUTO-LOCAL-SKILLS:END -->";

function parseFrontmatter(text) {
  text = text.replace(/\\r\\n/g, "\\n");
  const m = text.match(/^---\\s*\\n([\\s\\S]*?)\\n---/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split("\\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([\\w-]+):\\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if (val === ">" || val === "|") {
      const collected = [];
      let j = i + 1;
      while (j < lines.length && /^\\s+\\S/.test(lines[j])) { collected.push(lines[j].trim()); j++; }
      val = collected.join(val === ">" ? " " : "\\n");
      i = j - 1;
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    out[key] = val;
  }
  return out;
}

function condense(desc, maxLen = 110) {
  if (!desc) return "(no description)";
  let s = desc.split(/(?<=[.!?])\\s/)[0].replace(/\\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen - 1).trim() + "\\u2026";
  return s;
}

function listLocalSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.name !== "_archived" && !d.name.startsWith(".") && (d.isDirectory() || d.isSymbolicLink()))
    .map((d) => d.name).sort();
}

function readSkill(name) {
  const f = path.join(SKILLS_DIR, name, "SKILL.md");
  if (!fs.existsSync(f)) return null;
  const fm = parseFrontmatter(fs.readFileSync(f, "utf8"));
  return { name, description: (fm && fm.description) || "(no description in frontmatter)" };
}

function buildBlock(skills) {
  const rows = skills.map((s) => "| \`" + s.name + "\` | " + condense(s.description) + " |").join("\\n");
  return [
    "<!-- AUTO-LOCAL-SKILLS:START — managed by hooks/scripts/sync-local-skill-router.js; do not hand-edit between these markers -->",
    "### Local skills (auto-registered)",
    "| Local skill | Trigger keywords |",
    "|---|---|",
    rows,
    "<!-- AUTO-LOCAL-SKILLS:END -->",
  ].join("\\n");
}

function main() {
  if (!fs.existsSync(CLAUDE_MD)) { console.error("CLAUDE.md not found at", CLAUDE_MD); process.exit(0); }
  const skills = listLocalSkills().map(readSkill).filter(Boolean);
  if (!skills.length) process.exit(0);
  const md = fs.readFileSync(CLAUDE_MD, "utf8");
  const startIdx = md.indexOf(START);
  const endIdx = md.indexOf(END);
  if (startIdx === -1 || endIdx === -1) { console.error("AUTO-LOCAL-SKILLS markers missing in CLAUDE.md; skipping sync."); process.exit(0); }
  const before = md.slice(0, startIdx);
  const after = md.slice(endIdx + END.length);
  const next = before + buildBlock(skills) + after;
  if (next !== md) { fs.writeFileSync(CLAUDE_MD, next); console.log("sync-local-skill-router: updated " + skills.length + " local skill rows"); }
}

try { main(); } catch (e) { console.error("sync-local-skill-router error:", e.message); }
process.exit(0);
`;
}

// ---------------------------------------------------------------------------
// Git checkpoint
// ---------------------------------------------------------------------------

function gitCheckpoint(targetDir) {
  const gitDir = path.join(targetDir, ".git");
  try {
    if (!fs.existsSync(gitDir)) {
      execSync("git init", { cwd: targetDir, stdio: "pipe" });
    }
    // stage everything and commit if there's anything to commit
    execSync("git add -A", { cwd: targetDir, stdio: "pipe" });
    try {
      execSync('git -c user.email=agentforge@local -c user.name=AgentForge commit -m "chore: agentforge claude-code checkpoint"', {
        cwd: targetDir, stdio: "pipe",
      });
    } catch (e) {
      // nothing to commit — fine
    }
  } catch (e) {
    console.warn(`[agentforge] git checkpoint skipped: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const targetArg = process.argv[2];
  const target = expandTarget(targetArg);
  console.log(`[agentforge:claude-code] target=${target}`);

  const spec = loadSpec();

  // Pre-checkpoint
  ensureDir(target);
  gitCheckpoint(target);

  // Build template variables
  const dateStr = new Date().toISOString().slice(0, 10);
  const idVars = buildIdentityVars(spec.identity);
  const rtVars = buildRouterVars(spec.router);

  const claudeVars = {
    ...idVars,
    ...rtVars,
    date: dateStr,
  };

  // CLAUDE.md
  const claudeTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "CLAUDE.md.tmpl"), "utf8");
  const claudeMd = render(claudeTmpl, claudeVars);
  const claudeMdPath = path.join(target, "CLAUDE.md");
  // For idempotency, strip the timestamp comment line before comparing? No — date is in the template
  // but reproducibility requires stable output. We persist the date file separately and reuse it.
  const dateMarkerPath = path.join(target, ".agentforge-emit-date");
  let effectiveDate = dateStr;
  if (fs.existsSync(claudeMdPath) && fs.existsSync(dateMarkerPath)) {
    effectiveDate = fs.readFileSync(dateMarkerPath, "utf8").trim();
  }
  const claudeVars2 = { ...claudeVars, date: effectiveDate };
  const claudeMd2 = render(claudeTmpl, claudeVars2);
  const wroteClaude = writeIfChanged(claudeMdPath, claudeMd2);
  if (wroteClaude) fs.writeFileSync(dateMarkerPath, effectiveDate);

  // settings.json
  const settingsTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "settings.json.tmpl"), "utf8");
  const agentHomeNative = toNative(target);
  const agentHomePosix = toPosix(target);
  const settingsVars = { agent_home_native: agentHomeNative, agent_home_posix: agentHomePosix };
  const settings = render(settingsTmpl, settingsVars);
  // Validate JSON
  try { JSON.parse(settings); } catch (e) { abort(`settings.json render produced invalid JSON: ${e.message}`); }
  writeIfChanged(path.join(target, "settings.json"), settings);

  // Hook scripts
  const auto = spec.automation || {};
  const safety = auto.safety || {};
  const inv = auto.weekly_prune && auto.weekly_prune.agent_invocation || {};
  const flagsPerPlatform = inv.flag_per_platform || {};
  const hookVars = {
    agent_home_native: agentHomeNative,
    agent_home_posix: agentHomePosix,
    grace_period_days: safety.grace_period_days != null ? safety.grace_period_days : 60,
    agent_invocation_flags: flagsPerPlatform.claude_code || "--print --dangerously-skip-permissions",
  };
  emitHookScripts(target, hookVars);

  // Memory
  buildMemoryFiles(spec.memory, target);

  // Skills stub
  ensureDir(path.join(target, "skills"));
  const skillsReadme = path.join(target, "skills", "README.md");
  if (!fs.existsSync(skillsReadme)) {
    fs.writeFileSync(skillsReadme,
      "# Local skills\n\nDrop SKILL.md-prefixed directories here. The sync-local-skill-router.js\nhook will register them in CLAUDE.md automatically.\n");
  }

  // Telemetry dir
  ensureDir(path.join(target, "telemetry"));

  // install-task.ps1 (verbatim copy — it's parametric)
  const psSrc = fs.readFileSync(path.join(SCRIPTS_DIR, "install-task.ps1"), "utf8");
  ensureDir(path.join(target, "hooks", "scripts"));
  writeIfChanged(path.join(target, "hooks", "scripts", "install-task.ps1"), psSrc);

  console.log(`[agentforge:claude-code] emit complete`);
  console.log(`  Run hooks/scripts/install-task.ps1 (PowerShell) to register the weekly task.`);
}

if (require.main === module) main();
