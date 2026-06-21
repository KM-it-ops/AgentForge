import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { CompileRequest, CompileResponse, StudioAdapter } from "@/lib/schemas";
import { getAdapterEmitPath } from "@/lib/paths";

const SPEC_FILE_NAMES = [
  "identity.yaml",
  "router.yaml",
  "memory.yaml",
  "telemetry.yaml",
  "automation.yaml",
  "mcp.yaml",
] as const;

function writeSpecFiles(specDir: string, specFiles: CompileRequest["specFiles"]): void {
  fs.mkdirSync(specDir, { recursive: true });
  for (const name of SPEC_FILE_NAMES) {
    const content = specFiles[name as keyof typeof specFiles];
    if (content === undefined || content === "") continue;
    fs.writeFileSync(path.join(specDir, name), content, "utf8");
  }
}

function collectFiles(dir: string, base: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      out.push(...collectFiles(abs, base));
    } else if (entry.isFile()) {
      out.push({ path: rel, content: fs.readFileSync(abs, "utf8") });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function parseEmitError(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`.trim();
  const lines = combined.split(/\r?\n/).filter(Boolean);
  return lines.slice(-8).join("\n") || "Emitter exited with non-zero status";
}

export function compileAdapter(
  adapter: StudioAdapter,
  specFiles: CompileRequest["specFiles"],
): CompileResponse {
  const scratch = path.join(os.tmpdir(), `agentforge-studio-${randomUUID()}`);
  const specDir = path.join(scratch, "spec");
  const outDir = path.join(scratch, "out");
  const started = Date.now();

  try {
    writeSpecFiles(specDir, specFiles);
    fs.mkdirSync(outDir, { recursive: true });

    const emitPath = getAdapterEmitPath(adapter);
    if (!fs.existsSync(emitPath)) {
      throw new CompileError(`Adapter emitter not found: ${emitPath}`, 422);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENTFORGE_SPEC_DIR: specDir,
    };
    const mcp = specFiles["mcp.yaml"];
    if (mcp) {
      env.AGENTFORGE_MCP_SPEC = path.join(specDir, "mcp.yaml");
    }

    const result = spawnSync(process.execPath, [emitPath, outDir], {
      encoding: "utf8",
      env,
      maxBuffer: 16 * 1024 * 1024,
    });

    if (result.error) {
      throw new CompileError(`Failed to spawn emitter: ${result.error.message}`, 500);
    }
    if (result.status !== 0) {
      throw new CompileError(parseEmitError(result.stderr ?? "", result.stdout ?? ""), 422);
    }

    const files = collectFiles(outDir, outDir);
    return {
      files,
      meta: {
        adapter,
        fileCount: files.length,
        durationMs: Date.now() - started,
      },
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export class CompileError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CompileError";
    this.status = status;
  }
}
