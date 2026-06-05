import { completeChat, structureModel } from "./openrouter";
import { STRUCTURE_SYSTEM, STRUCTURE_USER, parseStructuredChat } from "./prompt";
import { StructuredChat } from "./types";

/**
 * Accurate "who wrote what" pass: run the screenshot through a strong vision
 * model (gemini-2.5-flash) with the alignment-first structuring prompt, and
 * return a normalized transcript. Best-effort — returns null on any failure so
 * the caller can fall back to the reply writer's own (less reliable) read.
 */
export async function structureChat(imageDataUrl: string): Promise<StructuredChat | null> {
  try {
    const raw = await completeChat({
      system: STRUCTURE_SYSTEM,
      userText: STRUCTURE_USER,
      imageDataUrl,
      model: structureModel(),
      temperature: 0.1,
      maxTokens: 2000,
    });
    const parsed = parseStructuredChat(raw);
    return parsed && parsed.messages.length >= 0 ? parsed : null;
  } catch {
    return null;
  }
}
