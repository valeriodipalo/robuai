import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import type { Profile, VoiceId } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/profile?deviceId=... -> Profile | null.
export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId");
  if (!deviceId || !isSupabaseConfigured()) {
    return NextResponse.json(null);
  }

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(null);
  }

  return NextResponse.json((data ?? null) as Profile | null);
}

interface ProfileBody {
  deviceId?: string;
  voiceId?: VoiceId;
  ageRange?: string | null;
  intent?: string | null;
  interests?: string[] | null;
  notes?: string | null;
}

// POST /api/profile -> upsert and return the saved Profile.
export async function POST(request: NextRequest) {
  let body: ProfileBody;
  try {
    body = (await request.json()) as ProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deviceId, voiceId, ageRange, intent, interests, notes } = body;

  if (!deviceId || !voiceId) {
    return NextResponse.json(
      { error: "deviceId and voiceId are required" },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    // No persistence available — echo back the would-be saved profile.
    const profile: Profile = {
      device_id: deviceId,
      voice_id: voiceId,
      age_range: ageRange ?? null,
      intent: intent ?? null,
      interests: interests ?? null,
      notes: notes ?? null,
    };
    return NextResponse.json(profile);
  }

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .upsert(
      {
        device_id: deviceId,
        voice_id: voiceId,
        age_range: ageRange ?? null,
        intent: intent ?? null,
        interests: interests ?? null,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save profile" },
      { status: 500 }
    );
  }

  return NextResponse.json(data as Profile);
}
