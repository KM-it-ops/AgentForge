#!/usr/bin/env node
// AgentForge — Gemini CLI adapter emit.
// Reads spec/*.yaml and emits a Gemini CLI config tree at <target>.
//
// Usage:
//   node emit.js <target-dir>
//   node emit.js ~/.gemini
//   node emit.js C:/tmp/agentforge-test-gemini
//
// Structural twin of the claude-code adapter: a JSON settings file
// (settings.json) plus a Markdown context file (GEMINI.md, the default
// Gemini CLI contextFileName). Unlike claude-code, Gemini CLI has NO arbitrary
// lifecycle shell hooks, so settings.json carries only mcpServers + the native
// OpenTelemetry block, and prune automation is scheduler-driven (cron / Task
// Scheduler) rather than event-driven.
//
// Idempotent. Reversible via a git checkpoint created in <target> ONLY when the
// target is already a git repo (never `git init` a fresh target).
// Template syntax: Mustache-style {{variable}}.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const SCHEMA_VERSION = 1;
// Optional MCP module path (overridable for tests via AGENTFORGE_MCP_SPEC).
const MCP_SPEC_PATH = process.env.AGENTFORGE_MCP_SPEC || null;
const ADAPTER_DIR = __dirname;
const REPO_ROOT = path.resolve(ADAPTER_DIR, "..", "..");
const SPEC_DIR = path.join(REPO_ROOT, "spec");
const TEMPLATES_DIR = path.join(ADAPTER_DIR, "templates");
const SCRIPTS_DIR = path.join(ADAPTER_DIR, "scripts");
const UNIVERSAL_INSTALLERS_DIR = path.join(REPO_ROOT, "universal", "lib", "installers");

