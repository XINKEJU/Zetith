#!/usr/bin/env bash
#
# 一键部署「学习提醒邮件」Edge Function 到 Supabase
# 用法（在 tiku-app/ 目录下执行）：
#   SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=xxx RESEND_API_KEY=re_xxx \
#     bash scripts/deploy-reminder.sh
#
# 说明：
#   - SUPABASE_ACCESS_TOKEN：https://supabase.com/dashboard/account/tokens 生成
#   - SUPABASE_PROJECT_REF：项目控制台 URL 里的 <REF>
#   - RESEND_API_KEY：https://resend.com 注册后在 API Keys 页面创建
#   - 可选：REMINDER_FROM="知题 Zetith <noreply@your-domain.com>"（需先在 Resend 验证域名）
set -euo pipefail

# 必须在 tiku-app/ 目录运行（supabase/ 文件夹所在位置）
cd "$(dirname "$0")/.."

: "${SUPABASE_ACCESS_TOKEN:?请设置 SUPABASE_ACCESS_TOKEN（Supabase 个人访问令牌）}"
: "${SUPABASE_PROJECT_REF:?请设置 SUPABASE_PROJECT_REF（Supabase 项目 Ref）}"
: "${RESEND_API_KEY:?请设置 RESEND_API_KEY（Resend API Key）}"

echo ">> 1/4 登录 Supabase CLI（使用访问令牌，非交互）"
supabase login --token "$SUPABASE_ACCESS_TOKEN"

echo ">> 2/4 关联项目"
supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo ">> 3/4 部署函数 send-reminder"
supabase functions deploy send-reminder

echo ">> 4/4 写入密钥"
supabase secrets set "RESEND_API_KEY=$RESEND_API_KEY"
if [ -n "${REMINDER_FROM:-}" ]; then
  supabase secrets set "REMINDER_FROM=$REMINDER_FROM"
fi

echo ">> 验证已写入的密钥"
supabase secrets list

echo "✅ 完成。前端：个人中心开启「学习提醒」+「邮件提醒」并登录即可收到邮件。"
