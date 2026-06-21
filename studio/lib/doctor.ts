import { spawnSync } from "node:child_process";

import type { DoctorResponse } from "@/lib/schemas";
import { getAgentforgeCliPath } from "@/lib/paths";

type RawDoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type RawDoctorJson = {
  ok: boolean;
  checks: RawDoctorCheck[];
};

export function runDoctor(): DoctorResponse {
  const cli = getAgentforgeCliPath();
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    throw new DoctorError(`Failed to spawn doctor: ${result.error.message}`, 500);
  }

  const raw = result.stdout?.trim();
  if (!raw) {
    throw new DoctorError(
      result.stderr?.trim() || "Doctor produced no output",
      result.status === 0 ? 500 : 502,
    );
  }

  let parsed: RawDoctorJson;
  try {
    parsed = JSON.parse(raw) as RawDoctorJson;
  } catch {
    throw new DoctorError("Doctor returned invalid JSON", 502);
  }

  return {
    ok: parsed.ok,
    checks: parsed.checks.map((c) => ({
      name: c.name,
      pass: c.ok,
      message: c.detail,
    })),
  };
}

export class DoctorError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DoctorError";
    this.status = status;
  }
}
