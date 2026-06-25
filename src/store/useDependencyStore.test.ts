import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { createDependency } from '@/database/repositories'
import { useDependencyStore } from './useDependencyStore'

// Read current store state in a test.
const state = () => useDependencyStore.getState()

beforeEach(async () => {
  // Isolate every test: clear the shared table AND reset the singleton store back
  // to its initial state (zustand stores persist across tests in the same module).
  await db.dependencies.clear()
  useDependencyStore.setState({
    dependencies: [],
    loadedType: null,
    order: [],
    cyclic: false,
    isLoadingDependencies: false,
  })
})

describe('useDependencyStore', () => {
  it('loadDependencies loads one kind and derives its topological order', async () => {
    // A task chain T1 -> T2 -> T3, plus an unrelated subgoal edge that must NOT
    // leak into the task graph.
    await createDependency({ fromId: 'T1', toId: 'T2', type: 'task' })
    await createDependency({ fromId: 'T2', toId: 'T3', type: 'task' })
    await createDependency({ fromId: 'S1', toId: 'S2', type: 'subgoal' })

    await state().loadDependencies('task')

    expect(state().loadedType).toBe('task')
    expect(state().dependencies).toHaveLength(2)
    expect(state().order).toEqual(['T1', 'T2', 'T3'])
    expect(state().cyclic).toBe(false)
    expect(state().isLoadingDependencies).toBe(false)
  })

  it('addDependency persists an edge and refreshes the order of the loaded graph', async () => {
    await createDependency({ fromId: 'T1', toId: 'T2', type: 'task' })
    await state().loadDependencies('task')

    const result = await state().addDependency({
      fromId: 'T2',
      toId: 'T3',
      type: 'task',
    })

    expect(result.ok).toBe(true)
    expect(state().dependencies).toHaveLength(2)
    expect(state().order).toEqual(['T1', 'T2', 'T3'])
  })

  it('addDependency rejects a cycle-forming edge and persists nothing', async () => {
    await createDependency({ fromId: 'A', toId: 'B', type: 'task' })
    await createDependency({ fromId: 'B', toId: 'C', type: 'task' })
    await state().loadDependencies('task')
    const orderBefore = state().order

    // C -> A would close A -> B -> C -> A.
    const result = await state().addDependency({
      fromId: 'C',
      toId: 'A',
      type: 'task',
    })

    expect(result).toEqual({ ok: false, reason: 'cycle' })
    // Nothing written, on-screen graph untouched.
    expect(await db.dependencies.count()).toBe(2)
    expect(state().dependencies).toHaveLength(2)
    expect(state().order).toEqual(orderBefore)
  })

  it('addDependency rejects a self-dependency', async () => {
    await state().loadDependencies('task')

    const result = await state().addDependency({
      fromId: 'X',
      toId: 'X',
      type: 'task',
    })

    expect(result).toEqual({ ok: false, reason: 'cycle' })
    expect(await db.dependencies.count()).toBe(0)
  })

  it('addDependency for another kind persists but does not disturb the loaded graph', async () => {
    await createDependency({ fromId: 'T1', toId: 'T2', type: 'task' })
    await state().loadDependencies('task')

    const result = await state().addDependency({
      fromId: 'S1',
      toId: 'S2',
      type: 'subgoal',
    })

    expect(result.ok).toBe(true)
    // Persisted to the table...
    expect(await db.dependencies.count()).toBe(2)
    // ...but the on-screen (task) graph is unchanged.
    expect(state().loadedType).toBe('task')
    expect(state().dependencies).toHaveLength(1)
    expect(state().dependencies.every((d) => d.type === 'task')).toBe(true)
  })

  it('removeDependency deletes the edge and refreshes the order', async () => {
    const a = await createDependency({ fromId: 'T1', toId: 'T2', type: 'task' })
    await createDependency({ fromId: 'T2', toId: 'T3', type: 'task' })
    await state().loadDependencies('task')

    await state().removeDependency(a.id)

    expect(await db.dependencies.count()).toBe(1)
    expect(state().dependencies).toHaveLength(1)
    // With T1 -> T2 gone, only T2 -> T3 remains.
    expect(state().order).toEqual(['T2', 'T3'])
  })
})
