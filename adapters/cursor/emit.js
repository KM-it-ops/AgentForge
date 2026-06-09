#!/usr/bin/env node
// AgentForge — Cursor adapter emitter.
//
// Reads spec/*.yaml from the AgentForge repo and emits the Cursor-native
// posture (.cursorrules + .cursor/rules/*.mdc + memory skeleton + dead-skills
// script) into a target dir.
//
// Usage:
//   node adapters/cursor/emit.js <target-dir>
//   node adapters/cursor/emit.js ~/my-project
//
// Idempotent. Re-running with no spec changes produces zero diff. The emitter
// uses writeIfChanged so only files whose content actually differs are touched.
//
// Git checkpoint: best-effort. If the target is a git repo with pending
// changes, a checkpoint commit is created before writing. If the target is not
// a git repo, the checkpoint step is skipped (no init).

"use strict";

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
const UNIVERSAL_INSTALLERS_DIR = path.join(REPO_ROOT, "universal", "lib", "installers");

// ---------------------------------------------------------------------------
// YAML loading — js-yaml when available, miniYaml fallback otherwise.
// The miniYaml implementation is the same shape used by the claude-code
// adapter; copied here so this adapter stays standalone inside the npm tarball.
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
  // Pass 1: mark line indices inside block scalars so we don't strip `#` from
  // their bodies.
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
      if (trimmed.startsWith("- ")) return obj;
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
  console.error(`\n[agentforge:cursor] ABORT: ${msg}\n`);
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

// ---------------------------------------------------------------------------
// Template rendering — Mustache-style {{var}} substitution.
// ---------------------------------------------------------------------------
function render(tmpl, vars, templateName) {
  return tmpl.replace(/\{\{([\w_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) {
      const where = templateName ? ` in ${templateName}` : "";
      abort(`template variable not provided: {{${k}}}${where}`);
    }
    return vars[k];
  });
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfChanged(p, content) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p)) {
    const prev = fs.readFileSync(p, "utf8");
    if (prev === content) return { path: p, changed: false };
  }
  fs.writeFileSync(p, content);
  return { path: p, changed: true };
}

function copyScript(src, dst) {
  const content = fs.readFileSync(src, "utf8");
  const result = writeIfChanged(dst, content);
  // chmod is best-effort: no-op on Windows, may EPERM on locked-down POSIX — script still runs via bash
  try { fs.chmodSync(dst, 0o755); } catch (_) {}
  return result;
}

// ---------------------------------------------------------------------------
// Section builders — match the generic adapter's tone.
// ---------------------------------------------------------------------------
function buildIdentityBlock(identity) {
  const u = identity.user || {};
  const certs = Array.isArray(u.certifications) ? u.certifications.join(", ") : (u.certifications || "");
  return [
    `- **Name:** ${u.name} | Address as "${u.address_as}"`,
    `- **Location:** ${u.location} | ${u.os} | Base: \`${u.base_path}\``,
    `- **Role:** ${u.role}${certs ? ` (${certs})` : ""}`,
  ].join("\n");
}

function buildStackBlock(identity) {
  const s = identity.stack || {};
  const sh = s.shorthand || {};
  const state = sh.state || {};
  const obs = Array.isArray(sh.observability) ? sh.observability.join(" + ") : (sh.observability || "");
  const shorthand = [
    sh.frontend,
    sh.backend,
    sh.styling,
    state.server ? `${state.server} (server)` : null,
    state.ui ? `${state.ui} (UI)` : null,
    sh.background_jobs,
    sh.email,
    sh.cache,
    obs,
    sh.payments,
    sh.deployment,
    sh.commits,
  ].filter(Boolean).join(", ");
  return [
    `For any non-trivial build, the **\`${s.authoritative_skill}\`** skill is authoritative — ${s.baseline_doctrine} targets a ${s.baseline_score} master-dev baseline. Invoke it on "build me X" / "what stack should I use" / new-project intake.`,
    ``,
    `Casual shorthand: ${shorthand}.`,
  ].join("\n");
}

function buildExecutionRules(identity) {
  const rules = identity.execution_rules || [];
  const labels = {
    act_first: "Act first.",
    strict_typescript: "Strict TypeScript.",
    secrets: "Secrets.",
    confidence_rule: "95% Confidence Rule.",
    time_format: "Time format.",
    db_rls: "DB.",
  };
  return rules.map((r, i) => {
    const key = Object.keys(r)[0];
    const label = labels[key] || key;
    return `${i + 1}. **${label}** ${r[key]}`;
  }).join("\n");
}

