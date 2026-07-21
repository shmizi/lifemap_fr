// Slip-event repository — all database access for the `slipEvents` store (Stage 3
// of the health model: the reschedule reason log).
//
// Per the data-flow rule (DB -> Repositories -> Engine -> Store -> UI), every read
// or write touching this table lives here. A SlipEvent is a LEAF, append-only record
// (like an audit entry): created in batches when a reschedule moves tasks, read for
// the pattern engine, and pruned only when its goal is deleted. It owns `id` and `at`
// — the caller supplies the descriptive fields.

import { nanoid } from 'nanoid';
import { db } from '../db';
import type { ID, SlipEvent } from '@/core/types';
import { isCloudDataLive, cloudClient } from '@/database/backend';
import { slipEventToRow } from '@/database/migration/toRows';
import { slipEventFromRow } from '@/database/migration/fromRows';

// The caller provides everything except the id (generated) and `at` (stamped here,
// so every row's timestamp is trustworthy for the time-window queries).
export type CreateSlipEventInput = Omit<SlipEvent, 'id' | 'at'>;

/**
 * Record a batch of slip events (one reschedule usually moves several tasks). All
 * rows share the caller's `at` if given, else a single `now` stamp for the batch —
 * so every task moved together is grouped at the same instant. bulkAdd is one write.
 */
export async function createSlipEvents(
  inputs: CreateSlipEventInput[],
  at: string = new Date().toISOString(),
): Promise<SlipEvent[]> {
  const events: SlipEvent[] = inputs.map((input) => ({
    ...input,
    id: nanoid(),
    at,
  }));
  if (events.length === 0) return events;
  if (isCloudDataLive()) {
    const { error } = await cloudClient()
      .from('slip_events')
      .insert(events.map(slipEventToRow));
    if (error) throw new Error(`createSlipEvents: ${error.message}`);
    return events;
  }
  await db.slipEvents.bulkAdd(events);
  return events;
}

/** Every slip event for one goal (its pattern is computed per goal). */
export async function getSlipEventsByGoalId(goalId: ID): Promise<SlipEvent[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient()
      .from('slip_events')
      .select('*')
      .eq('goal_id', goalId);
    if (error) throw new Error(`getSlipEventsByGoalId: ${error.message}`);
    return (data ?? []).map(slipEventFromRow);
  }
  return db.slipEvents.where('goalId').equals(goalId).toArray();
}

/** Every slip event across all goals (cross-goal patterns / export). */
export async function getAllSlipEvents(): Promise<SlipEvent[]> {
  if (isCloudDataLive()) {
    const { data, error } = await cloudClient().from('slip_events').select('*');
    if (error) throw new Error(`getAllSlipEvents: ${error.message}`);
    return (data ?? []).map(slipEventFromRow);
  }
  return db.slipEvents.toArray();
}

/**
 * Remove every slip event for a goal — called when the goal is deleted, so the log
 * never outlives what it describes. Idempotent (no rows = no-op).
 */
export async function deleteSlipEventsByGoalId(goalId: ID): Promise<void> {
  if (isCloudDataLive()) {
    const { error } = await cloudClient()
      .from('slip_events')
      .delete()
      .eq('goal_id', goalId);
    if (error) throw new Error(`deleteSlipEventsByGoalId: ${error.message}`);
    return;
  }
  await db.slipEvents.where('goalId').equals(goalId).delete();
}
