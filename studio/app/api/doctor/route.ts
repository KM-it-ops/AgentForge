import { NextRequest, NextResponse } from "next/server";

import { rateLimited } from "@/lib/api-utils";
import { DoctorError, runDoctor } from "@/lib/doctor";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = rateLimited(request);
  if (limited) return limited;

  try {
    const result = runDoctor();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DoctorError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Doctor failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
