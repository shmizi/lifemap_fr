import { describe, it, expect } from 'vitest'
import { computeLifeMapLayout } from './computeLifeMapLayout'

describe('computeLifeMapLayout', () => {
  it('places one city per goal and one town per subgoal', () => {
    const layout = computeLifeMapLayout(
      ['g1', 'g2'],
      { g1: ['s1', 's2'], g2: ['s3'] },
      [],
    )
    const cities = layout.nodes.filter((n) => n.kind === 'city')
    const towns = layout.nodes.filter((n) => n.kind === 'town')
    expect(cities.map((c) => c.id).sort()).toEqual(['g1', 'g2'])
    expect(towns.map((t) => t.id).sort()).toEqual(['s1', 's2', 's3'])
  })

  it('creates a membership link from every town to its city', () => {
    const layout = computeLifeMapLayout('g1'.split(','), { g1: ['s1', 's2'] }, [])
    const member = layout.links.filter((l) => l.kind === 'member')
    expect(member).toHaveLength(2)
    expect(member.every((l) => l.target === 'g1')).toBe(true)
  })

  it('keeps dependency roads only between placed towns, including cross-goal', () => {
    const layout = computeLifeMapLayout(
      ['g1', 'g2'],
      { g1: ['s1'], g2: ['s2'] },
      [
        { fromId: 's1', toId: 's2' }, // cross-goal — kept
        { fromId: 's1', toId: 'ghost' }, // endpoint missing — dropped
      ],
    )
    const dep = layout.links.filter((l) => l.kind === 'dep')
    expect(dep).toHaveLength(1)
    expect(dep[0]).toMatchObject({ source: 's1', target: 's2' })
  })

  it('returns a positive padded box that contains every node', () => {
    const layout = computeLifeMapLayout(
      ['g1', 'g2', 'g3'],
      { g1: ['s1', 's2'], g2: ['s3'], g3: [] },
      [],
    )
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(layout.width)
      expect(n.y).toBeLessThanOrEqual(layout.height)
    }
  })

  it('handles the empty case without throwing', () => {
    const layout = computeLifeMapLayout([], {}, [])
    expect(layout.nodes).toHaveLength(0)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const run = () =>
      computeLifeMapLayout(['g1', 'g2'], { g1: ['s1', 's2'], g2: ['s3'] }, [
        { fromId: 's1', toId: 's3' },
      ])
    expect(run()).toEqual(run())
  })
})
