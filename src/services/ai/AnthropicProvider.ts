// services/ai/AnthropicProvider.ts — the real AI backend (local-dev path).
//
// This runs in the BROWSER and must never see the API key. It POSTs the app's
// AIRequest to the same-origin proxy at /api/ai; the proxy (a dev-only Vite
// middleware in vite.config.ts) holds ANTHROPIC_API_KEY server-side and forwards
// to Anthropic. Selecting this vs MockAI is one line in services/ai/index.ts,
// gated on the non-secret VITE_USE_REAL_AI flag.
//
// Contract (same as MockAI): return the model's raw text; let a pure parser turn
// it into domain data. On a transport failure THROW — the AI modals already catch
// that and show an inline error + retry, distinct from the calm refresh banner.

import type { AIProvider } from '@/services/ai/AIProvider'
import type { AIRequest, AIResponse } from '@/engine/ai/types'

// The same-origin endpoint the dev proxy serves. Relative so it works on whatever
// host/port Vite is running; in production (go-live) this becomes the edge proxy.
const AI_PROXY_PATH = '/api/ai'

export class AnthropicProvider implements AIProvider {
  async complete(request: AIRequest): Promise<AIResponse> {
    const res = await fetch(AI_PROXY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      // Surface the proxy's error message when present, else a generic one.
      let message = `AI request failed (${res.status})`
      try {
        const data = (await res.json()) as { error?: string }
        if (data.error) message = data.error
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      throw new Error(message)
    }

    const data = (await res.json()) as { text?: string }
    return { text: data.text ?? '' }
  }
}
