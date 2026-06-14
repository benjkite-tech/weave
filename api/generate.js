import { generateText } from 'ai';

/**
 * POST /api/generate
 * Body: { system: string, prompt: string }
 * Returns: { text: string }
 *
 * Auth: server-side only. Set ONE of these in Vercel env:
 *   - AI_GATEWAY_API_KEY  → routes through Vercel AI Gateway (recommended; usage tracking, model switching)
 *   - ANTHROPIC_API_KEY   → talks to Anthropic directly via the AI SDK provider
 * The key is NEVER exposed to the browser.
 */

// Model is configurable via env so you can switch without a code change.
const MODEL = process.env.WEAVE_MODEL || 'anthropic/claude-sonnet-4.5';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    let model;

    if (process.env.AI_GATEWAY_API_KEY) {
      // Default path: AI Gateway resolves the "anthropic/..." string automatically.
      model = MODEL;
    } else if (process.env.ANTHROPIC_API_KEY) {
      // Direct path: use the Anthropic provider with your raw Claude key.
      const { anthropic } = await import('@ai-sdk/anthropic');
      // Strip the "anthropic/" prefix the gateway uses; provider wants the bare id.
      model = anthropic(MODEL.replace(/^anthropic\//, ''));
    } else {
      return res.status(500).json({
        error: 'No API key configured. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in your Vercel project.',
      });
    }

    const { text } = await generateText({
      model,
      system: system || undefined,
      prompt,
      maxTokens: 1500,
    });

    return res.status(200).json({ text });
  } catch (err) {
    console.error('generate error:', err);
    return res.status(500).json({ error: 'Generation failed', detail: String(err?.message || err) });
  }
}
