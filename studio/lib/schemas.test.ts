import { describe, expect, it } from "vitest";

import { compileRequestSchema, MAX_COMPILE_BODY_BYTES } from "@/lib/schemas";

describe("compileRequestSchema", () => {
  const valid = {
    adapter: "cursor" as const,
    specFiles: {
      "identity.yaml": "schema_version: 1\n",
      "router.yaml": "schema_version: 1\n",
      "memory.yaml": "schema_version: 1\n",
      "telemetry.yaml": "schema_version: 1\n",
      "automation.yaml": "schema_version: 1\n",
    },
  };

  it("accepts valid MVP payload", () => {
    expect(compileRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown adapter", () => {
    expect(() =>
      compileRequestSchema.parse({ ...valid, adapter: "gemini-cli" }),
    ).toThrow();
  });

  it("rejects missing required spec key", () => {
    const partial = { ...valid.specFiles };
    delete (partial as Partial<typeof partial>)["identity.yaml"];
    expect(() =>
      compileRequestSchema.parse({ adapter: "cursor", specFiles: partial }),
    ).toThrow();
  });
});

describe("MAX_COMPILE_BODY_BYTES", () => {
  it("is 512KB", () => {
    expect(MAX_COMPILE_BODY_BYTES).toBe(512 * 1024);
  });
});