function buildContextDiscipline(identity) {
  const cd = identity.context_discipline || [];
  return cd.map((r) => {
    const key = Object.keys(r)[0];
    return `- ${r[key]}`;
  }).join("\n");
}

function buildRouterTable(router) {
  const routes = router.manual_routes || [];
  const header = "| Trigger keywords | Load |\n|---|---|";
  const rows = routes.map((r) => {
    const triggers = (r.triggers || []).join(", ");
    const target = r.target || {};
    let load;
    if (target.kind === "local_skill") {
      load = `\`${target.name}\` local skill${target.note ? ` (${target.note})` : ""}`;
    } else {
      // Cursor has no platform-specific mapping; fall back to generic guidance.
      load = target.generic || target.claude_code || target.codex || "(no mapping documented)";
    }
    return `| ${triggers} | ${load} |`;
  }).join("\n");
  return `${header}\n${rows}`;
}

function buildMemoryProtocol(memory) {
  const p = memory.protocol || {};
  const lines = [
    `- \`MEMORY.md\` (always loaded — index only): ${p.always_loaded}`,
    `- Load on demand: ${p.load_on_demand}`,
  ];
  const buckets = (memory.buckets || []).map((b) => `\`memory/${b.name}/\` — ${b.purpose}`);
  lines.push(`- Buckets: ${buckets.join("; ")}`);
  for (const t of p.write_triggers || []) lines.push(`- ${t}`);
  return lines.join("\n");
}

function buildMemoryIndex(memory) {
  const sections = (memory.buckets || [])
    .map((b) => `## ${b.name}\n\n_${b.purpose}_\n\n(no entries yet)`)
    .join("\n\n");
  const tmpl = memory.index_template || "# Memory Index\n\n{bucket_sections}\n";
  return tmpl.replace("{bucket_sections}", sections);
}

