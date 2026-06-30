import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ── Local-dev AI proxy (Phase 9, step 3) ─────────────────────────────────────
// Keeps ANTHROPIC_API_KEY SERVER-SIDE: the key is read here, in the Node config
// process, and never reaches the browser bundle (it is not VITE_-prefixed, so
// import.meta.env can't see it). The browser calls the same-origin /api/ai path
// (AnthropicProvider); this middleware attaches the key and forwards to Anthropic.
// apply:'serve' scopes the plugin to `vite` (dev) only — a production build ships
// nothing of this; go-live re-implements /api/ai as a Vercel edge function.

// Shape the app sends (mirrors engine/ai AIRequest) and the Anthropic reply.
interface ProxyRequestBody {
  system?: string
  messages?: unknown
  maxTokens?: number
  // 'quality' | 'fast' — see AIModelTier. Absent is treated as 'quality'.
  tier?: string
}
interface AnthropicTextBlock {
  type: string
  text?: string
}
interface AnthropicMessagesResponse {
  content?: AnthropicTextBlock[]
  error?: { message?: string }
}

// Per-tier model defaults: quality work (roadmap decomposition) on Sonnet,
// routine high-volume work (daily plans, extraction) on Haiku. Each is
// overridable via env; ANTHROPIC_MODEL (if set) forces ONE model for every tier.
const DEFAULT_MODEL_QUALITY = 'claude-sonnet-4-6'
const DEFAULT_MODEL_FAST = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 4096

// Resolve the concrete model for a request's tier, honouring env overrides.
function resolveModel(tier: string | undefined, env: Record<string, string>): string {
  if (env.ANTHROPIC_MODEL) return env.ANTHROPIC_MODEL // global single-model override
  if (tier === 'fast') return env.ANTHROPIC_MODEL_FAST || DEFAULT_MODEL_FAST
  return env.ANTHROPIC_MODEL_QUALITY || DEFAULT_MODEL_QUALITY
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += String(chunk)
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleAiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
): Promise<void> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    sendJson(res, 500, {
      error:
        'ANTHROPIC_API_KEY is not set. Add it to .env (it stays server-side, never bundled).',
    })
    return
  }
  try {
    const body = JSON.parse(await readBody(req)) as ProxyRequestBody
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolveModel(body.tier, env),
        max_tokens:
          typeof body.maxTokens === 'number' ? body.maxTokens : DEFAULT_MAX_TOKENS,
        system: body.system ?? '',
        messages: body.messages ?? [],
      }),
    })
    const data = (await upstream.json()) as AnthropicMessagesResponse
    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: data.error?.message ?? 'AI request failed.',
      })
      return
    }
    // Concatenate the text blocks — the parsers tolerate any surrounding prose.
    const text = (data.content ?? [])
      .filter((b): b is AnthropicTextBlock => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
    sendJson(res, 200, { text })
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'AI proxy error.',
    })
  }
}

function aiProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'lifemap-ai-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        '/api/ai',
        (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          if (req.method !== 'POST') {
            next()
            return
          }
          void handleAiRequest(req, res, env)
        },
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix loads ALL env vars (including non-VITE_ secrets) into THIS Node
  // process only; non-VITE_ keys are never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), aiProxyPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
