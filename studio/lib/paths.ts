import fs from "node:fs";
import path from "node:path";

/** AgentForge repo root — walks up until spec/identity.yaml is found. */
function findRepoRoot(start: string): string {
  const envRoot = process.env.AGENTFORGE_REPO_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, "spec", "identity.yaml"))) {
    return path.resolve(envRoot);
  }

  let dir = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, "spec", "identity.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.resolve(start, "..");
}

export function getRepoRoot(): string {
  return findRepoRoot(process.cwd());
}

export function getSpecDir(): string {
  return path.join(getRepoRoot(), "spec");
}

export function getAdapterEmitPath(adapter: string): string {
  return path.join(getRepoRoot(), "adapters", adapter, "emit.js");
}

export function getAgentforgeCliPath(): string {
  return path.join(getRepoRoot(), "bin", "agentforge.js");
}
