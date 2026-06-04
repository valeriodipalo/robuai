"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import type {
  Comment,
  Match,
  Message,
  Profile,
  ReplyResponse,
  Upload,
  VoiceId,
} from "@/lib/types";
import Onboarding, { type OnboardingValues } from "@/components/Onboarding";
import Home from "@/components/Home";
import Loading from "@/components/Loading";
import Result from "@/components/Result";
import History from "@/components/History";
import Thread from "@/components/Thread";
import BottomTabs, { type Tab } from "@/components/BottomTabs";
import { VoiceSheet } from "@/components/VoicePicker";

type View =
  | "boot"
  | "onboarding"
  | "home"
  | "loading"
  | "result"
  | "history"
  | "thread";

export default function Page() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [view, setView] = useState<View>("boot");
  const [profile, setProfile] = useState<Profile | null>(null);

  // upload / reply state
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [continuingName, setContinuingName] = useState<string | null>(null);
  const [result, setResult] = useState<ReplyResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");

  // history / thread state
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [threadMatch, setThreadMatch] = useState<Match | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadUploads, setThreadUploads] = useState<Upload[]>([]);
  const [threadComments, setThreadComments] = useState<Comment[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // ui
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [onboardBusy, setOnboardBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voiceId: VoiceId = profile?.voice_id ?? "playful";

  // ── boot: resolve device + profile ───────────────────────────────
  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    if (!id) {
      setView("onboarding");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/profile?deviceId=${encodeURIComponent(id)}`);
        const data = res.ok ? ((await res.json()) as Profile | null) : null;
        if (data && data.voice_id) {
          setProfile(data);
          setView("home");
        } else {
          setView("onboarding");
        }
      } catch {
        setView("onboarding");
      }
    })();
  }, []);

  // ── onboarding submit ────────────────────────────────────────────
  async function completeOnboarding(v: OnboardingValues) {
    setOnboardBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          voiceId: v.voiceId,
          ageRange: v.ageRange,
          intent: v.intent,
          interests: v.interests,
        }),
      });
      const saved = res.ok ? ((await res.json()) as Profile) : null;
      setProfile(
        saved ?? {
          device_id: deviceId,
          voice_id: v.voiceId,
          age_range: v.ageRange,
          intent: v.intent,
          interests: v.interests,
          notes: null,
        },
      );
      setView("home");
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      setOnboardBusy(false);
    }
  }

  // ── switch voice from the sheet ──────────────────────────────────
  async function changeVoice(id: VoiceId) {
    setProfile((p) => (p ? { ...p, voice_id: id } : p));
    setVoiceBusy(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          voiceId: id,
          ageRange: profile?.age_range,
          intent: profile?.intent,
          interests: profile?.interests,
        }),
      });
    } catch {
      // optimistic update already applied; ignore persistence error
    } finally {
      setVoiceBusy(false);
    }
  }

  // ── core: request a reply (streamed) ─────────────────────────────
  const requestReply = useCallback(
    async (regen: boolean) => {
      if (!imageDataUrl) return;
      setError(null);
      setStreaming(true);
      setStreamingReply("");
      setResult(null);
      if (regen) setRegenerating(true);
      else setView("loading");

      const GENERIC = "I couldn't read that one. Try a clearer screenshot, or tap again.";
      try {
        const res = await fetch("/api/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, voiceId, deviceId, matchId: activeMatchId }),
        });
        if (!res.ok || !res.body) {
          let msg = GENERIC;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let acc = "";
        let firstToken = true;
        let finished = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: {
              type: string;
              text?: string;
              error?: string;
            } & Partial<ReplyResponse>;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "conversation") {
              // Conversation + screenshot are now stored; mark it active before
              // the first reply token arrives.
              if (ev.matchId) setActiveMatchId(ev.matchId);
            } else if (ev.type === "delta") {
              acc += ev.text ?? "";
              if (firstToken) {
                firstToken = false;
                setView("result");
              }
              // Show only the message: drop any preamble before <<<REPLY>>>,
              // stop at <<<META>>>, and strip a partial trailing marker.
              let shown = acc;
              const ri = shown.indexOf("<<<REPLY>>>");
              if (ri !== -1) shown = shown.slice(ri + 11);
              shown = shown
                .split("<<<META>>>")[0]
                .replace(/<+[A-Za-z]*>*\s*$/, "")
                .trimStart();
              setStreamingReply(shown);
            } else if (ev.type === "primary") {
              finished = true;
              setResult({
                stage: ev.stage as ReplyResponse["stage"],
                read: ev.read ?? "",
                matchName: ev.matchName ?? null,
                reply: ev.reply ?? "",
                why: ev.why ?? "",
                matchId: ev.matchId ?? "",
                turnId: ev.turnId,
                suggestionMessageId: ev.suggestionMessageId,
                uploadId: ev.uploadId,
                options: [{ reply: ev.reply ?? "", why: ev.why ?? "" }],
              });
              if (ev.matchId) setActiveMatchId(ev.matchId);
              setStreaming(false);
              setView("result");
            } else if (ev.type === "option") {
              setResult((r) =>
                r
                  ? { ...r, options: [...(r.options ?? []), { reply: ev.reply ?? "", why: ev.why ?? "" }] }
                  : r,
              );
            } else if (ev.type === "done") {
              if (ev.options?.length) {
                setResult((r) => (r ? { ...r, options: ev.options } : r));
              }
            } else if (ev.type === "error") {
              throw new Error(GENERIC);
            }
          }
        }
        if (!finished) throw new Error(GENERIC);
      } catch (e) {
        setError(e instanceof Error ? e.message : GENERIC);
        if (!regen) setView("home");
      } finally {
        setStreaming(false);
        setRegenerating(false);
      }
    },
    [imageDataUrl, voiceId, deviceId, activeMatchId],
  );

  // ── record which swipe option the user picked ────────────────────
  const selectOption = useCallback(
    async (turnId: string, index: number) => {
      try {
        await fetch("/api/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnId, index, deviceId }),
        });
      } catch {
        // best-effort signal; ignore failures
      }
    },
    [deviceId],
  );

  // ── record a swipe judgment on an option (-1 left / +1 right) ─────
  const recordFeedback = useCallback(
    async (
      turnId: string,
      matchId: string | null,
      index: number,
      reply: string,
      score: -1 | 1,
    ) => {
      try {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnId, matchId, index, reply, score, deviceId, source: "swipe" }),
        });
      } catch {
        // best-effort signal; ignore failures
      }
    },
    [deviceId],
  );

  // ── history loading ──────────────────────────────────────────────
  const loadMatches = useCallback(async () => {
    if (!deviceId) return;
    setMatchesLoading(true);
    try {
      const res = await fetch(
        `/api/matches?deviceId=${encodeURIComponent(deviceId)}`,
      );
      const data = res.ok ? ((await res.json()) as Match[]) : [];
      setMatches(Array.isArray(data) ? data : []);
    } catch {
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }, [deviceId]);

  const loadThreadData = useCallback(async (id: string) => {
    const res = await fetch(`/api/matches/${id}`);
    const data = res.ok
      ? ((await res.json()) as {
          match: Match | null;
          messages: Message[];
          uploads: Upload[];
          comments: Comment[];
        })
      : { match: null, messages: [], uploads: [], comments: [] };
    setThreadMatch(data.match);
    setThreadMessages(data.messages ?? []);
    setThreadUploads(data.uploads ?? []);
    setThreadComments(data.comments ?? []);
  }, []);

  async function openThread(id: string) {
    setView("thread");
    setThreadLoading(true);
    setThreadMatch(null);
    setThreadMessages([]);
    setThreadUploads([]);
    setThreadComments([]);
    try {
      await loadThreadData(id);
    } catch {
      setThreadMatch(null);
      setThreadMessages([]);
      setThreadUploads([]);
      setThreadComments([]);
    } finally {
      setThreadLoading(false);
    }
  }

  // ── add a free-text comment (message-level or whole-conversation) ─
  const addComment = useCallback(
    async (matchId: string, body: string, messageId?: string | null) => {
      const text = body.trim();
      if (!text) return;
      try {
        await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, matchId, body: text, messageId: messageId ?? null }),
        });
        await loadThreadData(matchId);
      } catch {
        // best-effort; ignore failures
      }
    },
    [deviceId, loadThreadData],
  );

  // ── navigation helpers ───────────────────────────────────────────
  function goNew(keepMatch = false) {
    if (!keepMatch) {
      setActiveMatchId(null);
      setContinuingName(null);
    }
    setImageDataUrl(null);
    setResult(null);
    setError(null);
    setView("home");
  }

  function continueChat(matchId: string, name: string | null) {
    setActiveMatchId(matchId);
    setContinuingName(name?.trim() || "this match");
    setImageDataUrl(null);
    setResult(null);
    setError(null);
    setView("home");
  }

  function selectTab(tab: Tab) {
    if (tab === "new") goNew();
    else if (tab === "matches") {
      setView("history");
      loadMatches();
    } else setVoiceSheet(true);
  }

  // ── derived ──────────────────────────────────────────────────────
  const activeTab: Tab =
    view === "history" || view === "thread"
      ? "matches"
      : view === "result" || view === "home"
        ? "new"
        : "new";
  const showTabs =
    view === "home" ||
    view === "result" ||
    view === "history" ||
    view === "thread";

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-[430px]">
      {view === "boot" && (
        <div className="flex min-h-[100dvh] items-center justify-center">
          <div
            className="grid h-10 w-10 animate-spin place-items-center rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg,transparent,rgba(255,106,91,.8))",
              WebkitMask:
                "radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0)",
              mask: "radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0)",
            }}
          />
        </div>
      )}

      {view === "onboarding" && (
        <Onboarding
          onDone={completeOnboarding}
          busy={onboardBusy}
          error={error}
        />
      )}

      {view === "home" && (
        <Home
          voiceId={voiceId}
          imageDataUrl={imageDataUrl}
          onPickImage={setImageDataUrl}
          onClearImage={() => setImageDataUrl(null)}
          onSubmit={() => requestReply(false)}
          onOpenVoice={() => setVoiceSheet(true)}
          continuingName={continuingName}
          onCancelContinue={() => {
            setActiveMatchId(null);
            setContinuingName(null);
          }}
          error={error}
        />
      )}

      {view === "loading" && <Loading imageDataUrl={imageDataUrl} />}

      {view === "result" && (result || streaming) && (
        <Result
          result={result}
          streaming={streaming}
          streamingReply={streamingReply}
          imageDataUrl={imageDataUrl}
          voiceId={voiceId}
          onRegenerate={() => requestReply(true)}
          onNew={() => goNew()}
          onBack={() => goNew()}
          onSelect={selectOption}
          onFeedback={recordFeedback}
          regenerating={regenerating}
        />
      )}

      {view === "history" && (
        <History
          matches={matches}
          loading={matchesLoading}
          onOpen={openThread}
          onNew={() => goNew()}
        />
      )}

      {view === "thread" && (
        <Thread
          match={threadMatch}
          messages={threadMessages}
          uploads={threadUploads}
          comments={threadComments}
          loading={threadLoading}
          onBack={() => {
            setView("history");
            loadMatches();
          }}
          onContinue={continueChat}
          onComment={addComment}
        />
      )}

      {showTabs && <BottomTabs active={activeTab} onSelect={selectTab} />}

      {voiceSheet && (
        <VoiceSheet
          value={voiceId}
          busy={voiceBusy}
          onPick={changeVoice}
          onClose={() => setVoiceSheet(false)}
        />
      )}
    </main>
  );
}
