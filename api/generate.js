import { generateText } from 'ai';

/**
 * POST /api/generate
 * Body: { system: string, prompt: string }
 * Returns: { text: string }
 *
 * Auth (server-side only; key NEVER reaches the browser):
 *   - ANTHROPIC_API_KEY  → talks to Anthropic directly, bills your Anthropic
 *                          account, and bypasses the AI Gateway free-tier model
 *                          restriction. This is the recommended setup.
 *   - AI_GATEWAY_API_KEY  → routes a plain model string through the Vercel
 *                          AI Gateway (needs paid Gateway credits for most models).
 */

// For the direct Anthropic provider use the bare model id; for the Gateway use the prefixed string.
const ANTHROPIC_MODEL = process.env.WEAVE_MODEL || 'claude-sonnet-4-5';
const GATEWAY_MODEL = 'anthropic/' + ANTHROPIC_MODEL;

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

    let model;
    if (process.env.ANTHROPIC_API_KEY) {
      // Direct to Anthropic — bills your Anthropic account, no Gateway tier limits.
      const { anthropic } = await import('@ai-sdk/anthropic');
      model = anthropic(ANTHROPIC_MODEL);
    } else {
      // Fall back to the Gateway string (needs paid Gateway credits for this model).
      model = GATEWAY_MODEL;
    }

    const { text } = await generateText({
      model,
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
