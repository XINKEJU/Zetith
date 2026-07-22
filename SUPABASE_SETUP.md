# 知题 · Zetith 同步后端配置说明

本应用的数据同步采用 **Supabase**（自带 Auth + PostgreSQL）作为后端。开发者只需配置一次，用户端就只需要一个邮箱账号即可在多设备间同步学习进度。

## 当前状态（已接入）

后端凭据已写入项目根目录 `.env`（项目 URL 与 publishable key 均已填好）。**你只需完成下面「第 4 步：初始化数据库」——在 Supabase SQL Editor 执行一次 `supabase/schema.sql`，同步即正式可用，无需再次打包。**

> 说明：官方 Supabase 模板用的是 `NEXT_PUBLIC_*` 前缀（那是 Next.js 约定）。本应用是 Vite + Electron，只认 `VITE_` 前缀，因此 `.env` 已改用 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，代码也做了兼容读取。

## 用户侧体验

1. 打开应用 → 点击侧边栏「数据同步」。
2. 用邮箱注册 / 登录。
3. 学习进度（复习状态、笔记、收藏、练习历史）自动在设备间同步。

> 同步的是**学习进度**，不含题库本身。各设备需要导入相同的题库文件，题目 ID 一致才能对应。

## 开发者配置步骤

### 1. 创建 Supabase 项目

访问 [https://supabase.com](https://supabase.com)，注册或登录后新建一个项目。免费额度足够个人/小团队使用。

### 2. 获取连接信息

进入项目 → 左侧 **Project Settings** → **API**，复制以下两项：

- **URL**（形如 `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`）
- **anon public** API Key（形如 `eyJhbGciOiJIUzI1NiIs...`）

这两项可以嵌入前端，安全由数据库行级安全（RLS）保证。

### 3. 配置环境变量（已完成）

项目根目录的 `.env` 已填入真实凭据，一般无需改动。若以后更换 Supabase 项目，编辑 `.env` 的这两行即可：

```bash
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的 publishable key
```

> 注意 Vite 只暴露 `VITE_` 前缀变量；不要用 `NEXT_PUBLIC_` 前缀（那是 Next.js 专用，Vite 不会加载）。

### 4. 初始化数据库（启用同步唯一必须的操作）

在 Supabase 控制台左侧 **SQL Editor** → **New query**，粘贴 `supabase/schema.sql` 的全部内容并执行。这会创建 `sync_docs` 表并启用行级安全，确保每个用户只能访问自己的数据。

> 我已用该 key 验证过连通性：`AUTH health 200`、`sync_docs` 返回 `PGRST205 Could not find the table 'public.sync_docs'`——证明项目可达、key 有效，只差这张表。执行完本步后同步即可工作。

### 5. （强烈推荐）关闭邮箱确认，注册后直接登录

Supabase 默认要求用户点击邮件里的验证链接后才能登录。对学习类 App 来说，这会让首次体验多一步，且容易出现「注册后无法立即登录」的情况。

建议在 Supabase 控制台：
**Authentication → Providers → Email** → 关闭 **Confirm email** → **Save**。

关闭后，用户注册成功会立即登录并开始同步。

### 6. 重新打包

```bash
npm install
npm run electron:build:dmg
```

生成的 `release/知题-1.0.0-arm64.dmg` 即为已启用同步的安装包。

## 常见问题

**Q: 注册时提示「该邮箱已注册但尚未验证」怎么办？**  
A: 说明该邮箱已注册，但还没点击验证邮件。请检查邮箱（包括垃圾邮件）里的 Supabase 验证邮件并点击链接；或者直接在 Supabase 控制台关闭 **Confirm email**（参见步骤 5），之后即可直接登录。

**Q: 注册/登录时提示「密码至少需要 6 位字符」？**  
A: Supabase Auth 默认要求密码至少 6 位。前端已加校验，请提示用户输入 6 位以上密码。

**Q: 用户需要配置 Supabase 吗？**  
A: 不需要。开发者配置好后，用户只看到邮箱登录框。

**Q: 不配置 Supabase 会怎样？**  
A: 应用仍可正常使用，「数据同步」页面会提示「同步尚未开启」，不会白屏或崩溃。

**Q: 数据安全吗？**  
A: 采用 Supabase Auth + RLS。每个用户的进度文档带有 `user_id` 字段，RLS 策略保证用户只能读写 `user_id = auth.uid()` 的数据。Anon Key 即使泄露，没有用户登录令牌也无法访问数据。
