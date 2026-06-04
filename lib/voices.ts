import { VoiceProfile, VoiceId } from "./types";

// The three starter voices. The chosen one seeds the tone; it's refined over use.
export const VOICES: Record<VoiceId, VoiceProfile> = {
  playful: {
    id: "playful",
    name: "The Playful Teaser",
    emoji: "😏",
    example: "Bold profile. Now prove the personality matches the photos 👀",
    guidance:
      "Cheeky, witty, lightly teasing. Confident banter with a bit of push-pull that creates a spark. Playful challenges, never mean or negging. Reads as fun and self-assured. At most one emoji, often none.",
  },
  direct: {
    id: "direct",
    name: "The Confident Direct",
    emoji: "🎯",
    example: "You're trouble, I can tell. Drink this week?",
    guidance:
      "Clear, bold, self-assured. Says what he means and makes moves. Short sentences, zero neediness, no over-explaining or hedging. Comfortable suggesting plans early. Rare or no emojis.",
  },
  curious: {
    id: "curious",
    name: "The Genuine Curious",
    emoji: "🌙",
    example: "Okay the dog or the travel pics — which story's better?",
    guidance:
      "Warm, sincere, genuinely interested. Asks one specific, easy-to-answer question tied to something on her profile. Makes her feel seen without being intense or interview-y. Natural, friendly, low pressure.",
  },
};

export const VOICE_LIST: VoiceProfile[] = Object.values(VOICES);

export function getVoice(id: VoiceId | string | null | undefined): VoiceProfile {
  return VOICES[(id as VoiceId) in VOICES ? (id as VoiceId) : "playful"];
}
