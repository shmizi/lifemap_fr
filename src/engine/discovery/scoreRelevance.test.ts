import { describe, expect, it } from 'vitest'
import type { GoalCategory, OpportunityType } from '@/core/types'
import {
  CATEGORY_AFFINITY_WEIGHT,
  KEYWORD_OVERLAP_WEIGHT,
  MATCH_THRESHOLD,
  scoreRelevance,
  type GoalProfile,
  type OpportunityProfile,
} from './scoreRelevance'

const TODAY = '2026-06-26'

function goal(
  id: string,
  title: string,
  description: string,
  category: GoalCategory,
): GoalProfile {
  return { id, title, description, category }
}

function opportunity(
  partial: Partial<OpportunityProfile> & { type: OpportunityType },
): OpportunityProfile {
  return {
    title: '',
    description: '',
    tags: [],
    ...partial,
  }
}

describe('scoreRelevance', () => {
  it('returns no match when the user has no goals', () => {
    const result = scoreRelevance(
      opportunity({ type: 'internship', title: 'ML Internship', tags: ['ML'] }),
      [],
      TODAY,
    )
    expect(result).toEqual({ relevanceScore: 0, matchedGoalIds: [] })
  })

  it('does not match on category affinity alone when no terms overlap', () => {
    // An internship has affinity for a career goal, but shares no words with it.
    // Affinity boosts a real match's score; it never asserts one on its own, so
    // this is NOT a match and the headline relevance is 0.
    const result = scoreRelevance(
      opportunity({ type: 'internship', title: 'Acme placement', tags: [] }),
      [goal('g1', 'Land a software job', 'Become employed somewhere good', 'career')],
      TODAY,
    )
    expect(result.matchedGoalIds).toEqual([])
    expect(result.relevanceScore).toBe(0)
  })

  it('scores keyword overlap alone when the category does not fit', () => {
    // A scholarship has NO affinity for a health goal, but every opportunity
    // term ('running') lands in the goal -> score is the full overlap weight.
    const result = scoreRelevance(
      opportunity({ type: 'scholarship', title: 'Running', tags: [] }),
      [goal('g1', 'Running habit', 'Build a daily running routine', 'health')],
      TODAY,
    )
    expect(result.relevanceScore).toBeCloseTo(KEYWORD_OVERLAP_WEIGHT)
    expect(result.matchedGoalIds).toEqual(['g1'])
  })

  it('reaches 1.0 when category fits AND every term overlaps', () => {
    const result = scoreRelevance(
      opportunity({ type: 'internship', title: 'machine learning', tags: [] }),
      [goal('g1', 'machine learning', 'study machine learning deeply', 'career')],
      TODAY,
    )
    expect(result.relevanceScore).toBeCloseTo(1)
    expect(result.matchedGoalIds).toEqual(['g1'])
  })

  it('counts tags as opportunity terms with the same weight as the title', () => {
    // Title shares nothing; the tag 'germany' is what lands in the goal. Half of
    // the two opportunity terms overlap -> 0.5 * overlap weight, plus affinity.
    const result = scoreRelevance(
      opportunity({ type: 'program', title: 'Exchange', tags: ['Germany'] }),
      [goal('g1', 'Move to Germany', 'Relocate and study abroad', 'education')],
      TODAY,
    )
    // 'exchange' (title) + 'germany' (tag) = 2 terms; 'germany' overlaps -> 0.5.
    expect(result.relevanceScore).toBeCloseTo(
      CATEGORY_AFFINITY_WEIGHT + KEYWORD_OVERLAP_WEIGHT * 0.5,
    )
    expect(result.matchedGoalIds).toEqual(['g1'])
  })

  it('does not match a topical overlap too weak to clear the bar', () => {
    // 'other' type has no affinity. Goal g1 shares 1 of 3 terms (~0.33 overlap ->
    // 0.6*0.33 = 0.2, under MATCH_THRESHOLD), so it does not match and headline
    // relevance is 0 (relevance reflects only real matches).
    const result = scoreRelevance(
      opportunity({ type: 'other', title: 'spanish cooking class', tags: [] }),
      [goal('g1', 'Learn spanish', 'Reach conversational fluency', 'skills')],
      TODAY,
    )
    expect(result.matchedGoalIds).toEqual([])
    expect(result.relevanceScore).toBe(0)
  })

  it('matches multiple goals and orders them strongest first', () => {
    const opp = opportunity({
      type: 'hackathon',
      title: 'machine learning hackathon',
      tags: ['AI'],
    })
    // g1: career affinity + strong term overlap. g2: skills affinity + weaker
    // overlap. g3: education affinity but NO shared terms -> excluded (affinity
    // alone never matches).
    const result = scoreRelevance(
      opp,
      [
        goal('g3', 'Read more books', 'Finish one book a month', 'education'),
        goal('g1', 'Master machine learning', 'Deep AI and machine learning work', 'career'),
        goal('g2', 'Sharpen coding skills', 'Practice machine learning daily', 'skills'),
      ],
      TODAY,
    )
    // g1 strongest, g2 next; g3 (affinity only, no overlap) does not match.
    expect(result.matchedGoalIds).toEqual(['g1', 'g2'])
    expect(result.relevanceScore).toBeGreaterThan(MATCH_THRESHOLD)
  })

  it('treats a passed deadline as irrelevant regardless of topic', () => {
    const result = scoreRelevance(
      opportunity({
        type: 'internship',
        title: 'machine learning',
        tags: [],
        deadline: '2026-06-25', // yesterday relative to TODAY
      }),
      [goal('g1', 'machine learning', 'study machine learning', 'career')],
      TODAY,
    )
    expect(result).toEqual({ relevanceScore: 0, matchedGoalIds: [] })
  })

  it('keeps an opportunity whose deadline is today (still open)', () => {
    const result = scoreRelevance(
      opportunity({
        type: 'internship',
        title: 'machine learning',
        tags: [],
        deadline: TODAY,
      }),
      [goal('g1', 'machine learning', 'study machine learning', 'career')],
      TODAY,
    )
    expect(result.matchedGoalIds).toEqual(['g1'])
    expect(result.relevanceScore).toBeGreaterThan(0)
  })

  it('compares full ISO deadlines by calendar date only', () => {
    // A timestamped deadline later today must NOT read as expired.
    const result = scoreRelevance(
      opportunity({
        type: 'internship',
        title: 'role',
        tags: [],
        deadline: '2026-06-26T23:59:00.000Z',
      }),
      [goal('g1', 'career', 'find a role', 'career')],
      TODAY,
    )
    // Affinity alone (internship/career) keeps it a match.
    expect(result.matchedGoalIds).toEqual(['g1'])
  })

  it('ignores stopwords and single characters so matches reflect topic', () => {
    // The only real shared term is 'kubernetes'; 'the'/'a'/'of' must not count.
    const result = scoreRelevance(
      opportunity({ type: 'other', title: 'the future of kubernetes', tags: [] }),
      [goal('g1', 'Learn kubernetes', 'Operate a cluster', 'skills')],
      TODAY,
    )
    // opportunity terms after cleaning: 'future', 'kubernetes' -> 1 of 2 overlap.
    expect(result.relevanceScore).toBeCloseTo(KEYWORD_OVERLAP_WEIGHT * 0.5)
    expect(result.matchedGoalIds).toEqual(['g1'])
  })

  it('is deterministic for goals that tie on score', () => {
    // Two goals that share a term with the opportunity and tie on score -> the
    // tie is broken by id ascending, deterministically.
    const opp = opportunity({ type: 'conference', title: 'leadership summit', tags: [] })
    const result = scoreRelevance(
      opp,
      [
        goal('gb', 'Leadership career', 'advance professionally', 'career'),
        goal('ga', 'Leadership learning', 'grow knowledge', 'education'),
      ],
      TODAY,
    )
    expect(result.matchedGoalIds).toEqual(['ga', 'gb'])
  })
})
