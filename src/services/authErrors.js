// 统一的中文鉴权错误映射，供登录/注册表单与强制登录弹窗复用。
export function mapAuthError(e) {
  const code = e?.code || e?.name
  const msgText = e?.message || String(e)
  switch (code) {
    case 'weak_password':
      return '密码至少需要 6 位字符'
    case 'invalid_credentials':
      return '邮箱或密码错误'
    case 'email_not_confirmed':
      return '邮箱尚未验证，请查收验证邮件后重试'
    case 'user_already_registered':
      return '该邮箱已注册，请直接登录'
    case 'over_email_send_rate_limit':
    case 'rate_limit_exceeded':
      return '操作太频繁，请稍后再试'
    case 'email_address_invalid':
      return '邮箱格式无效或域名被限制，请更换邮箱'
    case 'validation_failed':
      return msgText.includes('password') ? '密码格式不符合要求' : '输入信息有误，请检查'
    default:
      return msgText || '操作失败，请检查网络后重试'
  }
}
