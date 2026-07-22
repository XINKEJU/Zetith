# 知题 · Zetith —— 开发文档

> 智能题库学习系统 · 架构、实现现状与开发参考

## 版本历史

| 版本   | 日期         | 修改内容 |
| ---- | ---------- | ---- |
| V1.0 | 2026-07-21 | 初始草案 |
| V1.1 | 2026-07-22 | 补充实现现状：实际技术栈、目录结构、数据库层、Electron 桌面端打包、移动端适配 |
| V1.2 | 2026-07-22 | 补充桌面端/移动端体验优化（系统深色、拖拽导入、Dock 进度、失焦暂停、专注模式、横屏、键盘避让、左右滑、触感、下拉刷新、自动更新框架）；菜单改为软件专属功能菜单 |

---

## 0. 实现现状（V1.1 新增）

> 本章记录截至 2026-07-22 的**实际实现**，与前文的需求/建议章节配合阅读。凡与第 4 章"技术选型建议"不一致处，以本章为准。

### 0.1 实际技术栈

| 层次 | 实际方案 | 说明 |
| ---- | ---- | ---- |
| 前端框架 | **React 18 + Vite 5** | 非 Flutter；`react-router-dom` v6 路由，React.lazy 代码分割 |
| 状态管理 | React Hooks（useState/useMemo/useCallback/useRef） | 未引入 Redux/Zustand，状态较轻 |
| 本地数据库 | **sql.js（SQLite WASM）** | 非 better-sqlite3；WASM 在浏览器/渲染进程内运行 |
| 数据持久化 | 浏览器 **OPFS** / 桌面端 **Node fs + IPC** | 详见 0.4 |
| Excel 解析 | **SheetJS（xlsx）** | 导入/导出 |
| 图表 | **Chart.js + react-chartjs-2** | 非 ECharts |
| 桌面打包 | **Electron 43 + electron-builder** | 产物 dmg，见 0.3 |
| 样式 | 纯 CSS（单文件 app.css，无 UI 框架） | 多邻国风格 + 4 级响应式断点 |

### 0.2 目录结构（tiku-app/）

```
tiku-app/
├── electron/
│   ├── main.js        # 主进程：本地 HTTP 服务 + IPC 持久化 + 中文菜单
│   └── preload.cjs    # contextBridge 暴露 window.electronDB / electronEnv
├── src/
│   ├── main.jsx       # 入口（Electron 下禁用 Service Worker）
│   ├── App.jsx
│   ├── components/    # Layout, SearchModal, ToastProvider, ErrorBoundary, Confetti ...
│   ├── pages/         # 12 个页面（见 0.5）
│   ├── db/database.js # 数据库层（OPFS / IPC 双通道）
│   └── styles/app.css # 全局样式（~2100 行）
├── public/            # 图标、sql-wasm.wasm、预构建 tiku.db、template.xlsx
├── scripts/prebuild-db.mjs  # 将 tiku/ 下 Excel 预构建为 tiku.db
├── vite.config.js
└── package.json       # 含 electron-builder build 配置
```

### 0.3 Electron 桌面端打包

- **命令**：`npm run electron:build:dmg`（先 vite build，再 electron-builder --mac dmg）。
- **配置要点**（package.json → build）：`appId: com.zetith.app`、`productName: 知题`、`asar: false`、`files: [dist/**, electron/**]`、mac target `dmg`（arm64 + x64）。
- **产物**：`release/知题-1.0.0-<arch>.dmg`，未做 Apple 付费签名（首次打开需右键→打开）。
- **软件专属菜单**：`main.js` 中 `app.name='知题'` + `Menu.buildFromTemplate` 构建「知题 / 学习 / 题库 / 编辑 / 视图 / 窗口 / 帮助」七组中文菜单。`学习` 与 `题库` 子菜单的菜单项通过 `webContents.send('app:menu', …)` 触发前端 `navigate` 真实跳转（如跳练习、模拟考试、题库管理）；`视图 › 跟随系统外观` 一键回归系统主题；`帮助 › 检查更新` 接入自动更新。
- **窗口外观**：`titleBarStyle: 'hidden'` + `trafficLightPosition` 实现 macOS 红绿灯原生适配；窗体位置记忆（`userData/window-state.json` + `screen.isOnAnyScreen()` 多屏校验），首次启动居中。
- **自动更新框架**：`electron-updater` 以动态 `import()` 方式接入（未安装不崩溃），`build.publish` 已配 GitHub Releases 通道；分发需签名 dmg + `GH_TOKEN`。

