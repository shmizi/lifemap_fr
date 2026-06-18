// computeSubgoalProgress — task-completion momentum for a single subgoal.
//
// Thin domain alias over the shared computeCompletion primitive (all completion
// views are the same {completed, total, percent} math). Kept as its own named
// export so the Detail View reads in domain terms and the SubgoalProgress type
// stays meaningful at call sites. Callers pass every task under the subgoal —
// its loose tasks plus all of its milestones' tasks.

import { computeCompletion, type Completion } from './computeCompletion'

export type SubgoalProgress = Completion
export const computeSubgoalProgress = computeCompletion
