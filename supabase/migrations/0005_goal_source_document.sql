-- 0005 — attach a reference document's distillate to a goal's context.
--
-- The user can upload a syllabus / job spec / training plan on Goal Detail; it is
-- summarised ONCE at upload and only the summary is stored, because this row is
-- rendered into every AI generation for the goal (see core/types SourceDocument).
-- Raw document text is never persisted.
--
-- jsonb, nullable, no index — exactly like strategy_brief in 0002: it is read as
-- part of the goal_context row and never queried by its contents. Adding a nullable
-- column rewrites no existing data, and the RLS policies already on goal_context
-- cover it unchanged.

alter table public.goal_context
  add column if not exists source_document jsonb;

comment on column public.goal_context.source_document is
  'Distilled summary of a user-uploaded reference document: { name, summary, originalChars, addedAt }. Never the raw document text.';
