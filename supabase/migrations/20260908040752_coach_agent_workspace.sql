create table public.coach_agent_turns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 opportunity_id uuid references public.coach_opportunities(id) on delete cascade,
 request_id uuid not null,
 question text not null check(length(question)<=4000),
 answer text not null check(length(answer)<=20000),
 context_fingerprint text not null,
 created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create index coach_agent_turns_scope on public.coach_agent_turns(user_id,opportunity_id,created_at desc);
alter table public.coach_agent_turns enable row level security;
revoke all on public.coach_agent_turns from anon,authenticated;
grant select,insert,delete on public.coach_agent_turns to service_role;
create table public.coach_market_updates (
 source_url text primary key,
 region text not null,
 content_hash text not null,
 excerpt text not null,
 checked_at timestamptz not null,
 changed_at timestamptz not null
);
alter table public.coach_market_updates enable row level security;
revoke all on public.coach_market_updates from anon,authenticated;
grant select,insert,update on public.coach_market_updates to service_role;
