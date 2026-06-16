#!/usr/bin/env node
// Gemini CLI local skill-router watcher (parity with the cursor adapter).
// Re-runs scripts/sync-local-skill-router.js — which maintains the
// AUTO-LOCAL-SKILLS block in GEMINI.md — whenever skills/*/SKILL.md changes.
//
// Gemini CLI has NO SessionStart / PostToolUse shell hook, so this optional
// long-running watcher is the live-refresh alternative to running the sync by
// hand. Delegating to sync-local-skill-router.js keeps a single source of truth
// for the block format (no duplicated render logic).
//
//   node scripts/watch-skills.js --once [gemini-home]   # one sync, then exit
//   node scripts/watch-skills.js [gemini-home]          # watch + live-refresh
//
// gemini-home defaults to $GEMINI_HOME, else ~/.gemini.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const args = { once: false, target: process.env.GEMINI_HOME || path.join(os.homedir(), ".gemini") };
  for (const arg of argv) {
    if (arg === "--once") args.once = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: node scripts/watch-skills.js [--once] [gemini-home-dir]\n");
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

function sync(target) {
  const script = path.join(__dirname, "sync-local-skill-router.js");
  try {
    const out = execFileSync(process.execPath, [script], {
      env: { ...process.env, GEMINI_HOME: target },
      encoding: "utf8",
    });
    process.stdout.write(out && out.trim() ? out : "watch-skills: no changes\n");
  } catch (err) {
    const msg = (err && err.message) ? err.message.split("\n")[0] : String(err);
    process.stderr.write(`watch-skills: sync failed: ${msg}\n`);
  }
}

function watch(target) {
  const skillsDir = path.join(target, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  sync(target);
  process.stdout.write(`watch-skills: watching ${skillsDir}\n`);
  let timer = null;
  // recursive watch is supported on Windows + macOS (not Linux) — same caveat
  // as the cursor adapter's watcher; rerun with --once from cron on Linux.
  fs.watch(skillsDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => sync(target), 100);
  });
}

const args = parseArgs(process.argv.slice(2));
if (!fs.existsSync(path.join(args.target, "GEMINI.md"))) {
  process.stderr.write(`watch-skills: GEMINI.md not found under ${args.target}\n`);
  process.exit(2);
}

if (args.once) sync(args.target);
else watch(args.target);