// ---------------------------------------------------------------------------
// Minimal YAML loader (subset sufficient for our spec files).
// Copied verbatim from the claude-code adapter so this adapter stays standalone
// inside the npm tarball with ZERO runtime dependencies. NEVER require js-yaml
// directly — tryLoadJsYaml() opportunistically uses it only if already present.
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
    while (collected.length && collected[collected.length - 1] === "") collected.pop();
    if (style === "|") return collected.join("\n") + "\n";
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
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) { obj[key] = null; continue; }
        const childIndent = indent(lines[j]);
        if (childIndent <= baseIndent) { obj[key] = null; continue; }
        const childText = lines[j].slice(childIndent);
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
        const kv = after.match(/^([^:]+):\s*(.*)$/);
        if (kv) {
          const item = {};
          const itemIndent = baseIndent + 2;
          const k = kv[1].trim();
          const v = kv[2];
          if (v === "" || v === undefined) {
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
  console.error(`\n[agentforge:gemini-cli] ABORT: ${msg}\n`);
  console.error(`No files written. Resolve the spec gap and re-run.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Optional MCP module (spec/mcp.yaml) — fork-free per-adapter MCP registration.
// Absent / empty / `servers: []` => null => no MCP output (round-trip stays green).
// ---------------------------------------------------------------------------
function loadOptionalMcp() {
  const p = MCP_SPEC_PATH || path.join(SPEC_DIR, "mcp.yaml");
  let text;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
  const parsed = parseYaml(text);
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.schema_version !== SCHEMA_VERSION) {
    abort(`schema_version mismatch in mcp.yaml: expected ${SCHEMA_VERSION}, got ${parsed.schema_version}`);
  }
  if (!Array.isArray(parsed.servers) || parsed.servers.length === 0) return null;
  return parsed;
}

function mcpResolveServers(mcp, adapterKey) {
  if (!mcp) return [];
  return mcp.servers
    .filter((s) => s && typeof s === "object" && s.name && s.enabled !== false)
    .map((s) => {
      const ov = (s.overrides && s.overrides[adapterKey]) || {};
      const env = (ov.env !== undefined ? ov.env : s.env) || {};
      return {
        name: s.name,
        register: ov.register !== false,
        command: ov.command || s.command || null,
        args: Array.isArray(ov.args) ? ov.args : Array.isArray(s.args) ? s.args : [],
        env: env && typeof env === "object" && !Array.isArray(env) ? env : {},
        approval_mode: ov.approval_mode || null,
        note: ov.note || null,
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function mcpSortedEnv(env) {
  const out = {};
  for (const k of Object.keys(env).sort()) out[k] = env[k];
  return out;
}

function mcpEntry(s) {
  const e = { command: s.command, args: s.args };
  const env = mcpSortedEnv(s.env);
  if (Object.keys(env).length) e.env = env;
  return e;
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

function copyScript(src, dst) {
  const content = fs.readFileSync(src, "utf8");
  const changed = writeIfChanged(dst, content);
  // chmod is best-effort: no-op on Windows, may EPERM on locked-down POSIX.
  try { fs.chmodSync(dst, 0o755); } catch (_) {}
  return changed;
}

// ---------------------------------------------------------------------------
// Merge-safe writers — preserve hand-authored user content on adoption.
// GEMINI.md is the global ~/.gemini context file (a user may keep their own
// notes there) and ~/.gemini/settings.json is Gemini's PRIMARY config (API
// prefs, theme, other MCP servers). Neither may be clobbered by an emit.
// Modeled on the marker/add-if-absent approach the codex/cursor adapters use.
// ---------------------------------------------------------------------------
const AF_BLOCK_BEGIN =
  "<!-- AGENTFORGE:BEGIN — managed by AgentForge; edits inside this block are overwritten on re-emit -->";
const AF_BLOCK_END = "<!-- AGENTFORGE:END -->";

function buildManagedBlock(body) {
  return AF_BLOCK_BEGIN + "\n" + String(body).replace(/\s+$/, "") + "\n" + AF_BLOCK_END;
}

// Write the GEMINI.md identity file without destroying user content:
//   - no file             -> write the managed block
//   - file has BEGIN/END   -> replace only the block, keep surrounding content
//   - file without markers -> adoption: mount the block atop the user's file
function writeIdentityFile(p, body) {
  const block = buildManagedBlock(body);
  let existing = null;
  try { existing = fs.readFileSync(p, "utf8"); } catch (_) { /* missing */ }
  if (existing === null) return writeIfChanged(p, block + "\n");
  const normalized = existing.replace(/\r\n/g, "\n");
  const b = normalized.indexOf(AF_BLOCK_BEGIN);
  const e = normalized.indexOf(AF_BLOCK_END);
  if (b !== -1 && e !== -1 && e > b) {
    const before = normalized.slice(0, b);
    const after = normalized.slice(e + AF_BLOCK_END.length);
    return writeIfChanged(p, before + block + after);
  }
  // Adoption: user has notes but no managed block. Keep them, mount block atop.
  return writeIfChanged(p, block + "\n\n" + normalized);
}

// Parse an existing settings.json defensively. Returns the parsed object, or
// null when the file exists but is NOT valid JSON (caller must NOT clobber it).
function readExistingSettings(p) {
  if (!fs.existsSync(p)) return {};
  let obj;
  try { obj = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return null; }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return {};
  return obj;
}

// ---------------------------------------------------------------------------
// Builders for GEMINI.md sections — ported verbatim from the claude-code
// adapter so the identity file keeps the same cadence and template variables.
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
  let commits = sh.commits || "";
  if (commits) commits = commits.charAt(0).toUpperCase() + commits.slice(1);
  const stackShorthand = commits ? `${preCommits}. ${commits}` : preCommits;

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
    if (key === "secrets") {
      ruleLines.push(`${idx}. **${label}**`);
    } else {
      ruleLines.push(`${idx}. **${label}** ${val}`);
    }
    idx++;
  }
  const execBlock = ruleLines.join("\n");

  const ctxMap = {
    compact_threshold: () => `\`/compact\` at >60% used. \`/clear\` only when switching domains.`,
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

  const sh2 = identity.self_healing || {};
  const sections = Array.isArray(sh2.required_sections) ? sh2.required_sections.join("** + **") : "";
  const eos = Array.isArray(sh2.end_of_session_protocol) ? sh2.end_of_session_protocol.join(" + ") : "";

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
  // Gemini CLI has no platform-specific plugin namespace; reuse the claude_code
  // mapping where a route declares one (it is the richest plugin/skill mapping),
  // falling back to generic/codex guidance otherwise.
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
      const val = t[platformKey] || t.generic || t.codex;
      if (!val) abort(`router route ${route.id} missing target.${platformKey}`);
      load = val;
    } else {
      abort(`unknown route target.kind: ${t.kind} (route ${route.id})`);
    }
    rows.push(`| ${triggers} | ${load} |`);
  }
  const priorityList = Array.isArray(router.priority) ? router.priority : [];
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
    auto_local_skills_rows: "<!-- populated by scripts/sync-local-skill-router.js -->",
  };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

