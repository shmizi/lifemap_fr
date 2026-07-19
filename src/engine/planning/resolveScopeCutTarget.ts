// resolveScopeCutTarget — match a scope-cut suggestion's free-text `target` (the
// model names a track or phase in prose, e.g. "the Advanced Topics track") to the
// concrete subgoal or milestone it refers to, so the store can act on it (Phase 10).
//
// PURE TypeScript: no React, no DB, no store. The scope-cut proposal comes back with
// human-readable targets, NOT ids (a model can't know our ids); this resolves them
// against the goal's tree by NORMALISED-title matching. It NEVER throws and returns
// null when nothing matches confidently — an unmatched target is surfaced to the user
// to handle by hand, never guessed at destructively.
//
// Matching, most-specific first: exact normalised-title equality, then the target
// CONTAINING a candidate title (the model wrapped the title in prose), then a
// candidate title containing the target. Longer overlaps win, so "Advanced Topics"
// beats "Topics" when both could match. Both levels (subgoal = track, milestone =
// phase) are candidates; the best title match wins regardless of level.

import type { GoalTree, ID, Task } from '@/core/types'

export interface ScopeCutTargetMatch {
  kind: 'subgoal' | 'milestone'
  id: ID
  // Every task under the matched track/phase — used to hard-delete a "cut" phase's
  // tasks (a cut leaves no orphan loose work behind).
  taskIds: ID[]
  // The not-yet-completed subset — used to "defer" (unschedule) work off the dated
  // plan without touching what's already done.
  incompleteTaskIds: ID[]
}

interface Candidate {
  kind: 'subgoal' | 'milestone'
  id: ID
  title: string
  tasks: Task[]
}

// Lowercase, strip punctuation to single spaces, collapse and trim — so "Advanced
// Topics!" and "advanced  topics" compare equal and prose punctuation never blocks a
// match.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveScopeCutTarget(
  tree: GoalTree,
  target: string,
): ScopeCutTargetMatch | null {
  const norm = normalize(target)
  if (norm.length === 0) return null

  // Both levels are candidates. A subgoal's task set spans its loose tasks AND every
  // task under its milestones (a track "cut"/"defer" reaches all of it); a milestone's
  // is just its own tasks.
  const candidates: Candidate[] = []
  for (const st of tree.subgoals) {
    const subgoalTasks = [
      ...st.looseTasks,
      ...st.milestones.flatMap((m) => m.tasks),
    ]
    candidates.push({
      kind: 'subgoal',
      id: st.subgoal.id,
      title: st.subgoal.title,
      tasks: subgoalTasks,
    })
    for (const mt of st.milestones) {
      candidates.push({
        kind: 'milestone',
        id: mt.milestone.id,
        title: mt.milestone.title,
        tasks: mt.tasks,
      })
    }
  }

  let best: { cand: Candidate; score: number } | null = null
  for (const cand of candidates) {
    const t = normalize(cand.title)
    if (t.length === 0) continue
    let score: number
    if (t === norm) {
      score = 1000
    } else if (norm.includes(t) && t.length >= 4) {
      // The model wrapped the real title in prose ("finish the X track"). Favour the
      // longest title matched, so the most specific candidate wins.
      score = 100 + t.length
    } else if (t.includes(norm) && norm.length >= 4) {
      // The target is a shorter fragment of the title.
      score = 50 + norm.length
    } else {
      continue
    }
    if (best === null || score > best.score) best = { cand, score }
  }

  if (best === null) return null
  const { cand } = best
  return {
    kind: cand.kind,
    id: cand.id,
    taskIds: cand.tasks.map((t) => t.id),
    incompleteTaskIds: cand.tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => t.id),
  }
}
