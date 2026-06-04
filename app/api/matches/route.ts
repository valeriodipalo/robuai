import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import type { Match } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/matches?deviceId=... -> Match[] for that device, newest first.
export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId");
  if (!deviceId || !isSupabaseConfigured()) {
    return NextResponse.json([] as Match[]);
  }

  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("*")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json([] as Match[]);
  }

  return NextResponse.json((data ?? []) as Match[]);
}
