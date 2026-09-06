-- M5（PRD §3.1/§3.2/§6.1/§8 M1）：动态入口与可修改计划。
--
-- coach_plans — 用户当前执行计划。四类目的入口（从零学/准备投递/准备面试/谈薪）
--   各自 seed 首个任务；计划可切换、可暂停、可回访，不是永久用户画像。
--   goal_type + opportunity_id 可空：从零学/通用准备没有岗位也要能开工（PRD §3.0）。
--   每用户最多一个 active 计划（部分唯一索引），切换时旧计划转 paused 保留历史，
--   任务和产物不清空（PRD §3.2：换目标不清空已完成产物）。
--
-- coach_offers — 谈薪入口的 offer 条款。条款逐项记录、缺项显示未知
--   （PRD §6.1：不把不同币种或不保证兑现的权益合计成可比收入）。

create table if not exists public.coach_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('learn_from_zero', 'prepare_apply', 'interviewing', 'negotiating')),
  opportunity_id uuid references public.coach_opportunities(id) on delete set null,
  version integer not null default 1 check (version > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  tasks jsonb not null default '[]'::jsonb,
  revision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 每用户最多一个 active 计划：入口切换 = 旧计划 paused + 新计划 active。
create unique index if not exists coach_plans_one_active_per_user
  on public.coach_plans(user_id) where (status = 'active');

create index if not exists coach_plans_user_updated_idx
  on public.coach_plans(user_id, updated_at desc);
create index if not exists coach_plans_opportunity_idx
  on public.coach_plans(opportunity_id) where opportunity_id is not null;

create table if not exists public.coach_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.coach_opportunities(id) on delete cascade,
  terms jsonb not null default '{}'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  status text not null default 'received' check (status in ('received', 'comparing', 'negotiating', 'accepted', 'declined', 'expired')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_offers_user_opportunity_idx
  on public.coach_offers(user_id, opportunity_id, updated_at desc);

alter table public.coach_plans enable row level security;
alter table public.coach_offers enable row level security;

revoke all privileges on public.coach_plans from anon, authenticated;
revoke all privileges on public.coach_offers from anon, authenticated;

grant select, insert, update, delete on public.coach_plans to service_role;
grant select, insert, update, delete on public.coach_offers to service_role;

comment on table public.coach_plans is
  '动态路径的当前执行计划（PRD §3.2）。tasks 为任务数组，version 随每次修改递增。';
comment on column public.coach_plans.goal_type is
  '四类目的入口：learn_from_zero（从零学）/ prepare_apply（准备投递）/ interviewing（准备面试）/ negotiating（谈薪）。选择不是永久身份，可随时切换。';
comment on column public.coach_plans.tasks is
  '计划任务数组：[{id, title, description, status(todo|in_progress|done|skipped), reason, entryType, artifactId?}]。前置条件只分执行必需/可跳过/须确认三类（PRD §3.3）。';
comment on table public.coach_offers is
  '谈薪入口的 offer 条款（PRD §3.1 第四行 / §6.1）。terms 逐项记录币种/周期/固定浮动/期限/来源，缺项存 unknowns，不做跨币种合计。';
