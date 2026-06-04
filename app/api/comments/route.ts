import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { Comment, CommentRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Record a free-text user comment. `messageId` null = a whole-conversation note;
 * set = a comment on that specific message. Distinct from feedback (the score).
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  let body: CommentRequest;
  try {
    body = (await request.json()) as CommentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { deviceId, matchId, messageId, turnId, optionIndex } = body;
  const text = (body.body ?? "").trim();
  if (!deviceId) return NextResponse.json({ error: "deviceId is required." }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "matchId is required." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "A non-empty body is required." }, { status: 400 });

  try {
    const { data, error } = await supabaseAdmin()
      .from("comments")
      .insert({
        match_id: matchId,
        device_id: deviceId,
        message_id: messageId ?? null,
        turn_id: turnId ?? null,
        option_index: typeof optionIndex === "number" ? optionIndex : null,
        body: text,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, comment: data as Comment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/comments?matchId=... -> Comment[] for that conversation, oldest first.
export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");
  if (!matchId || !isSupabaseConfigured()) {
    return NextResponse.json([] as Comment[]);
  }
  const { data, error } = await supabaseAdmin()
    .from("comments")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json([] as Comment[]);
  return NextResponse.json((data ?? []) as Comment[]);
}
