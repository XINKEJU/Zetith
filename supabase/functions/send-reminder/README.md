# 学习提醒邮件 Edge Function

浏览器无法直发邮件，故由 Supabase Edge Function（Deno）代发。

## 部署（开发者一次性操作）

1. 安装并登录 Supabase CLI：`supabase login`
2. 在 `tiku-app` 目录下关联项目：`supabase link --project-ref <YOUR_PROJECT_REF>`
3. 部署函数：`supabase functions deploy send-reminder`
4. 配置发信密钥（Resend，免费额度足够个人使用）：
   - 在 https://resend.com 注册并获取 API Key
   - `supabase secrets set RESEND_API_KEY=re_xxx`
   - 可选，配置发件人（需先在 Resend 验证你的域名）：
     `supabase secrets set REMINDER_FROM="知题 Zetith <noreply@your-domain.com>"`
     （不设则使用 Resend 提供的测试发件人 `onboarding@resend.dev`）

> 函数名 `send-reminder` 必须与前端 `supabase.functions.invoke('send-reminder', ...)`
> 中的名称一致。

## 工作原理

- 前端（`src/main.jsx` 的提醒调度器）在提醒时间点到、且用户开启「邮件提醒」并已登录后，
  调用 `supabase.functions.invoke('send-reminder', { body: { to, name } })`。
- 函数用调用方的 JWT 还原用户身份，并强制校验 `to === user.email`，
  **只允许发给登录用户本人的邮箱**，防止被用来向任意地址发信。
- 通过 Resend 发送 HTML 邮件。

## 降级策略

- 未部署该函数，或 `RESEND_API_KEY` 未配置，或用户未登录时：
  前端调用会失败，但被 `try/catch` 静默吞掉，**仅保留浏览器通知**，不影响其它功能。
- 因此本功能对尚未配置邮件后端的用户完全无感，无需改动客户端代码。
