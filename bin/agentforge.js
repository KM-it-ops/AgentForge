#!/usr/bin/env node
// AgentForge CLI — `npx agentforge init <adapter> [--dir <path>]`
//
// Thin wrapper around adapters/<adapter>/emit.js. Resolves the canonical
// install dir per adapter when --dir is not supplied:
//   claude-code → ~/.claude
//   codex       → ~/.codex
//   generic     → must be supplied via --dir (no canonical default)
//   cursor      → must be supplied via --dir (no canonical default)

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
  'gemini-cli':  { defaultDir: path.join(os.homedir(), '.gemini') },
  'generic':     { defaultDir: null },
  'cursor':      { defaultDir: null },
  'aider':       { defaultDir: null },
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
  agentforge doctor [--json]
  agentforge --version
  agentforge --help

Adapters:
  claude-code   Emit a Claude Code config tree (default dir: ~/.claude)
  codex         Emit a Codex CLI config tree (default dir: ~/.codex)
  gemini-cli    Emit a Gemini CLI config tree: GEMINI.md + settings.json (default dir: ~/.gemini)
  generic       Emit a portable AGENTS.md + memory skeleton (--dir required)
  cursor        Emit a portable .cursorrules + .cursor/rules/*.mdc (--dir required)
  aider         Emit a portable CONVENTIONS.md + .aider.conf.yml (--dir required)

Examples:
  npx agentforge init claude-code
  npx agentforge init codex --dir ~/.codex-dev
  npx agentforge init gemini-cli
  npx agentforge init cursor --dir ./my-cursor-config
  npx agentforge init generic --dir ./my-agent-config
  npx agentforge init aider --dir ./my-aider-project
  npx agentforge doctor

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

function commandCandidates(cmd) {
  if (process.platform === 'win32' && !/\.(cmd|exe|bat)$/i.test(cmd)) {
    if (cmd === 'npm' || cmd === 'npx') {
      return [`${cmd}.cmd`, `${cmd}.exe`, cmd];
    }
    return [cmd, `${cmd}.cmd`, `${cmd}.exe`];
  }
  return [cmd];
}

function commandCheck(name, cmd, args) {
  let last = null;
  for (const candidate of commandCandidates(cmd)) {
    const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate);
    const res = spawnSync(candidate, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needsShell,
    });
    last = res;
    if (res.status === 0) {
      const output = ((res.stdout || '') + (res.stderr || '')).trim().split(/\r?\n/)[0] || '';
      return { name, ok: true, detail: output };
    }
    if (res.error && ['ENOENT', 'EINVAL'].includes(res.error.code)) continue;
    break;
  }

  const output = last ? ((last.stdout || '') + (last.stderr || '')).trim().split(/\r?\n/)[0] || '' : '';
  return {
    name,
    ok: false,
    detail: last?.error ? last.error.message : output || `exit ${last?.status ?? 'unknown'}`,
  };
}

function bashCandidates() {
  const out = [];
  if (process.env.AGENTFORGE_BASH) out.push(process.env.AGENTFORGE_BASH);
  if (process.platform === 'win32') {
    out.push(
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'bash'
    );
  } else {
    out.push('bash');
  }
  return [...new Set(out.filter(Boolean))];
}

function usableBashCheck() {
  for (const candidate of bashCandidates()) {
    const res = spawnSync(
      candidate,
      ['-lc', 'command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v git >/dev/null 2>&1'],
      { stdio: 'ignore' }
    );
    if (res.status === 0) {
      return { name: 'usable bash', ok: true, detail: candidate };
    }
  }
  return {
    name: 'usable bash',
    ok: false,
    detail: 'No bash found that can see node, npm, and git. Install Git Bash or set AGENTFORGE_BASH.',
  };
}

function specFilesCheck() {
  const files = ['identity.yaml', 'router.yaml', 'memory.yaml', 'telemetry.yaml', 'automation.yaml'];
  const missing = files.filter((f) => !fs.existsSync(path.join(PKG_ROOT, 'spec', f)));
  return {
    name: 'spec files',
    ok: missing.length === 0,
    detail: missing.length === 0 ? `${files.length} required spec files found` : `missing: ${missing.join(', ')}`,
  };
}

function mcpSpecCheck() {
  // Informational only — spec/mcp.yaml is OPTIONAL. Never fails.
  const present = fs.existsSync(path.join(PKG_ROOT, 'spec', 'mcp.yaml'));
  return {
    name: 'mcp spec (optional)',
    ok: true,
    detail: present ? 'spec/mcp.yaml present (per-adapter MCP registration enabled)' : 'spec/mcp.yaml absent (no MCP registration emitted)',
  };
}

function adapterEmittersCheck() {
  const missing = Object.keys(ADAPTERS).filter((adapter) => {
    return !fs.existsSync(path.join(ADAPTERS_DIR, adapter, 'emit.js'));
  });
  return {
    name: 'adapter emitters',
    ok: missing.length === 0,
    detail: missing.length === 0 ? `${Object.keys(ADAPTERS).length} adapter emitters found` : `missing: ${missing.join(', ')}`,
  };
}

function nodeVersionCheck() {
  const major = Number(process.versions.node.split('.')[0]);
  return {
    name: 'node >=18',
    ok: major >= 18,
    detail: `v${process.versions.node}`,
  };
}

function runDoctor(argv) {
  const json = argv.includes('--json');
  const unknown = argv.filter((arg) => arg !== '--json');
  if (unknown.length > 0) fail(`unknown doctor flag: ${unknown[0]}`);

  const checks = [
    nodeVersionCheck(),
    commandCheck('npm', 'npm', ['--version']),
    commandCheck('git', 'git', ['--version']),
    usableBashCheck(),
    specFilesCheck(),
    mcpSpecCheck(),
    adapterEmittersCheck(),
  ];
  const ok = checks.every((check) => check.ok);

  if (json) {
    process.stdout.write(JSON.stringify({ ok, checks }, null, 2) + '\n');
  } else {
    process.stdout.write('AgentForge doctor\n');
    for (const check of checks) {
      process.stdout.write(`${check.ok ? '[ok]' : '[fail]'} ${check.name}: ${check.detail}\n`);
    }
    process.stdout.write(`\nResult: ${ok ? 'ok' : 'failed'}\n`);
  }

  process.exit(ok ? 0 : 1);
}

function runInit(argv) {
  const { adapter, dir } = parseInitArgs(argv);

  if (!adapter) fail('missing adapter name. Try: agentforge init claude-code');
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    fail(`unknown adapter "${adapter}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
  }

  const cfg = ADAPTERS[adapter];
  const resolvedDir = expandTilde(dir) || cfg.defaultDir;
  if (!resolvedDir) {
    fail(`adapter "${adapter}" has no default directory; pass --dir <path>`);
  }
  const target = path.resolve(resolvedDir);

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
    case 'doctor':
      return runDoctor(rest);
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
