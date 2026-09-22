# Tremly demo

- `index.html` is the whole demo (engine inlined). It works on its own.
- `api/parse-constraints.ts` reads the free-text "anything that shapes your week" box with Claude.
  It needs `ANTHROPIC_API_KEY` set in Vercel. Without it, the demo falls back to a simple built-in reader.
- `src/tremly/` is the scheduling engine source (also inlined in index.html).

Nothing a visitor types is stored or logged.
