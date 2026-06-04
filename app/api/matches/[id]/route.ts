import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { signedUrl, removeScreenshots } from "@/lib/storage";
import type { Match, Message, Upload, Comment } from "@/lib/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/matches/[id] -> { match, messages, uploads, comments }.
// messages/comments oldest first; uploads newest first, each with a fresh
// signed URL for the stored screenshot (minted here, never persisted).
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const empty = {
    match: null as Match | null,
    messages: [] as Message[],
    uploads: [] as Upload[],
    comments: [] as Comment[],
  };
  if (!isSupabaseConfigured()) {
    return NextResponse.json(empty);
  }

  const db = supabaseAdmin();

  const [
    { data: match, error: matchError },
    { data: messages, error: messagesError },
    { data: uploads, error: uploadsError },
    { data: comments, error: commentsError },
  ] = await Promise.all([
    db.from("matches").select("*").eq("id", id).maybeSingle(),
    db.from("messages").select("*").eq("match_id", id).order("created_at", { ascending: true }),
    db.from("uploads").select("*").eq("match_id", id).order("created_at", { ascending: false }),
    db.from("comments").select("*").eq("match_id", id).order("created_at", { ascending: true }),
  ]);

  if (matchError || messagesError || uploadsError || commentsError) {
    return NextResponse.json(empty);
  }

  const uploadRows = (uploads ?? []) as Upload[];
  const withUrls = await Promise.all(
    uploadRows.map(async (u) => ({ ...u, signedUrl: await signedUrl(u.storage_path) })),
  );

  return NextResponse.json({
    match: (match ?? null) as Match | null,
    messages: (messages ?? []) as Message[],
    uploads: withUrls,
    comments: (comments ?? []) as Comment[],
  });
}

// DELETE /api/matches/[id] -> { ok: true } (messages cascade).
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const db = supabaseAdmin();

  // Remove the stored screenshots first — the DB cascades, but Storage objects
  // do not, so they'd orphan otherwise.
  const { data: uploads } = await db.from("uploads").select("storage_path").eq("match_id", id);
  await removeScreenshots((uploads ?? []).map((u) => u.storage_path as string));

  const { error } = await db.from("matches").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
