// computeGoalProgress — task-completion momentum for a whole goal.
//
// Thin domain alias over the shared computeCompletion primitive (all completion
// views are the same {completed, total, percent} math). Kept as its own named
// export so the goal list reads in domain terms and the GoalProgress type stays
// meaningful at call sites. Callers pass every task under the goal (across all
// its subgoals/milestones — see hierarchyRepository.getTasksByGoalId).

import { computeCompletion, type Completion } from './computeCompletion'

export type GoalProgress = Completion
export const computeGoalProgress = computeCompletion
