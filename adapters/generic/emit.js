#!/usr/bin/env node
// AgentForge — generic adapter emitter.
// Reads spec/*.yaml and emits a portable AGENTS.md + memory skeleton + scripts.
//
// Usage:
//   node adapters/generic/emit.js <target-dir>
//
// The generic adapter is the lowest-common-denominator emitter. It produces
// a single AGENTS.md that any LLM-aware editor can read (Cursor, Aider,
// Gemini CLI, Codex CLI fallback, Copilot Chat, future tools).
//
// Idempotent. Re-running produces zero diff. If the target dir is a git repo,
// the emitter creates a checkpoint commit before writing.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ADAPTER_DIR = __dirname;
const REPO_ROOT = path.resolve(ADAPTER_DIR, "..", "..");
const SPEC_DIR = path.join(REPO_ROOT, "spec");
const TEMPLATES_DIR = path.join(ADAPTER_DIR, "templates");
const SCRIPTS_DIR = path.join(ADAPTER_DIR, "scripts");
const SUPPORTED_SCHEMA_VERSION = 1;

// ─── tiny YAML loader (sufficient for our spec files) ───────────────────────
// We avoid a dependency by handling only the subset of YAML our spec uses:
// scalars, lists, nested maps, block scalars (| and >), flow lists ([a, b]).
function loadYAML(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
  const lines = text.split("\n");
  const root = {};
  parseBlock(lines, 0, 0, root);
  return root;
}

