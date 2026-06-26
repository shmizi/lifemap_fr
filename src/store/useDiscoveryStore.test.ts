import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import {
  createGoal,
  getTasksBySubgoalId,
  type CreateGoalInput,
} from '@/database/repositories'
import type { GoalCategory } from '@/core/types'
import {
  useDiscoveryStore,
  type DiscoveredOpportunityInput,
} from './useDiscoveryStore'

// Read current store state in a test.
const state = () => useDiscoveryStore.getState()

function makeGoal(
  title: string,
  description: string,
  category: GoalCategory,
): CreateGoalInput {
  return {
    title,
    description,
    category,
    targetDate: '2026-12-31',
    status: 'active',
    priority: 'medium',
  }
}

function makeOpportunity(
  overrides: Partial<DiscoveredOpportunityInput> = {},
): DiscoveredOpportunityInput {
  return {
    type: 'internship',
    title: 'ML Research Internship',
    organization: 'Acme Labs',
    description: 'Summer research on machine learning.',
    url: 'https://example.com/internship',
    tags: ['ML'],
    source: 'ai_search',
    ...overrides,
  }
}

beforeEach(async () => {
  // Isolate every test: clear the shared tables AND reset the singleton store back
  // to its initial state (zustand stores persist across tests in the same module).
  await db.opportunities.clear()
  await db.goals.clear()
  // addToPlan writes into the hierarchy too, so isolate those tables as well.
  await db.subgoals.clear()
  await db.tasks.clear()
  useDiscoveryStore.setState({
    opportunities: [],
    isLoadingOpportunities: false,
    isDiscovering: false,
  })
})

