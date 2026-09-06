-- 并行计划（PRD §3.2 多岗位并行；修复验收抽查发现的两处缺陷）：
--
-- 1. 去掉「每用户最多一个 active 计划」的部分唯一索引：切换入口只改变
--    「当前聚焦哪个计划」（focused_at），不再暂停其他计划——
--    「当前展示哪个」≠「其他计划停止」。
-- 2. 复用旧计划必须同时匹配 goal_type 和 opportunity_id（含 null），
--    杜绝把 A 岗位的任务带到 B 岗位。
--
-- focused_at 回填为 updated_at，保证存量数据有序。

drop index if exists coach_plans_one_active_per_user;

alter table public.coach_plans add column if not exists focused_at timestamptz not null default now();

update public.coach_plans set focused_at = updated_at;

create index if not exists coach_plans_user_focused_idx
  on public.coach_plans(user_id, focused_at desc);

comment on column public.coach_plans.focused_at is
  '最近一次被聚焦的时间（切换入口/复用计划时刷新）。当前计划 = active 中 focused_at 最新者；多个计划可并行，切换不暂停其他计划（PRD §3.2）。';