function buildMemoryFiles(memory, targetDir) {
  const buckets = memory.buckets || [];
  const written = [];

  for (const b of buckets) {
    const dir = path.join(targetDir, "memory", b.name);
    ensureDir(dir);
    // .gitkeep so the bucket survives git checkpoints when empty.
    if (writeIfChanged(path.join(dir, ".gitkeep"), "")) written.push(path.join(dir, ".gitkeep"));
    else written.push({ path: path.join(dir, ".gitkeep"), changed: false });
    if (b.seed && Array.isArray(b.seeded_files)) {
      for (const sf of b.seeded_files) {
        const p = path.join(dir, sf.name);
        // Don't overwrite an existing seeded file (user history is appended).
        if (!fs.existsSync(p)) {
          fs.writeFileSync(p, sf.template);
          written.push(p);
        } else {
          written.push({ path: p, changed: false });
        }
      }
    }
  }

  // MEMORY.md index.
  const sections = buckets.map((b) => {
    return `## ${b.name}\n\n${b.purpose}\n\nFiles: \`memory/${b.name}/\``;
  }).join("\n\n");
  const idx = (memory.index_template || "").replace("{bucket_sections}", sections);
  const idxPath = path.join(targetDir, "MEMORY.md");
  if (writeIfChanged(idxPath, idx)) written.push(idxPath);
  else written.push({ path: idxPath, changed: false });

  return written;
}

