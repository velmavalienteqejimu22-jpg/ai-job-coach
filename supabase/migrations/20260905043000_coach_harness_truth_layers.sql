-- M0 可靠性：把「来源」「确认状态」「核验等级」拆开，并记录 Context 取舍。
-- 依据 PRD §5.1（Context Compiler 记录选了什么/舍弃了什么）、§5.2（事实分层）、
-- §5.8（Trace）、§6.1（核心对象）。
--
-- 设计原则：
--   1. 导入 ≠ 用户逐条确认 ≠ 外部核验。三者由三个独立字段表示。
--   2. 历史 confirmed 不静默升级可信度：迁移时把来源写进 migrated_from。
--   3. 是否可用由 source_kind 决定，是否提醒由 verification_level 决定。

-- 1. coach_claims：分离来源与确认状态
alter table public.coach_claims
  add column if not exists source_kind text not null default 'user_upload'
    check (source_kind in ('user_upload', 'user_statement', 'ai_extraction', 'external_verification', 'system_inference', 'migrated_legacy')),
  add column if not exists verification_level text not null default 'self_reported'
    check (verification_level in ('none', 'self_reported', 'user_confirmed', 'externally_verified')),
  add column if not exists migrated_from text;

comment on column public.coach_claims.source_kind is
  '事实来自哪里。user_upload=用户上传的材料；user_statement=对话中自述；ai_extraction=模型从材料抽取；external_verification=外部可核验来源；system_inference=系统推断（不可写进对外材料）；migrated_legacy=历史数据迁移。';
comment on column public.coach_claims.verification_level is
  '被核验到什么程度。none=无依据；self_reported=用户自己说的；user_confirmed=用户逐条确认；externally_verified=外部来源核验。';
comment on column public.coach_claims.migrated_from is
  '迁移来源说明。非空表示这条记录的确认状态是迁移继承的，不是本次用户确认的结果。';

-- 2. 迁移历史数据：简历逐行导入的 claims 不能被当作用户逐条确认
--    recordResumeClaims 曾把所有简历行直接写成 status='confirmed'、visibility='recruiter_safe'。
--    这些行的 claim_type 恒为 'resume_source'，据此识别。
update public.coach_claims
   set source_kind = 'user_upload',
       verification_level = 'self_reported',
       migrated_from = 'legacy:auto_confirmed_resume_line',
       status = case when status = 'confirmed' then 'unverified' else status end
 where claim_type = 'resume_source'
   and coalesce(migrated_from, '') = '';

-- 其余历史 confirmed 保留确认状态，但标记为迁移继承，不冒充外部核验
update public.coach_claims
   set source_kind = 'migrated_legacy',
       verification_level = 'user_confirmed',
       migrated_from = 'legacy:confirmed'
 where claim_type <> 'resume_source'
   and status = 'confirmed'
   and coalesce(migrated_from, '') = '';

update public.coach_claims
   set source_kind = 'migrated_legacy',
       verification_level = 'self_reported',
       migrated_from = coalesce('legacy:' || status, 'legacy:unknown')
 where status <> 'confirmed'
   and coalesce(migrated_from, '') = '';

-- 3. coach_runs：记录 Context 版本、Prompt 版本、预算和停止原因
alter table public.coach_runs
  add column if not exists context_version integer,
  add column if not exists prompt_version text,
  add column if not exists intent text,
  add column if not exists plan_version integer,
  add column if not exists deadlines jsonb not null default '{}'::jsonb,
  add column if not exists selected_opportunity_ids uuid[] not null default '{}',
  add column if not exists budget jsonb not null default '{}'::jsonb,
  add column if not exists stopped_reason text,
  add column if not exists model_call_count integer not null default 0,
  add column if not exists tool_call_count integer not null default 0;

comment on column public.coach_runs.budget is
  '本次运行的成本硬边界：max_input_tokens / max_model_calls / max_tool_calls / route_class。';
comment on column public.coach_runs.stopped_reason is
  '为什么停下：completed | awaiting_user | timeout | cost_cap | permission_denied | user_cancelled | no_evidence | error。';

-- 4. Context 取舍记录：回答「我上传过怎么没看到」
create table if not exists public.coach_run_context_selections (
  id bigint generated always as identity primary key,
  run_id uuid references public.coach_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  context_version integer not null default 2,
  decision text not null check (decision in ('included', 'excluded')),
  kind text not null check (kind in (
    'current_input', 'question_source', 'opportunity', 'artifact',
    'confirmed_fact', 'recent_practice', 'knowledge', 'history_summary'
  )),
  ref_id text,
  ref_version text,
  trust_type text check (trust_type is null or trust_type in (
    'user_input', 'user_material', 'user_confirmed', 'externally_verified',
    'retrieved_knowledge', 'ai_derived'
  )),
  reason text not null,
  detail text,
  estimated_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coach_run_context_selections_run_idx
  on public.coach_run_context_selections(run_id, id);
create index if not exists coach_run_context_selections_user_kind_idx
  on public.coach_run_context_selections(user_id, kind, created_at desc);

-- 5. 运行状态对齐 PRD §4.2：reading / ready / running / waiting_user / saving / completed / failed / cancelled
alter table public.coach_runs
  drop constraint if exists coach_runs_status_check;
alter table public.coach_runs
  add constraint coach_runs_status_check check (status in (
    'reading', 'ready', 'running', 'waiting_user', 'saving',
    'completed', 'failed', 'cancelled',
    -- 历史值，迁移期间保留，不再写入
    'queued', 'planning', 'awaiting_user', 'verifying'
  ));

-- 旧状态一次性对齐到新状态
update public.coach_runs set status = 'running' where status in ('queued', 'planning');
update public.coach_runs set status = 'waiting_user' where status = 'awaiting_user';
update public.coach_runs set status = 'saving' where status = 'verifying';

-- 6. 运行事件：补齐模型调用、校验、产物和停止事件
alter table public.coach_run_events
  drop constraint if exists coach_run_events_event_type_check;
alter table public.coach_run_events
  add constraint coach_run_events_event_type_check check (event_type in (
    'created', 'context_compiled', 'planned', 'tool_started', 'tool_completed',
    'awaiting_user', 'verified', 'completed', 'failed', 'cancelled',
    'model_call', 'validation', 'artifact_saved', 'stopped', 'retry'
  ));

-- 7. 作用域优先查询的索引：先按 user + 岗位作用域筛选，再排序
create index if not exists coach_claims_user_scope_updated_idx
  on public.coach_claims(user_id, opportunity_id, status, updated_at desc);
create index if not exists coach_artifacts_user_scope_created_idx
  on public.coach_artifacts(user_id, opportunity_id, created_at desc);
create index if not exists coach_sources_user_type_idx
  on public.coach_sources(user_id, source_type, captured_at desc);
create index if not exists coach_claims_source_kind_idx
  on public.coach_claims(user_id, source_kind, verification_level);

-- 8. 权限与 RLS 与既有 harness 表保持一致：仅 service_role 可读写
alter table public.coach_run_context_selections enable row level security;
revoke all privileges on public.coach_run_context_selections from anon, authenticated;
grant select, insert, update, delete on public.coach_run_context_selections to service_role;
grant usage, select on sequence public.coach_run_context_selections_id_seq to service_role;
