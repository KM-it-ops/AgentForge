#!/usr/bin/env node
// AgentForge — generic adapter: sync local skill router.
//
// Reads every skills/<name>/SKILL.md (skipping _archived/) and rewrites the
// AUTO-LOCAL-SKILLS block of the target AGENTS.md.
//
// Resolution rule for the target dir (in order):
//   1. --target <dir> CLI flag
//   2. $AGENTFORGE_HOME environment variable
//   3. Walking up from this script's parent looking for a sibling AGENTS.md
//   4. Current working directory
//
// Idempotent. Safe to run on every edit, every session start, or via a watcher.
// Never blocks: any error logs to stderr and exits 0.

const fs = require("fs");
const path = require("path");

const START_PREFIX = "<!-- AUTO-LOCAL-SKILLS:START";
const END_MARKER = "<!-- AUTO-LOCAL-SKILLS:END -->";

function resolveTargetDir() {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--target");
  if (flagIdx !== -1 && argv[flagIdx + 1]) return path.resolve(argv[flagIdx + 1]);
  if (process.env.AGENTFORGE_HOME) return path.resolve(process.env.AGENTFORGE_HOME);

  // Walk up from this script's parent (scripts/ → its parent is the target dir).
  let dir = path.resolve(__dirname, "..");
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "AGENTS.md")) && fs.existsSync(path.join(dir, "skills"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function parseFrontmatter(text) {
  text = text.replace(/\r\n/g, "\n");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if (val === ">" || val === "|") {
      const collected = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j])) {
        collected.push(lines[j].trim());
        j++;
      }
      val = collected.join(val === ">" ? " " : "\n");
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
  let s = desc.split(/(?<=[.!?])\s/)[0].replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen - 1).trim() + "…";
  return s;
}

function listLocalSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => {
      if (d.name === "_archived" || d.name.startsWith(".") || d.name === "README.md") return false;
      return d.isDirectory() || d.isSymbolicLink();
    })
    .map((d) => d.name)
    .sort();
}

function readSkill(skillsDir, name) {
  const f = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(f)) return null;
  const fm = parseFrontmatter(fs.readFileSync(f, "utf8"));
  return {
    name,
    description: (fm && fm.description) || "(no description in frontmatter)",
  };
}

function buildBlock(skills) {
  const rows = skills.length
    ? skills.map((s) => `| \`${s.name}\` | ${condense(s.description)} |`).join("\n")
    : "| _(no skills installed)_ | _(drop SKILL.md dirs into `skills/` to populate this table)_ |";
  return [
    "<!-- AUTO-LOCAL-SKILLS:START — managed by scripts/sync-local-skill-router.js; do not hand-edit between these markers -->",
    "### Local skills (auto-registered)",
    "| Local skill | Trigger keywords |",
    "|---|---|",
    rows,
    "<!-- AUTO-LOCAL-SKILLS:END -->",
  ].join("\n");
}

function main() {
  const target = resolveTargetDir();
  const agentsMd = path.join(target, "AGENTS.md");
  const skillsDir = path.join(target, "skills");

  if (!fs.existsSync(agentsMd)) {
    console.error(`sync-local-skill-router: AGENTS.md not found at ${agentsMd}; nothing to sync.`);
    return;
  }

  const skills = listLocalSkills(skillsDir).map((n) => readSkill(skillsDir, n)).filter(Boolean);

  const md = fs.readFileSync(agentsMd, "utf8");
  const startIdx = md.indexOf(START_PREFIX);
  const endIdx = md.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    console.error("sync-local-skill-router: AUTO-LOCAL-SKILLS markers missing in AGENTS.md; skipping.");
    return;
  }
  const before = md.slice(0, startIdx);
  const after = md.slice(endIdx + END_MARKER.length);
  const next = before + buildBlock(skills) + after;
  if (next !== md) {
    fs.writeFileSync(agentsMd, next);
    console.log(`sync-local-skill-router: updated ${skills.length} local skill row(s) in ${agentsMd}`);
  } else {
    console.log("sync-local-skill-router: no changes");
  }
}

try {
  main();
} catch (e) {
  console.error("sync-local-skill-router error:", e.message);
}
process.exit(0);
