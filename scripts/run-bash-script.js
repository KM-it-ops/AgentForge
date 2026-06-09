#!/usr/bin/env node
// Runs AgentForge's Bash verification scripts from npm on Windows, macOS, and Linux.
// On Windows, prefer Git Bash over WSL bash when WSL cannot see Node/npm.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const script = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!script) {
  process.stderr.write('Usage: node scripts/run-bash-script.js <script> [args...]\n');
  process.exit(2);
}

if (!fs.existsSync(path.resolve(script))) {
  process.stderr.write(`AgentForge verification script not found: ${script}\n`);
  process.exit(2);
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

function usableBash(candidate) {
  const result = spawnSync(
    candidate,
    ['-lc', 'command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v git >/dev/null 2>&1'],
    { stdio: 'ignore', shell: false }
  );
  return result.status === 0;
}

const bash = bashCandidates().find(usableBash);

if (!bash) {
  process.stderr.write(
    [
      'No usable Bash found for AgentForge verification.',
      'Install Git Bash or set AGENTFORGE_BASH to a bash executable that can see node, npm, and git.',
      'On Windows, WSL bash may be first on PATH but still fail if Node is installed only on Windows.',
      '',
    ].join('\n')
  );
  process.exit(127);
}

const result = spawnSync(bash, [script, ...scriptArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  process.stderr.write(`Failed to run ${script} with ${bash}: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
