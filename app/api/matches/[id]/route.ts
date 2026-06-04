import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import type { Match, Message } from "@/lib/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/matches/[id] -> { match, messages } (messages oldest first).
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ match: null, messages: [] as Message[] });
  }

  const db = supabaseAdmin();

  const [{ data: match, error: matchError }, { data: messages, error: messagesError }] =
    await Promise.all([
      db.from("matches").select("*").eq("id", id).maybeSingle(),
      db
        .from("messages")
        .select("*")
        .eq("match_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (matchError || messagesError) {
    return NextResponse.json({ match: null, messages: [] as Message[] });
  }

  return NextResponse.json({
    match: (match ?? null) as Match | null,
    messages: (messages ?? []) as Message[],
  });
}

// DELETE /api/matches/[id] -> { ok: true } (messages cascade).
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin().from("matches").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
