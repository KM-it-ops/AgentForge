#!/usr/bin/env node
// AgentForge CLI — `npx agentforge init <adapter> [--dir <path>]`
//
// Thin wrapper around adapters/<adapter>/emit.js. Resolves the canonical
// install dir per adapter when --dir is not supplied:
//   claude-code → ~/.claude
//   codex       → ~/.codex
//   generic     → must be supplied via --dir (no canonical default)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const PKG_JSON = path.join(PKG_ROOT, 'package.json');
const ADAPTERS_DIR = path.join(PKG_ROOT, 'adapters');

const ADAPTERS = {
  'claude-code': { defaultDir: path.join(os.homedir(), '.claude') },
  'codex':       { defaultDir: path.join(os.homedir(), '.codex') },
  'generic':     { defaultDir: null },
};

function pkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(PKG_JSON, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function printHelp() {
  process.stdout.write(
`AgentForge ${pkgVersion()}

Usage:
  agentforge init <adapter> [--dir <path>]
  agentforge --version
  agentforge --help

Adapters:
  claude-code   Emit a Claude Code config tree (default dir: ~/.claude)
  codex         Emit a Codex CLI config tree (default dir: ~/.codex)
  generic       Emit a portable AGENTS.md + memory skeleton (--dir required)

Examples:
  npx agentforge init claude-code
  npx agentforge init codex --dir ~/.codex-dev
  npx agentforge init generic --dir ./my-agent-config

Docs: https://github.com/KM-it-ops/AgentForge
`);
}

function fail(msg) {
  process.stderr.write(`agentforge: ${msg}\n`);
  process.stderr.write(`Run \`agentforge --help\` for usage.\n`);
  process.exit(2);
}

function parseInitArgs(argv) {
  // argv arrives without the "init" token.
  let adapter = null;
  let dir = null;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--dir' || tok === '-d') {
      dir = argv[++i];
      if (!dir) fail('--dir requires a path argument');
    } else if (tok.startsWith('--dir=')) {
      dir = tok.slice('--dir='.length);
    } else if (tok === '--help' || tok === '-h') {
      printHelp();
      process.exit(0);
    } else if (tok.startsWith('-')) {
      fail(`unknown flag: ${tok}`);
    } else if (!adapter) {
      adapter = tok;
    } else {
      fail(`unexpected positional argument: ${tok}`);
    }
  }
  return { adapter, dir };
}

function expandTilde(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function runInit(argv) {
  const { adapter, dir } = parseInitArgs(argv);

  if (!adapter) fail('missing adapter name. Try: agentforge init claude-code');
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    fail(`unknown adapter "${adapter}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
  }

  const cfg = ADAPTERS[adapter];
  const target = path.resolve(expandTilde(dir) || cfg.defaultDir || '');
  if (!target) {
    fail(`adapter "${adapter}" has no default directory; pass --dir <path>`);
  }

  const emit = path.join(ADAPTERS_DIR, adapter, 'emit.js');
  if (!fs.existsSync(emit)) {
    fail(`emit.js missing for adapter "${adapter}" at ${emit} (package corrupt?)`);
  }

  process.stdout.write(`[agentforge] adapter=${adapter} target=${target}\n`);

  const res = spawnSync(process.execPath, [emit, target], {
    stdio: 'inherit',
  });

  if (res.error) fail(`failed to spawn emit.js: ${res.error.message}`);
  process.exit(res.status == null ? 1 : res.status);
}

function main(argv) {
  if (argv.length === 0) { printHelp(); process.exit(0); }

  const cmd = argv[0];
  const rest = argv.slice(1);

  switch (cmd) {
    case 'init':
      return runInit(rest);
    case '--version':
    case '-v':
      process.stdout.write(`${pkgVersion()}\n`);
      return process.exit(0);
    case '--help':
    case '-h':
      printHelp();
      return process.exit(0);
    default:
      fail(`unknown command: ${cmd}`);
  }
}

main(process.argv.slice(2));
