// computeTodayProgress — momentum over a single day's scheduled tasks.
//
// Thin domain alias over the shared computeCompletion primitive: every
// completion view (today / goal / subgoal) is the same {completed, total,
// percent} math. Kept as its own named export so the dashboard reads in domain
// terms and the TodayProgress type stays meaningful at call sites.

import { computeCompletion, type Completion } from './computeCompletion'

export type TodayProgress = Completion
export const computeTodayProgress = computeCompletion
