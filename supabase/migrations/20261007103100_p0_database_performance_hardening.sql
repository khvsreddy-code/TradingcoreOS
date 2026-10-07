-- P0 database hardening: eliminate duplicate indexes, make RLS auth.uid()
-- statement-stable, and cover all currently unindexed foreign keys identified
-- by Supabase's database advisor.
drop policy if exists prediction_runs_user_all on public.prediction_runs;
create policy prediction_runs_user_all on public.prediction_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists automations_user_all on public.automations;
create policy automations_user_all on public.automations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists automation_runs_user_all on public.automation_runs;
create policy automation_runs_user_all on public.automation_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists automation_notifications_user_all on public.automation_notifications;
create policy automation_notifications_user_all on public.automation_notifications
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can read their broker sessions" on public.broker_sessions;
create policy "users can read their broker sessions" on public.broker_sessions
  for select to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "users can delete their broker sessions" on public.broker_sessions;
create policy "users can delete their broker sessions" on public.broker_sessions
  for delete to authenticated
  using ((select auth.uid())::text = user_id);

drop index if exists public.idx_corespirit_deployments_user_status;
drop index if exists public.idx_corespirit_runs_user_created;
drop index if exists public.idx_corespirit_versions_script_version;
drop index if exists public.idx_corespirit_scripts_user_updated;

create index if not exists automation_notifications_automation_id_idx
  on public.automation_notifications (automation_id);
create index if not exists automation_notifications_run_id_idx
  on public.automation_notifications (run_id);
create index if not exists automation_runs_automation_id_idx
  on public.automation_runs (automation_id);
create index if not exists automations_user_id_idx
  on public.automations (user_id);
create index if not exists corespirit_deployments_script_id_idx
  on public.corespirit_deployments (script_id);
create index if not exists corespirit_deployments_version_id_idx
  on public.corespirit_deployments (version_id);
create index if not exists corespirit_execution_runs_version_id_idx
  on public.corespirit_execution_runs (version_id);
create index if not exists corespirit_script_versions_user_id_idx
  on public.corespirit_script_versions (user_id);
create index if not exists corespirit_scripts_active_version_idx
  on public.corespirit_scripts (active_version_id);
create index if not exists prediction_evaluations_artifact_id_idx
  on public.prediction_evaluations (artifact_id);
create index if not exists prediction_model_artifacts_model_id_idx
  on public.prediction_model_artifacts (model_id);
create index if not exists prediction_performance_model_id_idx
  on public.prediction_performance (model_id);
create index if not exists prediction_runs_model_id_idx
  on public.prediction_runs (model_id);
create index if not exists prediction_training_runs_artifact_id_idx
  on public.prediction_training_runs (artifact_id);
