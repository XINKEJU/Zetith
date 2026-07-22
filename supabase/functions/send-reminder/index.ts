import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM = Deno.env.get('REMINDER_FROM') || 'Zetith <onboarding@resend.dev>'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    // 用调用方的 JWT 还原用户身份，确保函数不能被匿名滥用
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)

    const { to } = await req.json()
    // 安全：只允许发给当前登录用户自己的邮箱
    if (!to || to !== user.email) return json({ error: 'forbidden' }, 403)
    if (!RESEND_API_KEY) return json({ error: 'email not configured' }, 500)
    // 昵称取自服务端身份（不信任客户端入参），并做 HTML 转义，防止邮件模板注入
    const rawName = (user.user_metadata?.nickname || '').toString()
    const name = rawName.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: '📖 知题 · 该学习了！',
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px">${name ? name + '，' : ''}该学习了 💪</h2>
  <p style="color:#444;line-height:1.7;font-size:15px;">打开 <b>知题 · Zetith</b> 刷几道题，保持你的学习节奏。</p>
  <p style="color:#999;font-size:12px;margin-top:24px;">这是一封由学习提醒自动发送的邮件，可在「个人中心 → 学习提醒」中关闭。</p>
</div>`,
      }),
    })
    const j = await res.json().catch(() => ({}))
    return json(j, res.status)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
