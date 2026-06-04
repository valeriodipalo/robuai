import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { FeedbackRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Record a swipe judgment on a single option: -1 (swiped left / rejected) or
 * +1 (swiped right / liked). Upserted on (turn_id, option_index) so the user's
 * latest judgment for a card wins instead of piling up duplicate rows. Kept for
 * voice tuning — which angles he rejects vs. keeps.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  let body: FeedbackRequest;
  try {
    body = (await request.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { turnId, matchId, index, reply, score, deviceId, source } = body;
  if (!turnId) return NextResponse.json({ error: "turnId is required." }, { status: 400 });
  if (!deviceId) return NextResponse.json({ error: "deviceId is required." }, { status: 400 });
  if (typeof index !== "number" || index < 0) {
    return NextResponse.json({ error: "A valid option index is required." }, { status: 400 });
  }
  if (score !== -1 && score !== 1) {
    return NextResponse.json({ error: "score must be -1 or 1." }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin()
      .from("feedback")
      .upsert(
        {
          turn_id: turnId,
          match_id: matchId || null,
          device_id: deviceId,
          option_index: index,
          reply: reply ?? null,
          score,
          source: source === "copy" ? "copy" : "swipe",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "turn_id,option_index" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
