/**
 * Barrel export so callers can import from '@/database/repositories'
 * rather than reaching into individual files.
 */
export * from './goalRepository';
export * from './subgoalRepository';
export * from './milestoneRepository';
export * from './taskRepository';
export * from './hierarchyRepository';
export * from './dependencyRepository';
export * from './opportunityRepository';
export * from './profileRepository';
export * from './contextRepository';
export * from './slipEventRepository';
// NOTE: there is no snapshotRepository. Progress history is computed LIVE from the
// task rows (ADR-0001, "no snapshot tables"), so the Phase-0 stub that used to be
// exported here was an empty object no caller ever imported. The `snapshots` table
// and its migration mappers remain for the Dexie->Supabase import path only.