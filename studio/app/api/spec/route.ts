import { NextResponse } from "next/server";

import { loadRepoSpecFiles } from "@/lib/spec-defaults";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const specFiles = loadRepoSpecFiles();
    return NextResponse.json({ specFiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load spec";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
