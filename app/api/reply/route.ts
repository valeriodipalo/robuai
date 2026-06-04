import { NextResponse } from "next/server";
import { streamChat, completeChat } from "@/lib/openrouter";
import {
  buildSinglePrompt,
  buildSingleUser,
  buildAlternateUser,
  splitReplyMeta,
} from "@/lib/prompt";
import { getVoice } from "@/lib/voices";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { uploadScreenshot } from "@/lib/storage";
import { Stage, Message, ReplyRequest, ReplyOption } from "@/lib/types";

export const runtime = "nodejs";

const STAGES: Stage[] = ["opener", "reply", "escalate"];
function coerceStage(value: string): Stage {
  return (STAGES as string[]).includes(value) ? (value as Stage) : "reply";
}

export async function POST(request: Request) {
  let body: ReplyRequest;
  try {
    body = (await request.json()) as ReplyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { imageDataUrl, voiceId, deviceId } = body;
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
    return NextResponse.json(
      { error: "A valid imageDataUrl (data:image/...) is required." },
      { status: 400 }
    );
  }
  if (!voiceId) return NextResponse.json({ error: "voiceId is required." }, { status: 400 });
  if (!deviceId) return NextResponse.json({ error: "deviceId is required." }, { status: 400 });

  const configured = isSupabaseConfigured();

  // Load profile + full thread history (memory) before streaming.
  let ageRange: string | null = null;
  let intent: string | null = null;
  let interests: string[] | null = null;
  let profileVoiceId: string | null = null;
  let history: Pick<Message, "role" | "content">[] | undefined;

  if (configured) {
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from("profiles")
      .select()
      .eq("device_id", deviceId)
      .maybeSingle();
    if (profile) {
      ageRange = profile.age_range ?? null;
      intent = profile.intent ?? null;
      interests = profile.interests ?? null;
      profileVoiceId = profile.voice_id ?? null;
    }
    if (body.matchId) {
      const { data: prior } = await db
        .from("messages")
        .select("role, content")
        .eq("match_id", body.matchId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (prior?.length) {
        history = prior.map((m) => ({
          role: m.role as Message["role"],
          content: m.content as string,
        }));
      }
    }
  }

  const voice = getVoice(voiceId || profileVoiceId);
  const system = buildSinglePrompt({ voice, ageRange, intent, interests });
  const userText = buildSingleUser(history);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // ── Start the conversation UP FRONT: create the match (if new) and store
      //    the screenshot before the AI runs, so the conversation + image
      //    survive even if the model call fails. Best-effort — never block the
      //    reply on storage/match creation. ──
      let matchId = body.matchId || "";
      let uploadId = "";
      if (configured) {
        const db = supabaseAdmin();
        try {
          if (!body.matchId) {
            const { data: ins } = await db
              .from("matches")
              .insert({ device_id: deviceId })
              .select("id")
              .single();
            if (ins) matchId = ins.id as string;
          }
          if (matchId) {
            const id = crypto.randomUUID();
            const up = await uploadScreenshot({ deviceId, matchId, uploadId: id, dataUrl: imageDataUrl });
            if (up) {
              await db.from("uploads").insert({
                id,
                match_id: matchId,
                device_id: deviceId,
                storage_path: up.storagePath,
                content_type: up.contentType,
                byte_size: up.byteSize,
              });
              uploadId = id;
            }
          }
        } catch {
          // keep going — a stored conversation is best-effort, the reply is not
        }
      }
      // First event: the client can mark the conversation active immediately.
      send({ type: "conversation", matchId, uploadId });

      try {
        // ── Primary option: stream it live ─────────────────────────
        let raw = "";
        for await (const delta of streamChat({ system, userText, imageDataUrl })) {
          raw += delta;
          send({ type: "delta", text: delta });
        }
        const primary = splitReplyMeta(raw);
        const stage = coerceStage(primary.meta.stage);
        const reply0 = primary.reply;

        // ── Persist the turn (her line, primary suggestion, turn) onto the
        //    conversation created above. The match already exists, so we UPDATE
        //    its name/snippet (name is only known now the model has read it). ──
        let turnId = "";
        let suggestionMsgId: string | null = null;
        if (configured && reply0 && matchId) {
          const db = supabaseAdmin();
          const now = new Date().toISOString();
          {
            const update: Record<string, unknown> = {
              last_stage: stage,
              last_snippet: reply0,
              updated_at: now,
            };
            if (primary.meta.matchName) update.name = primary.meta.matchName;
            await db.from("matches").update(update).eq("id", matchId);
          }
          {
            // Explicit, monotonically increasing timestamps keep the seeded
            // back-and-forth in order (a batch insert shares one now()).
            const baseMs = Date.now();
            const stamp = (i: number) => new Date(baseMs + i).toISOString();

            if (!body.matchId) {
              // New thread: seed the FULL conversation the model read from the
              // screenshot — her lines as 'them', his prior lines as 'sent'.
              const seed = (primary.meta.transcript ?? [])
                .filter((t) => t.text)
                .map((t, i) => ({
                  match_id: matchId,
                  role: t.from === "him" ? "sent" : "them",
                  content: t.text,
                  stage,
                  created_at: stamp(i),
                }));
              // Fallback when the model returned no transcript but read a line.
              if (!seed.length && stage !== "opener" && primary.meta.read) {
                seed.push({
                  match_id: matchId,
                  role: "them",
                  content: primary.meta.read,
                  stage,
                  created_at: stamp(0),
                });
              }
              if (seed.length) await db.from("messages").insert(seed);
            } else if (stage !== "opener" && primary.meta.read) {
              // Continuing thread: only the new incoming line (prior turns are
              // already stored), so we don't duplicate the history.
              await db
                .from("messages")
                .insert({
                  match_id: matchId,
                  role: "them",
                  content: primary.meta.read,
                  stage,
                  created_at: stamp(0),
                });
            }
            const { data: sug } = await db
              .from("messages")
              .insert({
                match_id: matchId,
                role: "suggestion",
                content: reply0,
                stage,
                created_at: stamp(1000),
              })
              .select("id")
              .single();
            if (sug) suggestionMsgId = sug.id as string;
            const { data: turn } = await db
              .from("turns")
              .insert({
                match_id: matchId,
                device_id: deviceId,
                stage,
                transcript: primary.meta.transcript,
                options: [{ reply: reply0, why: primary.meta.why }],
                suggestion_message_id: suggestionMsgId,
              })
              .select("id")
              .single();
            if (turn) turnId = turn.id as string;
            // Link the screenshot to the turn it produced (image still belongs
            // to the conversation, so this is a back-reference, not ownership).
            if (turnId && uploadId) {
              await db.from("uploads").update({ turn_id: turnId }).eq("id", uploadId);
            }
          }
        }

        send({
          type: "primary",
          reply: reply0,
          stage,
          read: primary.meta.read,
          matchName: primary.meta.matchName,
          why: primary.meta.why,
          matchId,
          turnId,
          suggestionMessageId: suggestionMsgId,
          uploadId,
        });

        // ── Alternate options (different angles) for the swipe deck ──
        const options: ReplyOption[] = [{ reply: reply0, why: primary.meta.why }];
        const altUser = buildAlternateUser(history, [reply0]);
        const raws = await Promise.all([
          completeChat({ system, userText: altUser, imageDataUrl }).catch(() => ""),
          completeChat({ system, userText: altUser, imageDataUrl }).catch(() => ""),
        ]);
        for (const r of raws) {
          const o = splitReplyMeta(r);
          if (o.reply && !options.some((x) => x.reply === o.reply)) {
            options.push({ reply: o.reply, why: o.meta.why });
            send({ type: "option", reply: o.reply, why: o.meta.why });
          }
        }

        if (configured && turnId && options.length > 1) {
          await supabaseAdmin().from("turns").update({ options }).eq("id", turnId);
        }

        send({ type: "done", options, matchId, turnId, uploadId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error.";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
