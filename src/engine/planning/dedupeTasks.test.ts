import { describe, it, expect } from 'vitest'
import {
  findDuplicateTaskIds,
  titleSimilarity,
  DEDUP_THRESHOLD,
} from '@/engine/planning/dedupeTasks'

describe('titleSimilarity', () => {
  it('is 1 for identical titles and high for near-verbatim ones', () => {
    expect(titleSimilarity('Map AI faculty', 'Map AI faculty')).toBe(1)
    expect(
      titleSimilarity(
        'Create a taper week run schedule',
        'Create a taper-week run schedule',
      ),
    ).toBeGreaterThanOrEqual(DEDUP_THRESHOLD)
  })

  it('catches reordered / lightly-reworded titles via token overlap', () => {
    expect(
      titleSimilarity(
        'Map robotics and AI faculty at target universities',
        'Map AI and robotics faculty at the target universities',
      ),
    ).toBeGreaterThanOrEqual(DEDUP_THRESHOLD)
  })

  it('stays low for genuinely distinct titles', () => {
    expect(
      titleSimilarity(
        'Study recent papers from top mentor candidates',
        'Draft personalized cold-outreach emails to mentors',
      ),
    ).toBeLessThan(DEDUP_THRESHOLD)
  })
})

describe('findDuplicateTaskIds', () => {
  it('keeps the first occurrence and returns later near-duplicates', () => {
    const ids = findDuplicateTaskIds([
      { id: 'a', title: 'Map AI faculty at target universities' },
      { id: 'b', title: 'Study 2 papers from mentors' },
      { id: 'c', title: 'Map AI faculty at the target universities' }, // ~dup of a
    ])
    expect(ids).toEqual(['c'])
  })

  it('returns nothing when all titles are distinct', () => {
    const ids = findDuplicateTaskIds([
      { id: 'a', title: 'Write SOP draft' },
      { id: 'b', title: 'Request recommendation letters' },
      { id: 'c', title: 'Pass A1 mock test' },
    ])
    expect(ids).toEqual([])
  })

  it('drops every later copy in a cluster of three', () => {
    const ids = findDuplicateTaskIds([
      { id: 'a', title: 'Build a spreadsheet of target professors' },
      { id: 'b', title: 'Build a spreadsheet of target professors' },
      { id: 'c', title: 'Build a spreadsheet of the target professors' },
    ])
    expect(ids).toEqual(['b', 'c'])
  })

  it('respects a stricter threshold (fewer removals)', () => {
    const tasks = [
      { id: 'a', title: 'Map AI faculty at target universities' },
      { id: 'b', title: 'Map AI faculty at some target labs' },
    ]
    expect(findDuplicateTaskIds(tasks, 0.99)).toEqual([])
  })
})
