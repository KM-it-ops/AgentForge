import { describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows burst then blocks", () => {
    resetRateLimits();
    const key = "test-ip";
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    expect(checkRateLimit(key).allowed).toBe(false);
  });
});
