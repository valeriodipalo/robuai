import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { ReplyOption } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Record which swipe option the user actually picked. Updates the turn, and
 * realigns the thread's stored suggestion + the match snippet to that choice so
 * memory reflects what he really used (and so we can tune the voice later).
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  let body: { turnId?: string; index?: number; deviceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { turnId, index } = body;
  if (!turnId || typeof index !== "number") {
    return NextResponse.json({ error: "turnId and index are required." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { data: turn } = await db
      .from("turns")
      .select("id, options, suggestion_message_id, match_id, device_id")
      .eq("id", turnId)
      .maybeSingle();
    if (!turn) return NextResponse.json({ error: "Turn not found." }, { status: 404 });

    const options = (turn.options as ReplyOption[] | null) ?? [];
    const chosen = options[index];
    if (!chosen) return NextResponse.json({ error: "Option out of range." }, { status: 400 });

    await db
      .from("turns")
      .update({ selected_index: index, selected_reply: chosen.reply })
      .eq("id", turnId);

    // Realign memory: promote the kept suggestion to a durable 'sent' message —
    // a real record of what HE actually sent, not just a proposal — and update
    // the match snippet.
    if (turn.suggestion_message_id) {
      await db
        .from("messages")
        .update({ content: chosen.reply, role: "sent" })
        .eq("id", turn.suggestion_message_id);
    }
    if (turn.match_id) {
      await db
        .from("matches")
        .update({ last_snippet: chosen.reply, updated_at: new Date().toISOString() })
        .eq("id", turn.match_id);
    }

    // Copying is the strongest positive signal: record +1 for the chosen option.
    const deviceId = body.deviceId || (turn.device_id as string | null) || "";
    if (deviceId) {
      await db.from("feedback").upsert(
        {
          turn_id: turnId,
          match_id: (turn.match_id as string | null) ?? null,
          device_id: deviceId,
          option_index: index,
          reply: chosen.reply,
          score: 1,
          source: "copy",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "turn_id,option_index" },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