### 0.4 数据持久化双通道（关键实现）

由于 `file://` 协议下 OPFS 不可靠、绝对路径失效，桌面端**不**直接用 `loadFile`，而是：

1. **主进程内置本地 HTTP 服务**（`127.0.0.1` 随机端口）：localhost 是安全上下文，`/tiku.db`、`/sql-wasm.wasm` 等绝对路径均可正确解析；含 MIME 映射、SPA 路由回退、路径穿越防护。
2. **数据库持久化走 Node fs + IPC**：`preload.cjs` 通过 `contextBridge` 暴露 `window.electronDB.readFile/writeFile`，主进程 `ipcMain.handle('db:read'/'db:write')` 落盘到 `userData` 目录。
3. **数据库层自适应**：`src/db/database.js` 检测 `window.electronDB`——存在则走 IPC（桌面端），否则走 OPFS（浏览器 / PWA）。浏览器端行为完全不变。

### 0.5 页面清单（src/pages/）

| 文件 | 对应功能 |
| ---- | ---- |
| HomePage | 首页 / 学习打卡 / 快捷入口 |
| CategoriesPage | 题库管理（导入/导出/删除，移动端左划删除） |
| StudyPage | 浏览学习 |
| PracticePage | 答题练习（固定底部操作栏） |
| CardStudyPage | 背题卡片（3D 翻转） |
| ExamPage | 模拟考试（倒计时/成绩单） |
| DailyPage | 每日一练 |
| ReviewPage | 智能复习（SM-2） |
| WrongBookPage | 错题本 |
| FavoritesPage | 收藏夹 |
| StatsPage | 学习统计（Chart.js） |
| HistoryPage | 练习历史 |

### 0.6 移动端适配

- 4 级响应式断点（1024 / 768 / 480 / 360px）。
- 侧边栏抽屉、底部 Tab 栏 + 中央 FAB、底部弹出菜单（Bottom Sheet）。
- `env(safe-area-inset-*)` 安全区适配、禁用触摸设备 hover、禁止双击缩放。

### 0.7 桌面端与移动端体验优化（V1.2）

在 0.3 / 0.6 基础上，进一步补齐"好用"层体验：

**桌面端（macOS）**

| 特性 | 实现要点 |
| ---- | ---- |
| 跟随系统深色 | `nativeTheme` 监听系统外观；`⌘T` 手动切换时 override 系统；菜单「视图 › 跟随系统外观」回归系统 |
| 拖拽 Excel 导入 | 渲染端 `dragover`/`drop` 拦截，过滤 `.xlsx/.xls/.csv`，复用 `importService.importFromFiles`；带全局遮罩提示，完成后跳题库管理 |
| Dock 进度条 | 练习/考试进度经 `ipcRenderer` → 主进程 `BrowserWindow.setProgressBar`（仅 darwin），退出清除 |
| 失焦暂停计时 | `window` `blur`/`focus` + `visibilitychange` 时暂停单题/考试倒计时，回到前台恢复 |
| 答题专注模式 | 练习/考试页「专注模式」按钮，给 `body` 加 `focus-mode` 类隐藏侧栏/底栏（mac 红绿灯区留白） |

**移动端**

| 特性 | 实现要点 |
| ---- | ---- |
| 横屏布局 | `@media (orientation: landscape)` 下选项改两列网格、卡片限宽 |
| 虚拟键盘避让 | `visualViewport` 监听，软键盘弹出时上移底部导航/答题底栏 |
| 左右滑切题 | 练习/考试页 `touchstart`/`touchend` 识别左右滑切上/下一题 |
| 触感反馈 | 提交答案对/错触发 `navigator.vibrate` 短/长震动 |
| 下拉刷新 | 题库管理页顶部下拉 `touchmove` 触发数据刷新 |

**PWA 与更新**

- PWA：`public/manifest.webmanifest` + `public/sw.js` 应用壳缓存，`index.html` 引用，非 Electron 环境注册（主题色对齐品牌绿 `#2f9e6f`）。
- 自动更新：`electron-updater` 动态导入接入，帮助菜单「检查更新」已可用（见 0.3）。

