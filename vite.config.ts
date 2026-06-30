import {
  defineConfig,
  loadEnv,
  type Plugin,
  type Connect,
  type ViteDevServer,
  type PreviewServer,
} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ── AI proxy (Phase 9) ───────────────────────────────────────────────────────
// Keeps the Anthropic API key SERVER-SIDE: the key is read in the Node process
// (never the browser bundle — it's not VITE_-prefixed). The browser calls the
// same-origin /api/ai path (AnthropicProvider); this middleware attaches the key
// and forwards to Anthropic.
//
// It runs in BOTH `vite` (dev) and `vite preview` (the production-build server we
// run on Cloud Run), via configureServer + configurePreviewServer. At runtime the
// key/model come from process.env (Cloud Run env vars); for local dev they fall
// back to loadEnv's .env values. Either way the key never reaches the client.

interface ProxyRequestBody {
  system?: string
  messages?: unknown
  maxTokens?: number
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

const DEFAULT_MODEL_QUALITY = 'claude-sonnet-4-6'
const DEFAULT_MODEL_FAST = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 4096

// process.env (Cloud Run / shell) takes precedence; loadEnv (.env) is the fallback.
function readEnv(key: string, env: Record<string, string>): string | undefined {
  return process.env[key] ?? env[key]
}

function resolveModel(tier: string | undefined, env: Record<string, string>): string {
  const forced = readEnv('ANTHROPIC_MODEL', env)
  if (forced) return forced
  if (tier === 'fast') return readEnv('ANTHROPIC_MODEL_FAST', env) || DEFAULT_MODEL_FAST
  return readEnv('ANTHROPIC_MODEL_QUALITY', env) || DEFAULT_MODEL_QUALITY
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
  const apiKey = readEnv('ANTHROPIC_API_KEY', env)
  if (!apiKey) {
    sendJson(res, 500, {
      error:
        'ANTHROPIC_API_KEY is not set. Add it to .env (local) or the Cloud Run service env (deployed).',
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

function registerAiProxy(
  middlewares: Connect.Server,
  env: Record<string, string>,
): void {
  middlewares.use(
    '/api/ai',
    (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      if (req.method !== 'POST') {
        next()
        return
      }
      void handleAiRequest(req, res, env)
    },
  )
}

function aiProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'lifemap-ai-proxy',
    // Dev server (`vite`).
    configureServer(server: ViteDevServer) {
      registerAiProxy(server.middlewares, env)
    },
    // Production-build preview server (`vite preview`) — what Cloud Run runs.
    configurePreviewServer(server: PreviewServer) {
      registerAiProxy(server.middlewares, env)
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix loads ALL env vars (incl. non-VITE_ secrets) into THIS Node process
  // only; non-VITE_ keys are never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), aiProxyPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Cloud Run serves over its own *.run.app host; allow it (and any host) so the
    // preview server doesn't reject the request with a host check.
    preview: {
      allowedHosts: true,
    },
  }
})
