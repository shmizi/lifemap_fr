// Canonical data models for LifeMap.
// These are the single source of truth for the entire app's data shapes.
// Every layer (database, engine, store, UI) imports from here.
// Do not alter these without updating the database schema and migrations.

export type ID = string;
export type ISODate = string;

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type SubgoalStatus = 'not_started' | 'active' | 'completed' | 'at_risk';
export type MilestoneStatus = 'locked' | 'active' | 'completed';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type GoalCategory =
  | 'education' | 'career' | 'health'
  | 'skills' | 'personal' | 'financial' | 'other';

export interface Goal {
  id: ID;
  title: string;
  description: string;
  category: GoalCategory;
  targetDate: ISODate;
  status: GoalStatus;
  priority: Priority;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Subgoal {
  id: ID;
  goalId: ID;
  title: string;
  description: string;
  targetDate?: ISODate;
  status: SubgoalStatus;
  requiresConsistency: boolean;
  estimatedDailyMinutes?: number;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Milestone {
  id: ID;
  subgoalId: ID;
  title: string;
  description?: string;
  status: MilestoneStatus;
  order: number;
  aiSuggested: boolean;
  completedAt?: ISODate;
  createdAt: ISODate;
}

export interface Task {
  id: ID;
  subgoalId: ID;
  milestoneId?: ID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: ISODate;
  scheduledDate?: ISODate;
  estimatedMinutes?: number;
  isRecurring: boolean;
  completedAt?: ISODate;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Dependency {
  id: ID;
  fromId: ID;
  toId: ID;
  type: 'subgoal' | 'task';
  createdAt: ISODate;
}

export interface UserProfile {
  id: ID;
  name: string;
  availableHoursPerDay: number;
  timezone: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ProgressSnapshot {
  id: ID;
  goalId: ID;
  capturedAt: ISODate;
  goalProgressPercent: number;
  completedTaskCount: number;
  totalTaskCount: number;
  completedMilestoneCount: number;
  totalMilestoneCount: number;
}

// Phase 6+ — Opportunity Discovery
export type OpportunityType =
  | 'internship' | 'hackathon' | 'scholarship'
  | 'conference' | 'competition' | 'program' | 'other';

export type OpportunitySource = 'ai_search' | 'manual';

export interface Opportunity {
  id: ID;
  type: OpportunityType;
  title: string;
  organization: string;
  description: string;
  deadline?: ISODate;
  startDate?: ISODate;
  endDate?: ISODate;
  url: string;
  location?: string;
  relevanceScore?: number;
  matchedGoalIds: ID[];
  tags: string[];
  source: OpportunitySource;
  addedToRoadmap: boolean;
  dismissed: boolean;
  savedAt: ISODate;
}