**数据同步（零服务器方案）**

- 复用用户 GitHub 账号：账号 = GitHub 登录，存储 = 一个私有 Gist；Token 仅需 `gist` 作用域。
- `src/services/githubSync.js`：Gist 后端（push/pull/getUser），Token 与 gistId 存 localStorage。
- `src/services/syncService.js`：`exportUserData()` 仅导出 `review_state` / `notes` / `bookmarks`（按 question_id 为键，体积小）；`importUserData()` 以最后写入优先（LWW）合并远端，不删除本地独有记录。
- 不同步题库本身（体积大）；前提是各设备导入相同题库使 question_id 对齐。

---

## 1. 项目概述

### 1.1 项目背景

用户持有大量结构化题库（Excel格式），包含题型、题干、选项、答案、解析、难度等字段。现有学习方式为逐题阅读，效率低下。本项目旨在开发一套**智能题库学习系统**，支持批量导入题库，并通过科学的复习策略（如间隔重复、自适应测试）帮助用户高效掌握知识。

### 1.2 项目目标

- 支持导入**任意符合模板**的Excel题库文件

- 提供**学习、练习、测试、复盘**四种核心模式

- 内置**错题本**与**弱项分析**，动态调整出题策略

- 支持**多题库管理**，数据本地持久化（可选云端同步）

- 界面简洁，操作流畅，适合个人学习场景

### 1.3 目标用户

- 准备职业资格考试的学生（如三副、船员、医师、律师等）

- 需要大量刷题的自学者

- 教育培训机构的管理者（可选扩展）

---

## 2. 功能需求

### 2.1 题库管理模块

#### 2.1.1 题库导入

- **支持格式**：`.xlsx` / `.xls`（基于Apache POI或OpenXML）

- **字段映射**：允许用户自定义Excel列与系统字段的对应关系（题型、题干、选项A-D、答案、解析、难度、标签等）

- **自动校验**：检测必填字段缺失、选项重复、答案格式错误等，并给出提示

- **预览与确认**：导入前展示前5行数据，用户确认后正式入库

- **增量导入**：支持追加到已有题库，或覆盖更新

#### 2.1.2 题库维护

- 查看题库列表（名称、题目数量、创建时间、最近学习时间）

- 编辑/删除题库

- 导出题库为Excel（备份或分享）

- 题库标签管理（如“船舶结构与货运”、“法规”）

### 2.2 学习模式模块

#### 2.2.1 浏览学习模式

- 按顺序或随机浏览题库中的题目

- 点击“显示答案”后可查看答案与详细解析

- 支持收藏题目（标记为重点）

- 支持笔记功能（每道题可添加个人注释）

#### 2.2.2 答题练习模式

- 选择题库、设定题量（如20题）

- 逐题作答，提交后即时反馈（正确/错误，显示解析）

- 自动记录答题历史（时间、结果、耗时）

- 支持**选项乱序**（打乱ABCD顺序，防止死记位置）

#### 2.2.3 模拟考试模式

- 设定考试时长、题量、及格分数线

- 计时器倒计时，超时自动交卷

- 交卷后生成成绩单（总分、正确率、各题型得分、用时统计）

- 可查看错题回顾

#### 2.2.4 智能复习模式

- 基于**艾宾浩斯遗忘曲线**或**SM-2算法**安排复习计划

- 每日推送待复习题目（优先复习错误次数多、间隔时间长的题）

- 支持手动重置某题的复习进度

### 2.3 数据分析模块

#### 2.3.1 学习统计

- 总答题数、正确率、累计学习时长

- 每日/每周学习趋势图

- 各章节/标签的正确率雷达图

#### 2.3.2 错题本

- 自动收集所有答错的题目，按错误次数排序

- 支持按题库、标签、时间筛选

- 一键重新练习错题

- 支持“彻底掌握”（从错题本移除）或“再练一次”

#### 2.3.3 弱项诊断

- 分析错误题目的共同知识点（需提前为题目打标签）

- 推荐针对性练习（如“您的‘船体结构’章节正确率仅40%，建议加强”）

### 2.4 系统设置

- 字体大小、夜间模式

- 答题音效开关

- 数据备份与恢复（本地JSON/SQLite导出）

- 账号系统（可选，用于多设备同步）

---

## 3. 非功能需求