describe('useDiscoveryStore', () => {
  it('saveOpportunity scores the candidate against current goals and persists it', async () => {
    const goal = await createGoal(
      makeGoal('Master machine learning', 'Deep ML research work', 'career'),
    )

    const saved = await state().saveOpportunity(makeOpportunity())

    // Engine assigned a relevance and matched the on-topic career goal.
    expect(saved.relevanceScore).toBeGreaterThan(0)
    expect(saved.matchedGoalIds).toContain(goal.id)
    // Lifecycle flags default to not-yet-acted-on.
    expect(saved.addedToRoadmap).toBe(false)
    expect(saved.dismissed).toBe(false)
    // It is cached in the store and persisted.
    expect(state().opportunities).toHaveLength(1)
    expect(state().opportunities[0].id).toBe(saved.id)
  })

  it('saveOpportunity persists a score with no matches when nothing is relevant', async () => {
    await createGoal(
      makeGoal('Run a marathon', 'Build running endurance', 'health'),
    )

    // A scholarship about Latin poetry has no affinity for a health goal and no
    // term overlap -> no matched goals, but it is still saved.
    const saved = await state().saveOpportunity(
      makeOpportunity({
        type: 'scholarship',
        title: 'Latin poetry grant',
        tags: ['literature'],
      }),
    )

    expect(saved.matchedGoalIds).toEqual([])
    expect(state().opportunities).toHaveLength(1)
  })

  it('saveOpportunity treats a passed deadline as irrelevant (no matches)', async () => {
    await createGoal(
      makeGoal('Master machine learning', 'Deep ML research', 'career'),
    )

    // A clearly on-topic internship, but its deadline is long past -> the engine
    // reports it as relevanceScore 0 / no matches, yet the row is still saved so a
    // view could show it greyed out if it wanted.
    const saved = await state().saveOpportunity(
      makeOpportunity({ deadline: '2020-01-01' }),
    )

    expect(saved.relevanceScore).toBe(0)
    expect(saved.matchedGoalIds).toEqual([])
  })

  it('dismissOpportunity flags the row and keeps it in the catalogue', async () => {
    const saved = await state().saveOpportunity(makeOpportunity())
    await state().dismissOpportunity(saved.id)

    const fromStore = state().opportunities.find((o) => o.id === saved.id)
    expect(fromStore?.dismissed).toBe(true)
    // Dismissed opportunities are kept (the flag lives on the row).
    expect(state().opportunities).toHaveLength(1)
  })

  it('markAddedToRoadmap records the intent flag only', async () => {
    const saved = await state().saveOpportunity(makeOpportunity())
    await state().markAddedToRoadmap(saved.id)

    const fromStore = state().opportunities.find((o) => o.id === saved.id)
    expect(fromStore?.addedToRoadmap).toBe(true)
    // No subgoals/tasks materialised — this slice only sets the flag.
    expect(await db.subgoals.count()).toBe(0)
    expect(await db.tasks.count()).toBe(0)
  })

  it('removeOpportunity drops the row from the catalogue', async () => {
    const saved = await state().saveOpportunity(makeOpportunity())
    await state().removeOpportunity(saved.id)
    expect(state().opportunities).toHaveLength(0)
  })

  it('discoverOpportunities runs the pipeline and saves scored ai_search finds', async () => {
    await createGoal(
      makeGoal('Master machine learning', 'Deep ML research', 'career'),
    )

    const added = await state().discoverOpportunities('machine learning')

    expect(added).toBeGreaterThan(0)
    const opps = state().opportunities
    expect(opps).toHaveLength(added)
    // Everything came through the AI-search path, was scored, and at least one
    // find matched the ML goal.
    expect(opps.every((o) => o.source === 'ai_search')).toBe(true)
    expect(opps.some((o) => o.matchedGoalIds.length > 0)).toBe(true)
    expect(state().isDiscovering).toBe(false)
  })

  it('discoverOpportunities dedupes repeated identical searches by url', async () => {
    await createGoal(
      makeGoal('Master machine learning', 'Deep ML research', 'career'),
    )

    const first = await state().discoverOpportunities('machine learning')
    const second = await state().discoverOpportunities('machine learning')

    expect(first).toBeGreaterThan(0)
    // Same query -> same urls -> nothing new added the second time.
    expect(second).toBe(0)
    expect(state().opportunities).toHaveLength(first)
  })

  it('addToPlan creates a subgoal (deadline as target) + an Apply task and flags it', async () => {
    const goal = await createGoal(
      makeGoal('Get into RWTH', 'admission prep', 'education'),
    )
    const opp = await state().saveOpportunity(
      makeOpportunity({ deadline: '2026-09-01', url: 'https://x.com/i' }),
    )

    const subgoal = await state().addToPlan(opp, goal.id)

    // Subgoal under the chosen goal, carrying the deadline as its target date.
    expect(subgoal.goalId).toBe(goal.id)
    expect(subgoal.title).toBe(opp.title)
    expect(subgoal.targetDate).toBe('2026-09-01')
    expect(subgoal.requiresConsistency).toBe(false)
    // One starter "Apply" task under it.
    const tasks = await getTasksBySubgoalId(subgoal.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toContain('Apply')
    // The opportunity is now flagged added.
    const flagged = state().opportunities.find((o) => o.id === opp.id)
    expect(flagged?.addedToRoadmap).toBe(true)
  })

  it('addToPlan leaves the subgoal target date unset when the opportunity has no deadline', async () => {
    const goal = await createGoal(makeGoal('Career', 'grow', 'career'))
    const opp = await state().saveOpportunity(makeOpportunity({ deadline: undefined }))

    const subgoal = await state().addToPlan(opp, goal.id)

    expect(subgoal.targetDate).toBeUndefined()
  })

  it('loadOpportunities loads the catalogue and clears the loading flag', async () => {
    await state().saveOpportunity(makeOpportunity({ title: 'One' }))
    await state().saveOpportunity(makeOpportunity({ title: 'Two' }))

    // Reset cache to prove load repopulates it from the table.
    useDiscoveryStore.setState({ opportunities: [] })
    await state().loadOpportunities()

    expect(state().opportunities).toHaveLength(2)
    expect(state().isLoadingOpportunities).toBe(false)
  })
})
