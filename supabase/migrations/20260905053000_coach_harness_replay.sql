-- M1：让 Context 选择记录可解释、可回放。
-- 在 coach_run_context_selections 上加 rule / required / cost 三个字段：
--   rule     — 触发这次选择的具体规则代码（"required:current_input"、"excluded:task_irrelevant" 等）。
--              UI 按 rule 决定颜色/图标，回放时按 rule 复算决策路径。
--   required — required=true 表示这条是必备项，预算装不下就 fail-loud。
--   cost     — 即便被 excluded 也记下 token 成本，给回放时计算「再挤多少 token 就能装」。
--
-- 依据 PRD §5.1（Context Compiler 记录选了什么/舍弃了什么）+ §5.8（Trace）。

alter table public.coach_run_context_selections
  add column if not exists rule text,
  add column if not exists required boolean not null default false,
  add column if not exists cost integer not null default 0;

comment on column public.coach_run_context_selections.rule is
  '触发此条决策的规则代码。required:* 表示必备；priority:* 表示按优先级装填；excluded:* 表示主动舍弃。';
comment on column public.coach_run_context_selections.required is
  '是否为必备项。required=true 且被舍弃时记 reason=budget_exhausted，调用方必须让用户做选择。';
comment on column public.coach_run_context_selections.cost is
  '评估的 token 成本。即便被 excluded 也记录，给 replay 算「再挤多少就能装」。';

-- 已有 reason 字段保留为人读说明，不替换。新写入会同时写 reason + rule，由代码层负责同步。
-- 历史行 rule 为空，replay 流程对历史行只用作 hint，不参与决策。

create index if not exists coach_run_context_selections_rule_idx
  on public.coach_run_context_selections(rule);