function indentOf(line) {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

function isBlank(line) {
  return /^\s*(#.*)?$/.test(line);
}

function stripQuotes(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseScalar(v) {
  v = v.replace(/\s+#.*$/, "").trim();
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return stripQuotes(v);
}

function parseFlowList(v) {
  // [a, "b c", 'd']
  v = v.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) return null;
  const inner = v.slice(1, -1);
  const out = [];
  let cur = "";
  let q = null;
  for (const ch of inner) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
    } else if (ch === ",") {
      out.push(parseScalar(cur));
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "") out.push(parseScalar(cur));
  return out;
}

// Collect a multi-line flow list starting at lines[i]. Returns {text, next}
// where text is the concatenated content with brackets balanced.
function collectFlowList(lines, startIdx) {
  let buf = "";
  let depth = 0;
  let i = startIdx;
  let started = false;
  while (i < lines.length) {
    const line = lines[i].replace(/\s+#.*$/, "");
    buf += (buf ? " " : "") + line.trim();
    for (const ch of line) {
      if (ch === "[") {
        depth++;
        started = true;
      } else if (ch === "]") {
        depth--;
      }
    }
    i++;
    if (started && depth === 0) break;
  }
  return { text: buf, next: i };
}

function parseBlock(lines, startIdx, baseIndent, container) {
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const ind = indentOf(line);
    if (ind < baseIndent) return i;

    const content = line.slice(ind);

    // List item under a key
    if (content.startsWith("- ")) {
      if (!Array.isArray(container)) return i; // caller handles
      const rest = content.slice(2);
      // Inline mapping inside list: `- key: value`
      const kv = rest.match(/^([\w.-]+):\s*(.*)$/);
      if (kv) {
        const item = {};
        const key = kv[1];
        const val = kv[2];
        if (val.trim() === "") {
          // Peek for multi-line flow list before treating as nested map.
          let pk = i + 1;
          while (pk < lines.length && isBlank(lines[pk])) pk++;
          if (
            pk < lines.length &&
            indentOf(lines[pk]) > ind &&
            lines[pk].slice(indentOf(lines[pk])).trim().startsWith("[")
          ) {
            const flow = collectFlowList(lines, pk);
            item[key] = parseFlowList(flow.text);
            i = flow.next - 1;
          } else {
            // nested map starts on next line
            i++;
            i = parseBlock(lines, i, ind + 2, item) - 1;
          }
        } else if (val.trim().startsWith("[")) {
          const opens = (val.match(/\[/g) || []).length;
          const closes = (val.match(/\]/g) || []).length;
          if (opens === closes) {
            item[key] = parseFlowList(val);
          } else {
            const flow = collectFlowList(lines, i);
            const stripped = flow.text.replace(/^[^[]*\[/, "[");
            item[key] = parseFlowList(stripped);
            i = flow.next - 1;
          }
        } else if (val.trim() === ">" || val.trim() === "|") {
          const collected = collectBlockScalar(lines, i + 1, ind + 2);
          item[key] = val.trim() === ">" ? collected.text.replace(/\n/g, " ").trim() : collected.text;
          i = collected.next - 1;
        } else {
          item[key] = parseScalar(val);
        }
        // Maybe more keys for this item at same indent (ind+2)
        let j = i + 1;
        while (j < lines.length) {
          if (isBlank(lines[j])) { j++; continue; }
          const jInd = indentOf(lines[j]);
          if (jInd !== ind + 2) break;
          const jContent = lines[j].slice(jInd);
          if (jContent.startsWith("- ")) break;
          const jkv = jContent.match(/^([\w.-]+):\s*(.*)$/);
          if (!jkv) break;
          const jKey = jkv[1];
          const jVal = jkv[2];
          if (jVal.trim() === "") {
            // Peek next non-blank line to decide list vs map vs flow-list.
            let pk = j + 1;
            while (pk < lines.length && isBlank(lines[pk])) pk++;
            if (pk < lines.length && indentOf(lines[pk]) > jInd) {
              const pkContent = lines[pk].slice(indentOf(lines[pk]));
              if (pkContent.trim().startsWith("[")) {
                const flow = collectFlowList(lines, pk);
                item[jKey] = parseFlowList(flow.text);
                j = flow.next;
                continue;
              }
              if (pkContent.startsWith("- ")) {
                const list = [];
                j = parseBlock(lines, pk, indentOf(lines[pk]), list);
                item[jKey] = list;
                continue;
              }
            }
            const sub = {};
            j++;
            j = parseBlock(lines, j, ind + 4, sub);
            item[jKey] = sub;
            continue;
          } else if (jVal.trim().startsWith("[")) {
            const opens = (jVal.match(/\[/g) || []).length;
            const closes = (jVal.match(/\]/g) || []).length;
            if (opens === closes) {
              item[jKey] = parseFlowList(jVal);
            } else {
              const flow = collectFlowList(lines, j);
              const stripped = flow.text.replace(/^[^[]*\[/, "[");
              item[jKey] = parseFlowList(stripped);
              j = flow.next;
              continue;
            }
          } else if (jVal.trim() === ">" || jVal.trim() === "|") {
            const collected = collectBlockScalar(lines, j + 1, ind + 4);
            item[jKey] = jVal.trim() === ">" ? collected.text.replace(/\n/g, " ").trim() : collected.text;
            j = collected.next;
            continue;
          } else {
            item[jKey] = parseScalar(jVal);
          }
          j++;
        }
        i = j;
        container.push(item);
        continue;
      } else {
        // simple scalar list item
        if (rest.trim().startsWith("[")) {
          container.push(parseFlowList(rest));
        } else {
          container.push(parseScalar(rest));
        }
        i++;
        continue;
      }
    }

    // Key: value or Key:
    const kv = content.match(/^([\w.-]+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const val = kv[2];
    if (val.trim() === "") {
      // Could be a list, map, or multi-line flow list below.
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j >= lines.length) {
        container[key] = null;
        i = j;
        continue;
      }
      const nextInd = indentOf(lines[j]);
      const nextContent = lines[j].slice(nextInd);
      if (nextInd <= ind) {
        container[key] = null;
        i++;
        continue;
      }
      if (nextContent.trim().startsWith("[")) {
        const flow = collectFlowList(lines, j);
        container[key] = parseFlowList(flow.text);
        i = flow.next;
        continue;
      }
      if (nextContent.startsWith("- ")) {
        const list = [];
        i = parseBlock(lines, j, nextInd, list);
        container[key] = list;
      } else {
        const map = {};
        i = parseBlock(lines, j, nextInd, map);
        container[key] = map;
      }
      continue;
    }
    if (val.trim().startsWith("[")) {
      // May be a single-line or multi-line flow list.
      const opens = (val.match(/\[/g) || []).length;
      const closes = (val.match(/\]/g) || []).length;
      if (opens === closes) {
        container[key] = parseFlowList(val);
      } else {
        const flow = collectFlowList(lines, i);
        // Strip the leading "key:" from the buffer.
        const stripped = flow.text.replace(/^[^[]*\[/, "[");
        container[key] = parseFlowList(stripped);
        i = flow.next;
        continue;
      }
    } else if (val.trim() === ">" || val.trim() === "|") {
      const collected = collectBlockScalar(lines, i + 1, ind + 2);
      container[key] = val.trim() === ">" ? collected.text.replace(/\n/g, " ").trim() : collected.text;
      i = collected.next;
      continue;
    } else {
      container[key] = parseScalar(val);
    }
    i++;
  }
  return i;
}

function collectBlockScalar(lines, startIdx, minIndent) {
  const out = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      out.push("");
      i++;
      continue;
    }
    const ind = indentOf(line);
    if (ind < minIndent) break;
    out.push(line.slice(minIndent));
    i++;
  }
  // Trim trailing blanks
  while (out.length && out[out.length - 1] === "") out.pop();
  return { text: out.join("\n"), next: i };
}

// ─── spec loaders ────────────────────────────────────────────────────────────
function readSpec(name) {
  const p = path.join(SPEC_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`spec file missing: ${p}`);
  const data = loadYAML(fs.readFileSync(p, "utf8"));
  if (data.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `unsupported schema_version=${data.schema_version} in ${name} (this adapter supports ${SUPPORTED_SCHEMA_VERSION})`
    );
  }
  return data;
}

// ─── optional MCP module (spec/mcp.yaml) ─────────────────────────────────────
// The generic adapter is document-only: it cannot auto-register MCP servers,
// so it renders a portable reference table. Absent/empty => "" => byte-identical.
const MCP_SPEC_PATH = process.env.AGENTFORGE_MCP_SPEC || null;

function loadOptionalMcp() {
  const p = MCP_SPEC_PATH || path.join(SPEC_DIR, "mcp.yaml");
  if (!fs.existsSync(p)) return null;
  const parsed = loadYAML(fs.readFileSync(p, "utf8"));
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `unsupported schema_version=${parsed.schema_version} in mcp.yaml (this adapter supports ${SUPPORTED_SCHEMA_VERSION})`
    );
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

function buildMcpBlock(mcp) {
  const servers = mcpResolveServers(mcp, "generic");
  if (!servers.length) return "";
  const rows = servers
    .map((s) => {
      const cmd = [s.command, ...(s.args || [])].filter(Boolean).join(" ");
      const note = s.note || "Register with your MCP-capable client.";
      return `| \`${s.name}\` | \`${cmd}\` | ${note} |`;
    })
    .join("\n");
  return [
    "",
    "## MCP Servers",
    "",
    "Portable MCP server registrations. Wire these into whatever MCP-capable client you use:",
    "",
    "| Server | Command | Notes |",
    "|---|---|---|",
    rows,
    "",
  ].join("\n");
}

// ─── template substitution ──────────────────────────────────────────────────
function renderTemplate(tmplPath, vars) {
  let text = fs.readFileSync(tmplPath, "utf8").replace(/\r\n/g, "\n");
  for (const [k, v] of Object.entries(vars)) {
    text = text.split(`{{${k}}}`).join(v);
  }
  return text;
}

// ─── builders ───────────────────────────────────────────────────────────────
function buildIdentitySection(identity) {
  const u = identity.user || {};
  const certs = (u.certifications || []).join(", ");
  return [
    `- **Name:** ${u.name} | Address as "${u.address_as}"`,
    `- **Location:** ${u.location} | ${u.os} | Base: \`${u.base_path}\``,
    `- **Role:** ${u.role}${certs ? ` (${certs})` : ""}`,
  ].join("\n");
}

function buildStackSection(identity) {
  const s = identity.stack || {};
  const sh = s.shorthand || {};
  const obs = Array.isArray(sh.observability) ? sh.observability.join(" + ") : sh.observability;
  const state = sh.state || {};
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
  ]
    .filter(Boolean)
    .join(", ");
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
  return rules
    .map((r, i) => {
      const key = Object.keys(r).find((k) => k !== undefined);
      const label = labels[key] || key;
      return `${i + 1}. **${label}** ${r[key]}`;
    })
    .join("\n");
}

function buildRouterTable(router) {
  const routes = router.manual_routes || [];
  const header = "| Trigger keywords | Load |\n|---|---|";
  const rows = routes
    .map((r) => {
      const triggers = (r.triggers || []).join(", ");
      const target = r.target || {};
      let load;
      if (target.kind === "local_skill") {
        load = `\`${target.name}\` local skill${target.note ? ` (${target.note})` : ""}`;
      } else {
        load = target.generic || "(no generic mapping documented)";
      }
      return `| ${triggers} | ${load} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

function buildContextDiscipline(identity) {
  const cd = identity.context_discipline || [];
  return cd
    .map((r) => {
      const key = Object.keys(r)[0];
      return `- ${r[key]}`;
    })
    .join("\n");
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

function buildLocalSkillsSection(target) {
  // Read existing skills (if any) so the rendered AGENTS.md already contains
  // the correct AUTO-LOCAL-SKILLS table on first write — keeps re-emits truly
  // zero-diff even when local skills exist.
  function parseFm(text) {
    text = text.replace(/\r\n/g, "\n");
    const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return null;
    const out = {};
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (!kv) continue;
      out[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  }
  function condense(desc, maxLen = 110) {
    if (!desc) return "(no description)";
    let s = desc.split(/(?<=[.!?])\s/)[0].replace(/\s+/g, " ").trim();
    if (s.length > maxLen) s = s.slice(0, maxLen - 1).trim() + "…";
    return s;
  }
  const skillsDir = target ? path.join(target, "skills") : null;
  const skills =
    skillsDir && fs.existsSync(skillsDir)
      ? fs
          .readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => {
            if (d.name === "_archived" || d.name.startsWith(".") || d.name === "README.md") return false;
            return d.isDirectory() || d.isSymbolicLink();
          })
          .map((d) => d.name)
          .sort()
          .map((name) => {
            const f = path.join(skillsDir, name, "SKILL.md");
            if (!fs.existsSync(f)) return null;
            const fm = parseFm(fs.readFileSync(f, "utf8"));
            return { name, description: (fm && fm.description) || "(no description in frontmatter)" };
          })
          .filter(Boolean)
      : [];

  const rows = skills.length
    ? skills.map((s) => `| \`${s.name}\` | ${condense(s.description)} |`).join("\n")
    : "| _(no skills installed)_ | _(drop SKILL.md dirs into `skills/` to populate this table)_ |";

  return [
    "Drop skills into `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`).",
    "Run `node scripts/sync-local-skill-router.js` (from the target dir) to refresh the auto-managed table below.",
    "The emitter also refreshes this table on every run, so re-running `emit.js` after adding a skill is enough.",
    "",
    "<!-- AUTO-LOCAL-SKILLS:START — managed by scripts/sync-local-skill-router.js; do not hand-edit between these markers -->",
    "### Local skills (auto-registered)",
    "| Local skill | Trigger keywords |",
    "|---|---|",
    rows,
    "<!-- AUTO-LOCAL-SKILLS:END -->",
  ].join("\n");
}

function buildMemoryIndex(memory) {
  const sections = (memory.buckets || [])
    .map((b) => `## ${b.name}\n\n_${b.purpose}_\n\n(no entries yet)`)
    .join("\n\n");
  const tmpl = memory.index_template || "# Memory Index\n\n{bucket_sections}\n";
  return tmpl.replace("{bucket_sections}", sections);
}

// ─── filesystem helpers ─────────────────────────────────────────────────────
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfChanged(p, content) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p)) {
    const current = fs.readFileSync(p, "utf8");
    if (current === content) return { path: p, changed: false };
  }
  fs.writeFileSync(p, content);
  return { path: p, changed: true };
}

function copyScript(src, dst) {
  const content = fs.readFileSync(src, "utf8");
  const result = writeIfChanged(dst, content);
  // chmod +x on POSIX; harmless on Windows
  try {
    fs.chmodSync(dst, 0o755);
  } catch (_) {}
  return result;
}

function gitCheckpoint(target) {
  try {
    execSync(`git -C "${target}" rev-parse --is-inside-work-tree`, { stdio: "ignore" });
  } catch {
    return null; // not a git repo
  }
  try {
    const status = execSync(`git -C "${target}" status --porcelain`, { encoding: "utf8" });
    if (status.trim() === "") return null;
    execSync(`git -C "${target}" add -A`, { stdio: "ignore" });
    execSync(
      `git -C "${target}" commit -m "agentforge: pre-emit checkpoint (generic adapter)" --allow-empty`,
      { stdio: "ignore" }
    );
    const sha = execSync(`git -C "${target}" rev-parse HEAD`, { encoding: "utf8" }).trim();
    return sha;
  } catch {
    return null;
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node emit.js <target-dir>");
    process.exit(2);
  }
  const targetAbs = path.resolve(target);
  ensureDir(targetAbs);

  // Load all five spec files (mandatory — adapter contract)
  const identity = readSpec("identity.yaml");
  const router = readSpec("router.yaml");
  const memory = readSpec("memory.yaml");
  const telemetry = readSpec("telemetry.yaml");
  const automation = readSpec("automation.yaml");

  // Render AGENTS.md
  const checklistTmpl = path.join(TEMPLATES_DIR, "setup-checklist.md.tmpl");
  const checklist = fs.readFileSync(checklistTmpl, "utf8");

  const agentsMd = renderTemplate(path.join(TEMPLATES_DIR, "AGENTS.md.tmpl"), {
    IDENTITY_BLOCK: buildIdentitySection(identity),
    STACK_BLOCK: buildStackSection(identity),
    EXECUTION_RULES: buildExecutionRules(identity),
    SKILL_ROUTER: buildRouterTable(router),
    LOCAL_SKILLS: buildLocalSkillsSection(targetAbs),
    MEMORY_PROTOCOL: buildMemoryProtocol(memory),
    CONTEXT_DISCIPLINE: buildContextDiscipline(identity),
    MCP_BLOCK: buildMcpBlock(loadOptionalMcp()),
    SETUP_CHECKLIST: checklist,
    GRACE_PERIOD_DAYS: String((automation.safety || {}).grace_period_days || 60),
    TELEMETRY_GAP: (((telemetry.adapter_notes || {}).generic) || {}).all || "manual instrumentation",
  });

  const memoryMd = renderTemplate(path.join(TEMPLATES_DIR, "MEMORY.md.tmpl"), {
    INDEX: buildMemoryIndex(memory),
  });

  // Checkpoint (best-effort, no-op if not a git repo or nothing to stage)
  const checkpoint = gitCheckpoint(targetAbs);

  const results = [];
  results.push(writeIfChanged(path.join(targetAbs, "AGENTS.md"), agentsMd));
  results.push(writeIfChanged(path.join(targetAbs, "MEMORY.md"), memoryMd));

  // Memory bucket dirs (+ seeded files where spec asks)
  for (const b of memory.buckets || []) {
    const bucketDir = path.join(targetAbs, "memory", b.name);
    ensureDir(bucketDir);
    if (b.seed && Array.isArray(b.seeded_files)) {
      for (const sf of b.seeded_files) {
        const seedPath = path.join(bucketDir, sf.name);
        // Don't overwrite a non-empty user-managed seed file.
        if (!fs.existsSync(seedPath)) {
          results.push(writeIfChanged(seedPath, sf.template));
        }
      }
    }
  }

  // Skills root (manual — user drops SKILL.md dirs here)
  ensureDir(path.join(targetAbs, "skills"));
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
    "Then run `node ../scripts/sync-local-skill-router.js` from this dir's parent",
    "(or pass `--target <dir>` explicitly) to refresh the AUTO-LOCAL-SKILLS table",
    "inside AGENTS.md.",
    "",
    "Archived skills live in `_archived/` and are excluded from the router table.",
    "",
  ].join("\n");
  results.push(writeIfChanged(path.join(targetAbs, "skills", "README.md"), skillsReadme));

  // Telemetry dir (empty placeholder — generic adapter doesn't auto-write to it)
  ensureDir(path.join(targetAbs, "telemetry"));
  const telemetryReadme = [
    "# telemetry/",
    "",
    "The generic adapter does NOT auto-instrument telemetry. " + (((telemetry.adapter_notes || {}).generic) || {}).gap,
    "",
    "If you want the weekly dead-skills report to have data, instrument your editor",
    "or shell to append lines to `skill-invocations.jsonl` like:",
    "",
    "```json",
    '{"ts":"2026-06-03T15:00:00Z","skill":"my-skill"}',
    "```",
    "",
    "Then `scripts/dead-skills-report.sh` will compute zero-invocation skills.",
    "",
  ].join("\n");
  results.push(writeIfChanged(path.join(targetAbs, "telemetry", "README.md"), telemetryReadme));

  // Scripts — copy our portable versions verbatim into the target.
  ensureDir(path.join(targetAbs, "scripts"));
  results.push(
    copyScript(
      path.join(SCRIPTS_DIR, "sync-local-skill-router.js"),
      path.join(targetAbs, "scripts", "sync-local-skill-router.js")
    )
  );
  results.push(
    copyScript(
      path.join(SCRIPTS_DIR, "dead-skills-report.sh"),
      path.join(targetAbs, "scripts", "dead-skills-report.sh")
    )
  );

  // Receipt
  const changed = results.filter((r) => r.changed).length;
  const summary = {
    target: targetAbs,
    checkpoint_sha: checkpoint,
    files_written: results.length,
    files_changed: changed,
    details: results.map((r) => ({
      path: path.relative(targetAbs, r.path),
      changed: r.changed,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (e) {
  console.error("emit failed:", e.message);
  process.exit(1);
}
