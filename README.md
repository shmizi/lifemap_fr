# LifeMap

An AI-assisted long-term life navigation system. Set long-term goals, break them
into a hierarchy, and let the home screen always answer "What should I do today?"
with full context of why it matters.

This is **Phase 0, Session 1** — the app shell and theme system only. No database,
no features yet.

## Run it

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check + production build
npx tsc --noEmit   # type-check only
```

## What works now

- Sidebar navigation across Dashboard / Goals / Roadmap / Reviews / Settings
- Collapsible sidebar (toggle in the topbar)
- Dark / light theme toggle (persisted to localStorage)
- Strict TypeScript, path alias `@/*` -> `src/*`
- The full locked folder structure (empty folders held by `.gitkeep`)

## Architecture

Data flows one direction: Database -> Repositories -> Engine -> Store -> UI.
Business logic lives only in `engine/` (pure TypeScript, no React). See the
engineering constitution for the full ruleset.
