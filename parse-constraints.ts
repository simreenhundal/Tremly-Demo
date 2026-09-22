import { MAX_INPUT_CHARS, PARSE_SYSTEM_PROMPT, safeJson, validateParsed } from "../src/tremly/parse";

export const config = { runtime: "edge" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Viewer text is never logged or stored: it goes to the model and back, nothing else.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_INPUT_CHARS) : "";
  } catch {
    return json({ constraints: [] });
  }
  if (!text) return json({ constraints: [] });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ constraints: [], error: "not_configured" });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: PARSE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) return json({ constraints: [], error: "upstream" });

    const data = await res.json();
    const raw = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    return json({ constraints: validateParsed(safeJson(raw)) });
  } catch {
    return json({ constraints: [], error: "failed" });
  }
}
