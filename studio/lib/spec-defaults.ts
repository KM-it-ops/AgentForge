import fs from "node:fs";
import path from "node:path";

import { getSpecDir } from "@/lib/paths";
import { SPEC_FILE_NAMES } from "@/lib/schemas";

export type SpecFilesRecord = Record<string, string>;

export function loadRepoSpecFiles(): SpecFilesRecord {
  const specDir = getSpecDir();
  const out: SpecFilesRecord = {};

  for (const name of SPEC_FILE_NAMES) {
    const filePath = path.join(specDir, name);
    if (fs.existsSync(filePath)) {
      out[name] = fs.readFileSync(filePath, "utf8");
    }
  }

  const required = [
    "identity.yaml",
    "router.yaml",
    "memory.yaml",
    "telemetry.yaml",
    "automation.yaml",
  ] as const;

  for (const name of required) {
    if (!out[name]) {
      throw new Error(`Missing required spec file: ${path.join(specDir, name)}`);
    }
  }

  return out;
}
