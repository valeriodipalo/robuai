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
import { structureChat } from "@/lib/structure";
import { Stage, Message, ReplyRequest, ReplyOption, StructuredChat } from "@/lib/types";

export const runtime = "nodejs";

const STAGES: Stage[] = ["opener", "reply", "escalate"];
function coerceStage(value: string): Stage {
  return (STAGES as string[]).includes(value) ? (value as Stage) : "reply";
}

/** Normalize message text for dedup against already-stored history. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** From a structured/transcript source, keep only lines not already stored,
 *  mapped to thread roles (him→sent, her→them). Mutates `seen` to dedup. */
function newLinesFrom(
  msgs: { from: "him" | "her"; text: string }[],
  seen: Set<string>,
): { role: "them" | "sent"; content: string }[] {
  const out: { role: "them" | "sent"; content: string }[] = [];
  for (const m of msgs) {
    const content = (m.text || "").trim();
    if (!content) continue;
    const k = norm(content);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ role: m.from === "him" ? "sent" : "them", content });
  }
  return out;
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
  // On a regeneration: every reply already proposed for this match, so the
  // model is told to avoid them and give a genuinely different angle.
  let priorProposals: string[] = [];

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
      if (body.regen) {
        const { data: priorTurns } = await db
          .from("turns")
          .select("options")
          .eq("match_id", body.matchId);
        const seen = new Set<string>();
        for (const t of priorTurns ?? []) {
          for (const o of (t.options as ReplyOption[] | null) ?? []) {
            const r = (o?.reply ?? "").trim();
            if (r && !seen.has(r)) seen.add(r);
          }
        }
        priorProposals = [...seen];
      }
    }
  }

  const voice = getVoice(voiceId || profileVoiceId);
  const system = buildSinglePrompt({ voice, ageRange, intent, interests });

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
          // On a regen the screenshot is already stored from the original turn;
          // don't duplicate it.
          if (matchId && !body.regen) {
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
        // ── Accurate "who wrote what" pass (skipped on a regen — the same
        //    moment's transcript is already stored). Single source of truth for
        //    both the reply context and the DB. ──
        const struct: StructuredChat | null = body.regen
          ? null
          : await structureChat(imageDataUrl);

        // Merge the freshly-read conversation onto the stored thread, deduped,
        // so the writer sees the full accurate back-and-forth (and we know which
        // lines are new to persist). On a regen there's nothing new to add.
        const seen = new Set((history ?? []).map((m) => norm(m.content)));
        const newFromStruct = struct?.messages?.length
          ? newLinesFrom(struct.messages, seen)
          : [];
        const writerHistory: Pick<Message, "role" | "content">[] = [
          ...(history ?? []),
          ...newFromStruct,
        ];
        const userText = buildSingleUser(
          writerHistory.length ? writerHistory : history,
          body.regen ? priorProposals : undefined,
        );

        // ── Primary option: stream it live ─────────────────────────
        let raw = "";
        for await (const delta of streamChat({ system, userText, imageDataUrl })) {
          raw += delta;
          send({ type: "delta", text: delta });
        }
        const primary = splitReplyMeta(raw);
        const stage = coerceStage(primary.meta.stage);
        const reply0 = primary.reply;
        // Prefer the structuring pass's name (read from the header) over the
        // writer's; the writer can hallucinate a name.
        const matchName = struct?.matchName ?? primary.meta.matchName;

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
            if (matchName) update.name = matchName;
            await db.from("matches").update(update).eq("id", matchId);
          }
          {
            // Explicit, monotonically increasing timestamps keep the seeded
            // back-and-forth in order (a batch insert shares one now()).
            const baseMs = Date.now();
            const stamp = (i: number) => new Date(baseMs + i).toISOString();

            // Chat history to persist: the new lines from the structuring pass
            // (deduped against what's already stored). On a regen there's
            // nothing new. If structuring failed, fall back to the writer's own
            // transcript / read line so the conversation is still recorded.
            let toStore = newFromStruct;
            if (!body.regen && !struct) {
              const fbSeen = new Set((history ?? []).map((m) => norm(m.content)));
              toStore = newLinesFrom(
                (primary.meta.transcript ?? []).map((t) => ({ from: t.from, text: t.text })),
                fbSeen,
              );
              if (!toStore.length && body.matchId && stage !== "opener" && primary.meta.read) {
                toStore = [{ role: "them", content: primary.meta.read }];
              }
            }
            if (toStore.length) {
              await db.from("messages").insert(
                toStore.map((m, i) => ({
                  match_id: matchId,
                  role: m.role,
                  content: m.content,
                  stage,
                  created_at: stamp(i),
                })),
              );
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
            const transcriptForTurn = struct?.messages?.length
              ? struct.messages.map((m) => ({ from: m.from, text: m.text }))
              : primary.meta.transcript;
            const { data: turn } = await db
              .from("turns")
              .insert({
                match_id: matchId,
                device_id: deviceId,
                stage,
                transcript: transcriptForTurn,
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
          matchName,
          why: primary.meta.why,
          matchId,
          turnId,
          suggestionMessageId: suggestionMsgId,
          uploadId,
        });

        // ── Alternate options (different angles) for the swipe deck ──
        const options: ReplyOption[] = [{ reply: reply0, why: primary.meta.why }];
        const altUser = buildAlternateUser(
          writerHistory.length ? writerHistory : history,
          body.regen ? [reply0, ...priorProposals] : [reply0],
        );
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
