# LifeMap

**Turn a big ambition into what to do today, and keep the plan honest when life changes.**

LifeMap is an AI-assisted planner for long-term goals. Describe where you want to end up, and it builds a roadmap of tracks, phases and dated daily tasks that fits the hours you actually have. When you fall behind or your situation changes, the plan adapts instead of quietly going stale.

![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![Claude](https://img.shields.io/badge/Claude_API-D97757?logo=anthropic&logoColor=white)

---

## Why it exists

Ambitious goals rarely fail because people can't do the work. They fail because the path gets overwhelming, and because the plan stops matching reality a few weeks in.

Most planners give you a longer list. LifeMap answers one question per screen, starting with "what should I do today?", and treats your plan as something that has to stay true.

## What it does

### Plan

- **One-click roadmaps.** Goes from a goal to tracks, phases and dated tasks in one step, or review and edit each stage before anything is saved.
- **Strategy brief.** A short intake sharpens what the goal is really aiming at, and every later generation reads the result.
- **Reference documents.** Attach a syllabus, job spec or training plan (`.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.rtf`). It's condensed once and only the summary is stored, so long documents don't inflate the cost of every later generation.
- **Personal context.** Your available hours, days off, working rhythm, starting level and hard or soft deadlines all shape the plan.

### Stay realistic

- **One daily budget across all goals.** New plans are placed around what your other goals already have scheduled, so adding a goal doesn't quietly double your day.
- **Rebalance.** If a day ends up over budget, the dashboard flags it and one click pushes the overflow later. You can still overload a day by hand on purpose.
- **Catch up without guilt.** Missed tasks can be moved back onto upcoming days, and you can say why they slipped so patterns become visible.

### Adapt

- **Something changed.** Describe what's different. The coach proposes which parts of the plan to remove, defer or re-plan, and you approve each one. Finished work is never touched.
- **Scope cuts.** If a hard deadline is at risk, it proposes what to trim, because the date can't move.
- **Phase check-ins.** A short recap when a phase ends, then plan the next one.
- **Learnings.** A running note on each goal that feeds into every future generation.

### Stay oriented

- **Dashboard.** Today's focus, what's overdue, nearest deadlines and whether your days fit.
- **Goal health.** Separate reads for pace, reliability and projected finish date, rolled up into one risk level.
- **Roadmap.** See which subgoals support which. Linked foundations rank higher in your priorities.
- **Weekly review.** What got done, what slipped and why it mattered.
- **Extras.** Next-task highlighting, Google Calendar links, in-app reminders, and light and dark themes.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Framer Motion |
| State | Zustand |
| Guest storage | IndexedDB via Dexie, works without an account |
| Accounts and sync | Supabase (Auth, Postgres, row-level security) |
| AI | Claude, called through a server-side proxy so the API key never reaches the browser |
| Hosting | Vercel, with an Edge Function for `/api/ai` |
| Tests | Vitest, fake-indexeddb |

## Getting started

You need Node.js 20 or newer.

```bash
git clone https://github.com/shmizi/lifemap_fr.git
cd lifemap_fr
npm install
npm run dev
```

Then open the URL Vite prints. No configuration is required: without a `.env`, the app runs as a guest on local storage with a built-in mock AI, so you can try everything for free.

### Optional: real AI and accounts

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `VITE_USE_REAL_AI` | Set to `true` to use Claude instead of the mock |
| `ANTHROPIC_API_KEY` | Server-side only. Never prefix it with `VITE_` |
| `ANTHROPIC_MODEL_QUALITY`, `ANTHROPIC_MODEL_FAST` | Optional model overrides |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Turn on sign-in and cloud sync |

To use accounts, run the SQL files in [`supabase/migrations`](supabase/migrations) in order. The first time someone signs in, their local data is copied to their account.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server, including the local AI proxy |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the test suite |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build |

## How it's built

Data only flows in one direction, so the planning logic stays testable without a browser, a database or a network:

```text
Repositories  ->  Engine  ->  Stores  ->  Hooks  ->  UI
(Dexie or         (pure       (Zustand)
 Supabase)         logic)
```

- **Repositories** pick the backend on each call: Dexie for guests, Supabase when signed in. Nothing above them knows which one is live.
- **The engine** holds scheduling, health, priority and prompt logic as pure functions, with the current time passed in.
- **AI sits behind one interface.** Prompts and parsers are pure, and malformed model output degrades calmly instead of crashing. Generated changes that could remove work are proposed first, for you to approve.

```text
src/
├── app/         Shell, routing, providers
├── components/  Shared UI
├── core/        Types, constants, hooks, utilities
├── database/    Dexie schema, repositories, cloud migration
├── engine/      Pure logic: AI prompts and parsers, planning, health, priority, review
├── features/    Feature UI: goals, dashboard, discovery, onboarding, settings
├── pages/       Route-level screens
├── services/    AI, search and Supabase clients
└── store/       Zustand stores
api/             Vercel Edge Function: AI proxy, sign-in check, monthly quota
supabase/        SQL migrations
docs/            Architecture decision records
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for the full Vercel and Supabase setup. In production, real AI requires sign-in and each user has a monthly generation limit, because every call is billed to the deployer's Anthropic key.

## Known limitations

- **Discovery search is a mock.** Opportunity search returns sample results until a real search provider is connected. Adding opportunities by hand works normally.
- **PDF and Word uploads aren't supported yet.** Paste their text into a goal's notes instead.
- **Reminders only fire while the app is open.** There's no background push yet.
- **A very full calendar can push plans past a deadline.** New tasks wait for days with room, so check the finish projection after adding a lot of work.

## License

MIT
