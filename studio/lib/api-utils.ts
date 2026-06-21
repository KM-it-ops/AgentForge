import { NextRequest, NextResponse } from "next/server";

import { MAX_COMPILE_BODY_BYTES } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

export function rateLimited(request: NextRequest): NextResponse | null {
  const ip = clientIp(request);
  const result = checkRateLimit(ip);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests", retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec ?? 60) } },
  );
}

export async function readJsonBody(request: NextRequest): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_COMPILE_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Request body exceeds ${MAX_COMPILE_BODY_BYTES} bytes` },
        { status: 413 },
      ),
    };
  }
  try {
    return { ok: true, data: raw === "" ? {} : JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}
