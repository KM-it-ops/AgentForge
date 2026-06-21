import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { rateLimited, readJsonBody } from "@/lib/api-utils";
import { CompileError, compileAdapter } from "@/lib/compile";
import { compileRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = rateLimited(request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const parsed = compileRequestSchema.parse(body.data);
    const result = compileAdapter(parsed.adapter, parsed.specFiles);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten() },
        { status: 400 },
      );
    }
    if (err instanceof CompileError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Compile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
