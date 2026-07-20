// services/ai/AnthropicProvider.ts — the real AI backend.
//
// This runs in the BROWSER and must never see the API key. It POSTs the app's
// AIRequest to the same-origin proxy at /api/ai — served by the dev-only Vite
// middleware (vite.config.ts) locally, and by the Vercel Edge Function (api/ai.ts)
// in production. Both hold ANTHROPIC_API_KEY server-side; only the edge one also
// REQUIRES a valid Supabase JWT (ADR-0003 step 2). Selecting this vs MockAI is one
// line in services/ai/index.ts, gated on the non-secret VITE_USE_REAL_AI flag.
//
// Contract (same as MockAI): return the model's raw text; let a pure parser turn
// it into domain data. On a transport failure THROW — the AI modals already catch
// that and show an inline error + retry, distinct from the calm refresh banner.

import type { AIProvider } from '@/services/ai/AIProvider'
import type { AIRequest, AIResponse } from '@/engine/ai/types'
import { supabase } from '@/services/supabase/client'

// The same-origin endpoint the dev proxy AND the production edge function serve.
// Relative so it works on whatever host/port serves the app.
const AI_PROXY_PATH = '/api/ai'

export class AnthropicProvider implements AIProvider {
  async complete(request: AIRequest): Promise<AIResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }

    // Attach the Supabase JWT when signed in, so the production edge proxy can
    // verify identity (and, at step 4, meter usage) before spending our key. The
    // local dev proxy ignores this header, so signed-out local iteration still
    // works; when accounts aren't configured `supabase` is null and none is sent.
    if (supabase) {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) headers.authorization = `Bearer ${token}`
    }

    const res = await fetch(AI_PROXY_PATH, {
      method: 'POST',
      headers,
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