| 需求类别 | 具体要求                                              |
| ---- | ------------------------------------------------- |
| 性能   | 单题库支持10万+题目，检索响应<1秒；导入1万题<5秒                      |
| 兼容性  | 支持Windows/macOS/Linux（Electron）；移动端可选React Native |
| 安全性  | 本地数据加密存储（AES-256）；无网络依赖（离线可用）                     |
| 易用性  | 新手引导、快捷键支持、拖拽导入                                   |
| 可扩展性 | 插件化题库解析器，未来可支持PDF、Word等格式                         |

---

## 4. 系统架构设计

### 4.1 技术选型建议

| 层次    | 技术方案                                    |
| ----- | --------------------------------------- |
| 前端框架  | Electron + React（桌面应用）或 Flutter（跨平台移动端） |
| 状态管理  | Redux Toolkit / Zustand                 |
| 本地数据库 | SQLite（通过better-sqlite3或Drizzle ORM）    |
| 文件解析  | xlsx库（SheetJS）                          |
| 图表库   | ECharts / Chart.js                      |
| 打包工具  | electron-builder / Vite                 |

### 4.2 架构图（文字描述）

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│  (React Components: Home, Study, Stats...)  │
├─────────────────────────────────────────────┤
│              State Management               │
│  (Redux Store: userProgress, questions...)   │
├─────────────────────────────────────────────┤
│              Service Layer                   │
│  (QuestionService, ImportService, Review... )│
├─────────────────────────────────────────────┤
│            Data Access Layer                 │
│  (SQLite via better-sqlite3 / Prisma)       │
├─────────────────────────────────────────────┤
│              Local Storage                   │
│  (File System for Excel import/export)      │
└─────────────────────────────────────────────┘
```

### 4.3 数据流示例（导入题库）

1. 用户拖入Excel文件 → UI调用`ImportService`

2. `ImportService`使用`xlsx`库读取工作表

3. 根据用户配置的字段映射，转换为内部数据结构

4. 调用`QuestionDAO.insertBatch()`写入SQLite

5. 返回成功/失败统计 → UI显示结果

---

## 5. 数据库设计

### 5.1 核心表结构

#### 表：`categories`（题库）

| 字段          | 类型            | 说明   |
| ----------- | ------------- | ---- |
| id          | INTEGER PK    | 自增主键 |
| name        | TEXT NOT NULL | 题库名称 |
| description | TEXT          | 描述   |
| created_at  | DATETIME      | 创建时间 |
| updated_at  | DATETIME      | 更新时间 |

#### 表：`questions`（题目）

| 字段            | 类型            | 说明                  |
| ------------- | ------------- | ------------------- |
| id            | INTEGER PK    | 自增主键                |
| category_id   | INTEGER FK    | 所属题库ID              |
| question_type | TEXT          | '单选题','多选题','判断题'   |
| stem          | TEXT NOT NULL | 题干                  |
| option_a      | TEXT          | 选项A                 |
| option_b      | TEXT          | 选项B                 |
| option_c      | TEXT          | 选项C                 |
| option_d      | TEXT          | 选项D                 |
| answer        | TEXT NOT NULL | 标准答案（如'A','ABC'）    |
| explanation   | TEXT          | 解析                  |
| difficulty    | TEXT          | '易','适中','偏难','难'   |
| tags          | TEXT          | 逗号分隔的标签（如'船体结构,甲板'） |
| created_at    | DATETIME      |                     |

#### 表：`study_records`（学习记录）

| 字段             | 类型         | 说明            |
| -------------- | ---------- | ------------- |
| id             | INTEGER PK |               |
| question_id    | INTEGER FK |               |
| is_correct     | BOOLEAN    | 是否正确          |
| answer_given   | TEXT       | 用户选择的答案       |
| time_spent     | INTEGER    | 花费时间（秒）       |
| practiced_at   | DATETIME   | 练习时间          |
| review_stage   | INTEGER    | SM-2算法阶段（0-5） |
| next_review_at | DATETIME   | 下次复习时间        |

#### 表：`notes`（笔记）

| 字段          | 类型         | 说明   |
| ----------- | ---------- | ---- |
| id          | INTEGER PK |      |
| question_id | INTEGER FK |      |
| content     | TEXT       | 笔记内容 |
| created_at  | DATETIME   |      |

#### 表：`bookmarks`（收藏）

| 字段          | 类型         | 说明  |
| ----------- | ---------- | --- |
| id          | INTEGER PK |     |
| question_id | INTEGER FK |     |
| created_at  | DATETIME   |     |

### 5.2 索引建议

- `questions(category_id)`

- `study_records(question_id, practiced_at)`

- `study_records(next_review_at)` 用于查询待复习题目

---

## 6. 界面原型（低保真描述）

### 6.1 首页（Dashboard）

- 左侧导航栏：我的题库、学习、错题本、统计、设置

- 中央区域：快捷入口（继续上次学习、今日复习任务、模拟考试）

- 底部：学习进度概览（总题数、已完成、正确率）

### 6.2 题库管理页

- 卡片式列表展示所有题库

- 每个卡片显示：题库名、题量、最后学习时间

- 右上角“导入题库”按钮

- 点击卡片进入该题库详情（可查看题目列表、编辑、删除）

### 6.3 答题界面

- 顶部：进度条（当前第X题/共Y题）、计时器（模拟考模式）

- 中部：题干 + 选项（单选/多选按钮）

- 底部：“提交答案”按钮（提交后显示对错、解析）

- 解析区域：可折叠，显示答案、解析、难度、标签

- 附加按钮：收藏、笔记、下一题

### 6.4 错题本

- 列表显示所有错题，按错误次数降序

- 每条显示：题干摘要、错误次数、最后错误时间

- 支持筛选（题库、标签、时间范围）

- 点击进入单题复习模式

### 6.5 统计页面

- 概览卡片：总答题数、正确率、学习天数

- 折线图：每日正确率趋势

- 饼图：各题型占比

- 雷达图：各标签正确率

---

## 7. 核心算法设计

### 7.1 SM-2间隔重复算法（简化版）

用于智能复习模式，决定每道题的下次复习时间。

```
def sm2_update(quality, repetitions, ease_factor, interval):
    """
    quality: 0-5 (0=完全忘记, 5=完美回忆)
    repetitions: 连续正确次数
    ease_factor: 简易因子（初始2.5）
    interval: 当前间隔天数
    返回新的(repetitions, ease_factor, interval)
    """
    if quality >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1

    ease_factor = max(1.3, ease_factor + 0.1 - (5 - quality) * 0.08)
    return repetitions, ease_factor, interval
