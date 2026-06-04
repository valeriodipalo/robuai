const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Single fast multimodal model that reads the screenshot AND writes the reply.
// Gemini 2.5 Flash Lite: 1M context, ~0.3s TTFT, ~380 tok/s, cheap.
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your environment to generate replies."
    );
  }
  return key;
}

export function chatModel(): string {
  return process.env.MODEL || process.env.REPLY_MODEL || DEFAULT_MODEL;
}

/** Non-streaming completion — used to generate the extra swipe options. */
export async function completeChat(params: {
  system: string;
  userText: string;
  imageDataUrl: string;
}): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://robuai.app",
      "X-Title": "RobuAI",
    },
    body: JSON.stringify({
      model: chatModel(),
      temperature: 0.95,
      max_tokens: 700,
      messages: [
        { role: "system", content: params.system },
        {
          role: "user",
          content: [
            { type: "text", text: params.userText },
            { type: "image_url", image_url: { url: params.imageDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Stream one multimodal completion: the model reads the screenshot and writes
 * the reply. Yields text deltas as they arrive (token-by-token), so the UI can
 * render the reply live. Parses OpenRouter's SSE stream.
 */
export async function* streamChat(params: {
  system: string;
  userText: string;
  imageDataUrl: string;
}): AsyncGenerator<string, void, unknown> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://robuai.app",
      "X-Title": "RobuAI",
    },
    body: JSON.stringify({
      model: chatModel(),
      temperature: 0.85,
      max_tokens: 700,
      stream: true,
      messages: [
        { role: "system", content: params.system },
        {
          role: "user",
          content: [
            { type: "text", text: params.userText },
            { type: "image_url", image_url: { url: params.imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(":")) continue; // blank or SSE comment/keepalive
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta: unknown = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // partial/non-JSON line — ignore
      }
    }
  }
}