// ---------------------------------------------------------------------------
// Git checkpoint — best-effort, skip if the target is NOT already a git repo.
// Never `git init` a fresh target: that would sweep unrelated target contents
// (e.g. ~/.gemini credentials) into a new repo via `git add -A`. Mirrors cursor.
// ---------------------------------------------------------------------------
function gitCheckpoint(target) {
  try {
    execSync(`git -C "${target}" rev-parse --is-inside-work-tree`, { stdio: "ignore" });
  } catch {
    console.warn(`[agentforge:gemini-cli] git checkpoint skipped — ${target} is not a git repo`);
    return null;
  }
  try {
    const status = execSync(`git -C "${target}" status --porcelain`, { encoding: "utf8" });
    if (status.trim() === "") return null;
    execSync(`git -C "${target}" add -A`, { stdio: "ignore" });
    execSync(
      `git -C "${target}" -c user.email=agentforge@local -c user.name=AgentForge commit -m "agentforge: pre-emit checkpoint (gemini-cli adapter)" --allow-empty`,
      { stdio: "ignore" }
    );
    return execSync(`git -C "${target}" rev-parse HEAD`, { encoding: "utf8" }).trim();
  } catch (err) {
    const msg = (err && err.message) ? err.message.split("\n")[0] : String(err);
    console.warn(`[agentforge:gemini-cli] git checkpoint failed: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const targetArg = process.argv[2];
  const target = expandTarget(targetArg);

  const spec = loadSpec();

  ensureDir(target);
  // Pre-emit checkpoint (best-effort; never git-init a fresh target).
  const checkpoint = gitCheckpoint(target);

  const results = [];
  const record = (entry) => {
    // entry is either a boolean+path pair via record(path, changed), or an
    // object {path, changed}. Normalize to {path, changed}.
    results.push(entry);
  };
  const recordPath = (p, changed) => results.push({ path: p, changed: Boolean(changed) });

  // Build template variables.
  const dateStr = new Date().toISOString().slice(0, 10);
  const idVars = buildIdentityVars(spec.identity);
  const rtVars = buildRouterVars(spec.router);

  const geminiVars = {
    ...idVars,
    ...rtVars,
    date: dateStr,
  };

  // GEMINI.md — stable date across re-emits via a persisted date marker.
  const geminiTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "GEMINI.md.tmpl"), "utf8");
  const geminiMdPath = path.join(target, "GEMINI.md");
  const dateMarkerPath = path.join(target, ".agentforge-emit-date");
  let effectiveDate = dateStr;
  if (fs.existsSync(geminiMdPath) && fs.existsSync(dateMarkerPath)) {
    effectiveDate = fs.readFileSync(dateMarkerPath, "utf8").trim();
  }
  const geminiVars2 = { ...geminiVars, date: effectiveDate };
  const geminiMd = render(geminiTmpl, geminiVars2);
  // Merge-safe: wrap the rendered posture in an AGENTFORGE block so a user's own
  // ~/.gemini/GEMINI.md notes survive adoption and re-emit.
  const wroteGemini = writeIdentityFile(geminiMdPath, geminiMd);
  if (wroteGemini) fs.writeFileSync(dateMarkerPath, effectiveDate);
  recordPath(geminiMdPath, wroteGemini);
  recordPath(dateMarkerPath, wroteGemini);

  // settings.json — MERGE-SAFE. settings.json is Gemini's primary config, so we
  // start from the user's on-disk file (if any), add AgentForge-managed keys only
  // when ABSENT, and merge spec MCP servers without overwriting a same-named user
  // entry. The user's theme/telemetry/other mcpServers are never clobbered.
  const settingsTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "settings.json.tmpl"), "utf8");
  const managedRender = render(settingsTmpl, {});
  let managedObj;
  try { managedObj = JSON.parse(managedRender); } catch (e) { abort(`settings.json template render produced invalid JSON: ${e.message}`); }

  // CRITICAL: unlike claude-code, Gemini CLI does NOT manage context-mode as a
  // plugin, so there is NO register:false override for the gemini-cli key in
  // spec/mcp.yaml. mcpResolveServers(..., "gemini-cli") therefore returns ALL
  // enabled servers INCLUDING context-mode (register defaults to true), exactly
  // like the codex/cursor adapters.
  const geminiServers = mcpResolveServers(loadOptionalMcp(), "gemini-cli").filter((s) => s.register);

  const settingsPath = path.join(target, "settings.json");
  const userSettings = readExistingSettings(settingsPath);
  if (userSettings === null) {
    // User's settings.json is present but NOT valid JSON — never clobber it.
    // Drop a managed sidecar carrying the AgentForge shape for manual merge.
    if (!managedObj.mcpServers || typeof managedObj.mcpServers !== "object") managedObj.mcpServers = {};
    for (const s of geminiServers) {
      if (!Object.prototype.hasOwnProperty.call(managedObj.mcpServers, s.name)) managedObj.mcpServers[s.name] = mcpEntry(s);
    }
    const sidecar = path.join(target, "settings.agentforge.json");
    recordPath(settingsPath, false); // preserved untouched
    recordPath(sidecar, writeIfChanged(sidecar, JSON.stringify(managedObj, null, 2) + "\n"));
  } else {
    // Add AgentForge-managed top-level keys only when the user lacks them.
    for (const k of Object.keys(managedObj)) {
      if (k === "mcpServers") continue;
      if (!Object.prototype.hasOwnProperty.call(userSettings, k)) userSettings[k] = managedObj[k];
    }
    if (geminiServers.length) {
      if (!userSettings.mcpServers || typeof userSettings.mcpServers !== "object") userSettings.mcpServers = {};
      for (const s of geminiServers) {
        if (!Object.prototype.hasOwnProperty.call(userSettings.mcpServers, s.name)) userSettings.mcpServers[s.name] = mcpEntry(s);
      }
    } else if (!Object.prototype.hasOwnProperty.call(userSettings, "mcpServers") && managedObj.mcpServers) {
      userSettings.mcpServers = managedObj.mcpServers;
    }
    const finalSettings = JSON.stringify(userSettings, null, 2) + "\n";
    try { JSON.parse(finalSettings); } catch (e) { abort(`final settings.json is invalid JSON: ${e.message}`); }
    recordPath(settingsPath, writeIfChanged(settingsPath, finalSettings));
  }

  // Memory.
  for (const r of buildMemoryFiles(spec.memory, target)) {
    if (typeof r === "string") recordPath(r, true);
    else record(r);
  }

  // skills/ stub — manual-add convention (Gemini has no native skill-loader).
  ensureDir(path.join(target, "skills"));
  const skillsReadme = path.join(target, "skills", "README.md");
  const skillsReadmeBody = [
    "# skills/",
    "",
    "Drop local skills here as `<skill-name>/SKILL.md`. Each SKILL.md needs YAML",
    "frontmatter:",
    "",
    "```yaml",
    "---",
    "name: my-skill",
    "description: One-sentence trigger summary the router will surface.",
    "---",
    "```",
    "",
    "Gemini CLI has no native skill-loader concept. The Skill Router table in",
    "`GEMINI.md` is the routing layer — point it at the skills you keep here.",
    "Gemini has no PostToolUse / SessionStart shell hook, so the auto-registered",
    "block in `GEMINI.md` is NOT refreshed automatically. Run",
    "`node scripts/sync-local-skill-router.js` by hand after adding or archiving",
    "a skill to regenerate that block.",
    "",
    "Archived skills live in `_archived/` and are excluded from",
    "`scripts/dead-skills-report.sh`.",
    "",
  ].join("\n");
  recordPath(skillsReadme, writeIfChanged(skillsReadme, skillsReadmeBody));

  // telemetry/README.md — honest gap notice (OTel-only, no SessionEnd hook).
  const telemetryGap = (((spec.telemetry || {}).adapter_notes || {}).generic || {}).gap
    || "no automatic telemetry without an explicit watcher process";
  const telemetryReadme = [
    "# telemetry/",
    "",
    "**Gemini CLI exposes OpenTelemetry config in `settings.json` but no",
    "arbitrary lifecycle shell hook.** There is no PreToolUse-equivalent, no",
    "UserPromptSubmit log, and no SessionEnd trigger that can run a shell",
    "script on session events. " + telemetryGap + ".",
    "",
    "What that means in practice:",
    "",
    "- **OpenTelemetry, not shell hooks.** The `telemetry` block in",
    "  `settings.json` (`enabled`, `target`, `logPrompts`) is Gemini's native",
    "  observability surface. It can ship traces/metrics/logs to a local file",
    "  or an OTLP collector, but it cannot invoke `log-skill-invocation.sh` on",
    "  a Skill tool call. We ship it DISABLED by default — flip `enabled: true`",
    "  if you want Gemini's own OTel output.",
    "- **Prune is scheduler-driven, not event-driven.** Because there is no",
    "  SessionEnd hook, the weekly dead-skills report and router-refresh run",
    "  from cron / Windows Task Scheduler (see `scripts/install-cron.sh`), NOT",
    "  from a session lifecycle event.",
    "",
    "If you want a real `skill-invocations.jsonl` for",
    "`scripts/dead-skills-report.sh` to consume, instrument an external watcher",
    "(an MCP server, a shell wrapper, or an OTel exporter post-processor) to",
    "append one JSON line per skill use:",
    "",
    "```json",
    '{"ts":"2026-06-15T15:00:00Z","skill":"my-skill"}',
    "```",
    "",
    "Without that, `dead-skills-report.sh` runs and emits a \"no telemetry\"",
    "report — that is by design, not a bug.",
    "",
  ].join("\n");
  ensureDir(path.join(target, "telemetry"));
  recordPath(path.join(target, "telemetry", "README.md"), writeIfChanged(path.join(target, "telemetry", "README.md"), telemetryReadme));

  // scripts/* — verbatim copy of every file in adapters/gemini-cli/scripts/.
  ensureDir(path.join(target, "scripts"));
  for (const f of fs.readdirSync(SCRIPTS_DIR)) {
    const src = path.join(SCRIPTS_DIR, f);
    if (!fs.statSync(src).isFile()) continue;
    recordPath(path.join(target, "scripts", f), copyScript(src, path.join(target, "scripts", f)));
  }

  // scripts/installers/* — byte-identical copies of universal/lib/installers/.
  // Gives scripts/install-cron.sh a sibling to delegate to (cron on Unix, Task
  // Scheduler on Windows). This is the shared prune-automation installer.
  if (fs.existsSync(UNIVERSAL_INSTALLERS_DIR)) {
    ensureDir(path.join(target, "scripts", "installers"));
    for (const f of fs.readdirSync(UNIVERSAL_INSTALLERS_DIR)) {
      const src = path.join(UNIVERSAL_INSTALLERS_DIR, f);
      if (!fs.statSync(src).isFile()) continue;
      recordPath(path.join(target, "scripts", "installers", f), copyScript(src, path.join(target, "scripts", "installers", f)));
    }
  }

  const summary = {
    target,
    checkpoint_sha: checkpoint,
    files_written: results.length,
    files_changed: results.filter((r) => r.changed).length,
    details: results.map((r) => ({
      path: path.relative(target, r.path),
      changed: r.changed,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("[agentforge:gemini-cli] emit failed:", e.message);
    process.exit(1);
  }
}

module.exports = { parseYaml, loadSpec, buildIdentityVars, buildRouterVars };
