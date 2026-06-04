// Shared contract for the whole app. Every module codes against these types.

export type Stage = "opener" | "reply" | "escalate";

export type VoiceId = "playful" | "direct" | "curious";

export interface VoiceProfile {
  id: VoiceId;
  name: string;
  emoji: string;
  example: string;
  /** Injected into the system prompt to steer tone. */
  guidance: string;
}

export interface Profile {
  device_id: string;
  voice_id: VoiceId;
  age_range: string | null;
  intent: string | null; // "casual" | "dating"
  interests: string[] | null;
  notes: string | null; // free-form learned-voice notes
}

export interface Match {
  id: string;
  device_id: string;
  name: string | null;
  last_stage: Stage | null;
  last_snippet: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageRole = "them" | "suggestion" | "sent";

export interface Message {
  id: string;
  match_id: string;
  role: MessageRole;
  content: string;
  stage: Stage | null;
  created_at: string;
}

/** What the model returns for a single screenshot. */
export interface ReplyResult {
  stage: Stage;
  /** One short line of what the model saw (her last message / bio summary). */
  read: string;
  /** Her name if visible in the screenshot, else null. */
  matchName: string | null;
  /** The single message to send, in his voice. */
  reply: string;
  /** One short line on why this works. */
  why: string;
}

/** POST /api/reply request body. */
export interface ReplyRequest {
  imageDataUrl: string; // data:image/...;base64,....
  voiceId: VoiceId;
  deviceId: string;
  matchId?: string | null; // continue an existing thread
}

/** One swipeable reply option. */
export interface ReplyOption {
  reply: string;
  why: string;
}

/** A line of the conversation the model read from a chat screenshot. */
export interface TranscriptLine {
  from: "her" | "him";
  text: string;
}

/** One uploaded screenshot in a conversation. `signedUrl` is minted on read (never stored). */
export interface Upload {
  id: string;
  match_id: string;
  device_id: string;
  turn_id: string | null;
  storage_path: string;
  content_type: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  /** Short-lived display URL, attached by the read API; absent in the DB. */
  signedUrl?: string | null;
}

/** A free-text user comment. `message_id` null = a whole-conversation note. */
export interface Comment {
  id: string;
  match_id: string;
  device_id: string;
  message_id: string | null;
  turn_id: string | null;
  option_index: number | null;
  body: string;
  created_at: string;
  updated_at: string;
}

/** POST /api/comments request body. */
export interface CommentRequest {
  deviceId: string;
  matchId: string;
  body: string;
  messageId?: string | null;
  turnId?: string | null;
  optionIndex?: number | null;
}

/** Swipe judgment on an option: -1 = swiped left (rejected), +1 = swiped right / copied (liked). */
export type FeedbackScore = -1 | 1;

/** POST /api/feedback request body. */
export interface FeedbackRequest {
  turnId: string;
  matchId?: string | null;
  index: number; // option index judged
  reply?: string; // the option text, stored for offline tuning
  score: FeedbackScore;
  deviceId: string;
  source?: "swipe" | "copy";
}

/** POST /api/reply response (the streamed `done` payload). */
export interface ReplyResponse extends ReplyResult {
  matchId: string;
  /** Turn id — used to record which option the user picks. */
  turnId?: string;
  /** The thread message id for the primary suggestion — lets the UI comment on it. */
  suggestionMessageId?: string | null;
  /** Upload id for the screenshot stored at the start of this request. */
  uploadId?: string | null;
  /** All swipeable options in display order (index 0 = the streamed primary). */
  options?: ReplyOption[];
}
