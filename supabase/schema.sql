-- ============================================================
-- 知题 · Zetith — 同步后端表结构
-- 在 Supabase 控制台 → SQL Editor 中执行本文件即可启用「账号同步」。
-- 只需执行一次；之后开发者把 .env 中的 URL / Anon Key 填好重新打包，
-- 用户端即可用一个邮箱账号在多设备间同步学习进度。
-- ============================================================

-- 同步文档表：每行 = 一条学习进度（答题记录 / 收藏 / 复习状态 / 笔记 / 会话）
create table if not exists public.sync_docs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  doc_type   text        not null,
  doc_key    text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 每用户 + 每类 + 每业务键 唯一，保证 upsert 幂等（覆盖同一条进度）
create unique index if not exists sync_docs_uniq
  on public.sync_docs (user_id, doc_type, doc_key);

create index if not exists sync_docs_user on public.sync_docs (user_id);

-- 行级安全（RLS）：核心隔离机制。
-- Anon Key 虽公开，但每个登录用户只能读写自己 user_id 下的行。
alter table public.sync_docs enable row level security;

drop policy if exists "sync_docs_owner_all" on public.sync_docs;
create policy "sync_docs_owner_all"
  on public.sync_docs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 说明：
-- 1. 前端用 Anon Key 调用 supabase.from('sync_docs')，RLS 自动按 auth.uid() 过滤。
-- 2. 注册/登录走 Supabase Auth（邮箱+密码），无需自建账号服务。
-- 3. 如需关闭「注册需邮箱确认」以便即时体验，在
--    Authentication → Providers → Email 中关闭「Confirm email」。

-- ============================================================
-- 题库（云端源）：分类 + 题目
-- 题目与分类仅由管理员经 service_role 写入（见 scripts/seed-questions.mjs），
-- 普通用户与匿名用户只读（用于浏览）；RLS 不给写策略即不可写。
-- 注意：id 沿用本地 tiku.db 的整数 id，保证 study_records / bookmarks 等
--       以 question_id 关联的进度在各端一致对应。
-- ============================================================

create table if not exists public.categories (
  id          bigint       primary key,
  name        text         not null,
  description text         default '',
  created_at  timestamptz  default now(),
  updated_at  timestamptz  default now()
);

create table if not exists public.questions (
  id           bigint       primary key,
  category_id  bigint       not null references public.categories(id) on delete cascade,
  question_type text        default '单选题',
  stem         text         not null,
  option_a     text         default '',
  option_b     text         default '',
  option_c     text         default '',
  option_d     text         default '',
  answer       text         not null,
  explanation  text         default '',
  difficulty   text         default '适中',
  tags         text         default '',
  created_at   timestamptz  default now()
);

create index if not exists questions_category_idx on public.questions (category_id);

-- 公开只读：任何人（含匿名）可浏览题目与分类；无写策略 → 仅 service_role 可写
alter table public.categories enable row level security;
alter table public.questions enable row level security;

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
  on public.categories for select using (true);

drop policy if exists "questions_public_read" on public.questions;
create policy "questions_public_read"
  on public.questions for select using (true);

-- 分类题目计数 RPC（供客户端显示每类题量，避免前端拉全表）
create or replace function public.category_question_counts()
returns table (category_id bigint, cnt bigint)
language sql
security definer
set search_path = public
as $$
  select category_id, count(*)::bigint as cnt
  from public.questions
  group by category_id
$$;

grant execute on function public.category_question_counts() to anon, authenticated;