// Human-readable description for a route's .mdc frontmatter.
function routeDescription(route) {
  const triggers = (route.triggers || []).join(", ");
  const target = route.target || {};
  let where;
  if (target.kind === "local_skill") {
    where = `${target.name} local skill`;
  } else {
    where = target.generic || target.claude_code || target.codex || "route guidance";
  }
  // Trim and avoid newlines in the frontmatter scalar.
  const summary = `${route.id}: ${triggers} → ${where}`;
  // Strip newlines/CRs (frontmatter scalar is single-line) then escape backslash
  // and double-quote so the quoted YAML scalar in rule-route.mdc.tmpl stays valid.
  return summary
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function buildRouteLoad(route) {
  const target = route.target || {};
  if (target.kind === "local_skill") {
    return `\`${target.name}\` local skill${target.note ? ` (${target.note})` : ""}`;
  }
  return target.generic || target.claude_code || target.codex || "(no mapping documented)";
}

function readLocalSkill(skillsDir, name) {
  const skillPath = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;
  const raw = fs.readFileSync(skillPath, "utf8");
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta = {};
  if (frontmatter) {
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) continue;
      meta[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return {
    name: meta.name || name,
    description: (meta.description || "Local Cursor skill.").replace(/\s+/g, " ").trim(),
  };
}

function buildLocalSkillsRule(target) {
  const skillsDir = path.join(target, "skills");
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
        .map((entry) => readLocalSkill(skillsDir, entry.name))
        .filter(Boolean)
    : [];
  const rows = skills.length
    ? skills.map((skill) => `| \`${skill.name}\` | ${skill.description} |`).join("\n")
    : "| _(no local skills installed)_ | _(drop SKILL.md dirs into `skills/` to populate this table)_ |";
  return [
    "---",
    "description: Local SKILL.md router entries generated from skills/*/SKILL.md",
    'globs: "**/*"',
    "alwaysApply: true",
    "---",
    "",
    "# Local Skills",
    "",
    "This file is managed by `scripts/watch-skills.js`. It makes local Cursor",
    "skills discoverable without re-running the full AgentForge emitter.",
    "",
    "| Skill | Description |",
    "|---|---|",
    rows,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Git checkpoint — best-effort, skip if not a git repo (don't init).
// ---------------------------------------------------------------------------
function gitCheckpoint(target) {
  try {
    execSync(`git -C "${target}" rev-parse --is-inside-work-tree`, { stdio: "ignore" });
  } catch {
    console.warn(`[agentforge:cursor] git checkpoint skipped — ${target} is not a git repo`);
    return null;
  }
  try {
    const status = execSync(`git -C "${target}" status --porcelain`, { encoding: "utf8" });
    if (status.trim() === "") return null;
    execSync(`git -C "${target}" add -A`, { stdio: "ignore" });
    execSync(
      `git -C "${target}" -c user.email=agentforge@local -c user.name=AgentForge commit -m "agentforge: pre-emit checkpoint (cursor adapter)" --allow-empty`,
      { stdio: "ignore" }
    );
    const sha = execSync(`git -C "${target}" rev-parse HEAD`, { encoding: "utf8" }).trim();
    return sha;
  } catch (err) {
    const msg = (err && err.message) ? err.message.split("\n")[0] : String(err);
    console.warn(`[agentforge:cursor] git checkpoint failed: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const target = expandTarget(process.argv[2]);
  ensureDir(target);

  const spec = loadSpec();

  // Pre-emit git checkpoint (best-effort).
  const checkpoint = gitCheckpoint(target);

  // Shared template variables.
  const identityBlock = buildIdentityBlock(spec.identity);
  const stackBlock = buildStackBlock(spec.identity);
  const executionRules = buildExecutionRules(spec.identity);
  const contextDiscipline = buildContextDiscipline(spec.identity);
  const skillRouter = buildRouterTable(spec.router);
  const memoryProtocol = buildMemoryProtocol(spec.memory);

  const results = [];

  // 1. .cursorrules (legacy single-file body).
  const cursorrulesTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "cursorrules.tmpl"), "utf8");
  const cursorrules = render(cursorrulesTmpl, {
    IDENTITY_BLOCK: identityBlock,
    STACK_BLOCK: stackBlock,
    EXECUTION_RULES: executionRules,
    SKILL_ROUTER: skillRouter,
    MEMORY_PROTOCOL: memoryProtocol,
    CONTEXT_DISCIPLINE: contextDiscipline,
  }, "cursorrules.tmpl");
  results.push(writeIfChanged(path.join(target, ".cursorrules"), cursorrules));

  // 2. .cursor/rules/identity.mdc (alwaysApply: true).
  const identityTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "rule-identity.mdc.tmpl"), "utf8");
  const identityMdc = render(identityTmpl, {
    IDENTITY_BLOCK: identityBlock,
    STACK_BLOCK: stackBlock,
    EXECUTION_RULES: executionRules,
    MEMORY_PROTOCOL: memoryProtocol,
  }, "rule-identity.mdc.tmpl");
  results.push(writeIfChanged(path.join(target, ".cursor", "rules", "identity.mdc"), identityMdc));

  // 3. .cursor/rules/router.mdc (alwaysApply: true).
  const routerTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "rule-router.mdc.tmpl"), "utf8");
  const routerMdc = render(routerTmpl, {
    SKILL_ROUTER: skillRouter,
  }, "rule-router.mdc.tmpl");
  results.push(writeIfChanged(path.join(target, ".cursor", "rules", "router.mdc"), routerMdc));

  // 4. .cursor/rules/local-skills.mdc — local SKILL.md discovery table.
  results.push(writeIfChanged(path.join(target, ".cursor", "rules", "local-skills.mdc"), buildLocalSkillsRule(target)));

  // 5. .cursor/rules/route-<id>.mdc — one rule per manual route.
  const routeTmpl = fs.readFileSync(path.join(TEMPLATES_DIR, "rule-route.mdc.tmpl"), "utf8");
  const routes = (spec.router && spec.router.manual_routes) || [];
  for (const route of routes) {
    const id = route.id;
    if (!id) continue;
    const triggers = (route.triggers || []).join(", ");
    const body = render(routeTmpl, {
      DESCRIPTION: routeDescription(route),
      ROUTE_ID: id,
      TRIGGERS: triggers,
      LOAD: buildRouteLoad(route),
    }, "rule-route.mdc.tmpl");
    results.push(writeIfChanged(path.join(target, ".cursor", "rules", `route-${id}.mdc`), body));
  }

  // 6. MEMORY.md — same memory-index seed the generic adapter writes.
  const memoryIndex = buildMemoryIndex(spec.memory);
  results.push(writeIfChanged(path.join(target, "MEMORY.md"), memoryIndex));

  // 7. memory/<bucket>/.gitkeep + seeded files.
  for (const b of spec.memory.buckets || []) {
    const bucketDir = path.join(target, "memory", b.name);
    ensureDir(bucketDir);
    results.push(writeIfChanged(path.join(bucketDir, ".gitkeep"), ""));
    if (b.seed && Array.isArray(b.seeded_files)) {
      for (const sf of b.seeded_files) {
        const seedPath = path.join(bucketDir, sf.name);
        // Match the generic adapter: don't overwrite an existing seeded file
        // (user history is appended to it).
        if (!fs.existsSync(seedPath)) {
          results.push(writeIfChanged(seedPath, sf.template));
        } else {
          results.push({ path: seedPath, changed: false });
        }
      }
    }
  }

  // 8. skills/README.md — manual-add convention for SKILL.md dirs.
  const skillsReadme = [
    "# skills/",
    "",
    "Drop local skills here as `<skill-name>/SKILL.md`. Each SKILL.md needs YAML frontmatter:",
    "",
    "```yaml",
    "---",
    "name: my-skill",
    "description: One-sentence trigger summary the router will surface.",
    "---",
    "```",
    "",
    "Cursor has no native skill-loader concept. The router rules under",
    "`.cursor/rules/` are the routing layer — point them at the skills you keep",
    "here. Run `node scripts/watch-skills.js --once` after adding skills, or",
    "`node scripts/watch-skills.js` to keep `.cursor/rules/local-skills.mdc`",
    "current while you edit.",
    "",
    "Archived skills live in `_archived/` and are excluded from",
    "`scripts/dead-skills-report.sh`.",
    "",
  ].join("\n");
  results.push(writeIfChanged(path.join(target, "skills", "README.md"), skillsReadme));

  // 9. telemetry/README.md — honest gap doc (Cursor has no telemetry primitive).
  const telemetryGap = (((spec.telemetry || {}).adapter_notes || {}).generic || {}).gap
    || "no automatic telemetry without an explicit watcher process";
  const telemetryReadme = [
    "# telemetry/",
    "",
    "**Cursor has no native telemetry primitive.** No PreToolUse-equivalent",
    "hook, no UserPromptSubmit log, no SessionEnd trigger. " + telemetryGap + ".",
    "",
    "If you want `scripts/dead-skills-report.sh` to produce a real report,",
    "instrument an external watcher (MCP server, shell wrapper, IDE",
    "extension) to append one JSON line per skill use to",
    "`skill-invocations.jsonl`:",
    "",
    "```json",
    '{"ts":"2026-06-03T15:00:00Z","skill":"my-skill"}',
    "```",
    "",
    "Without telemetry, `dead-skills-report.sh` will run and emit a",
    '"no telemetry" report — that is by design, not a bug.',
    "",
  ].join("\n");
  results.push(writeIfChanged(path.join(target, "telemetry", "README.md"), telemetryReadme));

  // 10. scripts/* — verbatim copy of every file in adapters/cursor/scripts/.
  //    Currently: dead-skills-report.sh (from generic), install-cron.sh
  //    (thin wrapper around the universal installer), cursor-weekly-report.sh
  //    (scheduled by install-cron.sh).
  ensureDir(path.join(target, "scripts"));
  for (const f of fs.readdirSync(SCRIPTS_DIR)) {
    const src = path.join(SCRIPTS_DIR, f);
    if (!fs.statSync(src).isFile()) continue;
    results.push(copyScript(src, path.join(target, "scripts", f)));
  }

  // 11. scripts/installers/* — byte-identical copies of universal/lib/installers/.
  //     Closes cursor-no-scheduled-task by giving install-cron.sh a sibling
  //     to delegate to.
  if (fs.existsSync(UNIVERSAL_INSTALLERS_DIR)) {
    ensureDir(path.join(target, "scripts", "installers"));
    for (const f of fs.readdirSync(UNIVERSAL_INSTALLERS_DIR)) {
      const src = path.join(UNIVERSAL_INSTALLERS_DIR, f);
      if (!fs.statSync(src).isFile()) continue;
      results.push(copyScript(src, path.join(target, "scripts", "installers", f)));
    }
  }

  // ---------------------------------------------------------------------------
  // JSON summary.
  // ---------------------------------------------------------------------------
  const changed = results.filter((r) => r.changed).length;
  const summary = {
    target,
    checkpoint_sha: checkpoint,
    files_written: results.length,
    files_changed: changed,
    details: results.map((r) => ({
      path: path.relative(target, r.path),
      changed: r.changed,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (e) {
  console.error("[agentforge:cursor] emit failed:", e.message);
  process.exit(1);
}
