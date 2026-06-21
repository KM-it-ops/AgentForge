import { z } from "zod";

export const ADAPTERS = ["claude-code", "codex", "cursor", "generic"] as const;

export type StudioAdapter = (typeof ADAPTERS)[number];

const requiredSpecKeys = [
  "identity.yaml",
  "router.yaml",
  "memory.yaml",
  "telemetry.yaml",
  "automation.yaml",
] as const;

export const specFilesSchema = z
  .object({
    "identity.yaml": z.string().min(1),
    "router.yaml": z.string().min(1),
    "memory.yaml": z.string().min(1),
    "telemetry.yaml": z.string().min(1),
    "automation.yaml": z.string().min(1),
    "mcp.yaml": z.string().optional(),
  })
  .strict();

export const compileRequestSchema = z
  .object({
    adapter: z.enum(ADAPTERS),
    specFiles: specFilesSchema,
  })
  .strict();

export type CompileRequest = z.infer<typeof compileRequestSchema>;

export const emittedFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const compileResponseSchema = z.object({
  files: z.array(emittedFileSchema),
  meta: z.object({
    adapter: z.enum(ADAPTERS),
    fileCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
});

export type CompileResponse = z.infer<typeof compileResponseSchema>;

export const doctorCheckSchema = z.object({
  name: z.string(),
  pass: z.boolean(),
  message: z.string(),
});

export const doctorResponseSchema = z.object({
  ok: z.boolean(),
  checks: z.array(doctorCheckSchema),
});

export type DoctorResponse = z.infer<typeof doctorResponseSchema>;

export const MAX_COMPILE_BODY_BYTES = 512 * 1024;

export const SPEC_TAB_LABELS: Readonly<Record<(typeof requiredSpecKeys)[number], string>> = {
  "identity.yaml": "Identity",
  "router.yaml": "Router",
  "memory.yaml": "Memory",
  "telemetry.yaml": "Telemetry",
  "automation.yaml": "Automation",
};

export const SPEC_FILE_NAMES = [...requiredSpecKeys, "mcp.yaml"] as const;
