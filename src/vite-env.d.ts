/// <reference types="vite/client" />

// Client-visible env vars (VITE_-prefixed only — secrets are NOT here). The AI
// key never appears in import.meta.env; it lives server-side in the dev proxy.
interface ImportMetaEnv {
  // "true" routes AI through the local dev proxy to real Claude; anything else
  // (including unset) uses the deterministic MockAI. Safe to expose — it's a
  // boolean switch, not a secret.
  readonly VITE_USE_REAL_AI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
