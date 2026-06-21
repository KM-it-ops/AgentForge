import { describe, expect, it } from "vitest";

import { runDoctor } from "@/lib/doctor";

describe("runDoctor", () => {
  it("returns real checks from agentforge doctor --json", () => {
    const result = runDoctor();
    expect(typeof result.ok).toBe("boolean");
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
    expect(result.checks.some((c) => c.name === "node >=18")).toBe(true);
    expect(result.checks.every((c) => typeof c.message === "string")).toBe(true);
  });
});