```

### 7.2 自适应选题算法

- 优先选择：`next_review_at <= now` 且 `review_stage` 较低的题目

- 加入权重：错误次数多的题目权重高

- 引入新题比例：每次练习中新题占比20%，复习题80%

### 7.3 选项乱序算法

- 对每道题生成一个随机排列（如 [0,2,1,3]）

- 显示时按新顺序渲染选项

- 保存答案时需逆映射回原始选项，以便与标准答案比对

---

## 8. 开发计划与里程碑

| 阶段       | 时间  | 交付物                   |
| -------- | --- | --------------------- |
| P0 - MVP | 2周  | 题库导入、基础答题、错题本、本地存储    |
| P1 - 核心  | 3周  | 模拟考试、统计图表、选项乱序、SM-2复习 |
| P2 - 体验  | 2周  | 笔记、收藏、夜间模式、快捷键、导出     |
| P3 - 优化  | 1周  | 性能测试、Bug修复、用户手册       |

---

## 9. 附录

### 9.1 题库导入模板规范（推荐）

用户Excel文件应遵循以下列名约定（可映射）：

| 列名  | 必填  | 说明              |
| --- | --- | --------------- |
| 题型  | 是   | 单选题/多选题/判断题     |
| 题干  | 是   | 题目正文            |
| 选项A | 否   | 单选题必填，判断题可不填    |
| 选项B | 否   |                 |
| 选项C | 否   |                 |
| 选项D | 否   |                 |
| 答案  | 是   | 如"A"、"ABD"、"正确" |
| 解析  | 否   | 详细解释            |
| 难度  | 否   | 易/适中/偏难/难       |
| 标签  | 否   | 逗号分隔            |

### 9.2 已知风险与对策

- **Excel格式兼容性**：使用成熟库（SheetJS），支持.xlsx/.xls/.csv

- **大数据量性能**：分页加载，虚拟滚动（react-window）

- **数据丢失**：定时自动备份到用户指定目录

---

**文档结束**


