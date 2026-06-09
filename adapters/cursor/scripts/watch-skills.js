#!/usr/bin/env node
// Cursor local skill router watcher.
// Maintains .cursor/rules/local-skills.mdc from skills/*/SKILL.md.

"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { once: false, target: process.cwd() };
  for (const arg of argv) {
    if (arg === "--once") args.once = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: node scripts/watch-skills.js [--once] [target-dir]\n");
      process.exit(0);
    } else if (arg.startsWith("-")) {
      process.stderr.write(`watch-skills: unknown flag ${arg}\n`);
      process.exit(2);
    } else {
      args.target = arg;
    }
  }
  args.target = path.resolve(args.target);
  return args;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readSkill(skillsDir, name) {
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

function listSkills(target) {
  const skillsDir = path.join(target, "skills");
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => readSkill(skillsDir, entry.name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function render(skills) {
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

function sync(target) {
  const out = path.join(target, ".cursor", "rules", "local-skills.mdc");
  ensureDir(path.dirname(out));
  const next = render(listSkills(target));
  let prev = null;
  try {
    prev = fs.readFileSync(out, "utf8");
  } catch (_) {
    /* missing */
  }
  if (prev !== next) {
    fs.writeFileSync(out, next);
    process.stdout.write(`watch-skills: updated ${path.relative(target, out)}\n`);
  } else {
    process.stdout.write("watch-skills: no changes\n");
  }
}

function watch(target) {
  const skillsDir = path.join(target, "skills");
  ensureDir(skillsDir);
  sync(target);
  process.stdout.write(`watch-skills: watching ${skillsDir}\n`);
  let timer = null;
  fs.watch(skillsDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => sync(target), 100);
  });
}

const args = parseArgs(process.argv.slice(2));
if (!fs.existsSync(path.join(args.target, ".cursor", "rules"))) {
  process.stderr.write(`watch-skills: Cursor rules directory not found under ${args.target}\n`);
  process.exit(2);
}

if (args.once) sync(args.target);
else watch(args.target);
