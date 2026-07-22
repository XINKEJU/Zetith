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
