import { generateText } from 'ai';

/**
 * POST /api/generate
 * Body: { system: string, prompt: string }
 * Returns: { text: string }
 *
 * Uses the Vercel AI Gateway. A plain model string ("anthropic/...") routes
 * through the Gateway automatically. Auth resolves from AI_GATEWAY_API_KEY
 * (set in project env) or, on deployed Vercel functions, the OIDC token.
 * BYOK provider credentials (team level) are used downstream — no code change.
 * The key is NEVER exposed to the browser.
 */

const MODEL = process.env.WEAVE_MODEL || 'anthropic/claude-sonnet-4.5';

// Best-effort in-memory rate limit (per warm instance).
const RATE = { windowMs: 60_000, max: 20 };
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE.max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) {
    return res.status(429).json({ error: 'Too many requests — slow down a moment and try again.' });
  }

  try {
    const { system, prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    if (typeof prompt === 'string' && prompt.length > 8000) {
      return res.status(400).json({ error: 'Prompt too long' });
    }

    // Plain string model → routes through the AI Gateway. No provider package needed.
    const { text } = await generateText({
      model: MODEL,
      system: system || undefined,
      prompt,
      maxOutputTokens: 1500,
    });

    return res.status(200).json({ text });
  } catch (err) {
    console.error('generate error:', err);
    return res.status(500).json({ error: 'Generation failed', detail: String(err?.message || err) });
  }
}
