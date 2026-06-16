#!/usr/bin/env node
// Sync AUTO-LOCAL-SKILLS section of GEMINI.md from skills/*/SKILL.md.
// Portable: honors $GEMINI_HOME env var, else ~/.gemini.
//
// Gemini CLI has no PostToolUse / SessionStart shell hook to auto-trigger this,
// so run it by hand after adding or archiving a local skill:
//   node scripts/sync-local-skill-router.js
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = process.env.GEMINI_HOME || path.join(os.homedir(), ".gemini");
const GEMINI_MD = path.join(HOME, "GEMINI.md");
const SKILLS_DIR = path.join(HOME, "skills");
const START = "<!-- AUTO-LOCAL-SKILLS:START";
const END = "<!-- AUTO-LOCAL-SKILLS:END -->";

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
      while (j < lines.length && /^\s+\S/.test(lines[j])) { collected.push(lines[j].trim()); j++; }
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
  const rows = skills.map((s) => "| `" + s.name + "` | " + condense(s.description) + " |").join("\n");
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
  if (!fs.existsSync(GEMINI_MD)) { console.error("GEMINI.md not found at", GEMINI_MD); process.exit(0); }
  const skills = listLocalSkills().map(readSkill).filter(Boolean);
  if (!skills.length) process.exit(0);
  const md = fs.readFileSync(GEMINI_MD, "utf8");
  const startIdx = md.indexOf(START);
  const endIdx = md.indexOf(END);
  if (startIdx === -1 || endIdx === -1) { console.error("AUTO-LOCAL-SKILLS markers missing in GEMINI.md; skipping sync."); process.exit(0); }
  const before = md.slice(0, startIdx);
  const after = md.slice(endIdx + END.length);
  const next = before + buildBlock(skills) + after;
  if (next !== md) { fs.writeFileSync(GEMINI_MD, next); console.log("sync-local-skill-router: updated " + skills.length + " local skill rows"); }
}

try { main(); } catch (e) { console.error("sync-local-skill-router error:", e.message); }
process.exit(0);
