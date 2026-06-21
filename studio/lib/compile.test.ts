import { describe, expect, it } from "vitest";

import type { CompileRequest } from "@/lib/schemas";
import { compileAdapter } from "@/lib/compile";
import { loadRepoSpecFiles } from "@/lib/spec-defaults";

function repoSpecForCompile(): CompileRequest["specFiles"] {
  const raw = loadRepoSpecFiles();
  return {
    "identity.yaml": raw["identity.yaml"] ?? "",
    "router.yaml": raw["router.yaml"] ?? "",
    "memory.yaml": raw["memory.yaml"] ?? "",
    "telemetry.yaml": raw["telemetry.yaml"] ?? "",
    "automation.yaml": raw["automation.yaml"] ?? "",
    ...(raw["mcp.yaml"] ? { "mcp.yaml": raw["mcp.yaml"] } : {}),
  };
}

describe("compileAdapter", () => {
  it("compiles cursor adapter with repo spec into files", () => {
    const specFiles = repoSpecForCompile();
    const result = compileAdapter("cursor", specFiles);

    expect(result.meta.adapter).toBe("cursor");
    expect(result.meta.fileCount).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path.includes(".cursor/rules/identity.mdc"))).toBe(
      true,
    );
  });

  it("compiles generic adapter with repo spec", () => {
    const specFiles = repoSpecForCompile();
    const result = compileAdapter("generic", specFiles);
    expect(result.files.some((f) => f.path === "AGENTS.md")).toBe(true);
  });
});
