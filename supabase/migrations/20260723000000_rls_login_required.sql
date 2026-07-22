-- M9: 收紧云端题库/分类的只读策略，仅允许已登录用户读取（与「强制登录」模型一致）
-- 幂等：仅在表已存在时重建策略；无写策略 → 仅 service_role 可写。
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categories') then
    drop policy if exists "categories_public_read" on public.categories;
    create policy "categories_public_read" on public.categories for select using (auth.uid() is not null);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'questions') then
    drop policy if exists "questions_public_read" on public.questions;
    create policy "questions_public_read" on public.questions for select using (auth.uid() is not null);
  end if;
end $$;
