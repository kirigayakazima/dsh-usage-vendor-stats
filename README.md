# dsh-usage-vendor-stats

[English](#english) · [中文](#中文)

---

## English

DeepSeek Harness usage statistics plugin: aggregates API usage **by vendor (subscription / official API) × KPI**, with a GitHub-style calendar heatmap and daily / monthly dashboards.

> Distinct from [`dsh-usage-stats`](https://github.com/Make0209/dsh-usage-stats) (which aggregates by workspace): this plugin uses the **vendor (provider)** as the primary dimension, auto-detecting `message.source.provider` and `message.source.model` from `assistant/message` events, and splits KPIs into tokens / cache hits / output / reasoning.

### Features

- **Vendor dimension**: auto-discovers every vendor used (e.g. `huoshan`, `hebox`, `deepseek-official`, `tokenrhythm`, `opencode`), with manual labels for **subscription / official API** and aliases (persisted to a KV unit under `$DSH_HOME/storages`).
- **KPI cards**: total tokens (input / cache hit / output / reasoning breakdown), cache hit rate, model calls, turns, sessions, vendor count, with a multi-color token composition ratio bar.
- **53-week heatmap**: GitHub-green style, intensity by daily model calls; click a vendor chip to filter; hover for per-vendor and per-token details.
- **Trend line chart**: Token / Calls dual-axis trend, per-day by default and **per-hour for "today"** (hourly aggregation).
- **Vendor model drilldown**: click a vendor row to expand its per-model consumption.
- **Daily detail**: per-day tokens / cache / output / reasoning / hit rate / turns (last 30 days).
- **Monthly summary**: all history aggregated by month.
- **Vendor KPI table**: sorted by total tokens, with hit rate, model count, type badge; click a row to drill into models.
- **Time presets**: today / 7d / 14d / 30d / 90d / all.
- **Cost estimation**: set a per-million-token unit price per vendor to see an estimated fee column.
- **CSV export**: export daily / monthly / vendor tables to CSV.
- **Health / performance cards**: average TTFT (time to first token), generation speed (t/s), peak context size, request error rate, and total model / tool wall time, aggregated from DSH's `sessionStats` projection.
- Range switching, animations, light/dark theme adaptation.

### Screenshots

![Dashboard](assets/screenshot-dashboard.png)

![Heatmap & tables](assets/screenshot-heatmap.png)

### Data source

- All data comes from DSH durable session logs: `assistant/message` events carry `usage` (token accounting) and `message.source.{provider,model}` (vendor/model provenance).
- Token accounting (consistent with DSH): `inputTokens` = uncached input, `cacheReadTokens` = cached input, `outputTokens` = output, `reasoningTokens` = reasoning, `cacheWriteTokens` = cache write.
- Cache hit rate = hits / (hits + uncached input) × 100%.
- History is backfilled automatically on activation; data survives plugin uninstall / restart.

### Install

This is a standard DSH community plugin package (declares `dsh.bundle` manifest + web client half).

#### From GitHub (recommended)

```bash
dsh plugin --profile web add "github:kirigayakazima/dsh-usage-vendor-stats"
```

Refresh the page after install — no manual config, no restart.

#### Manual registration (local development)

1. Place this directory anywhere and create a symlink pointing to it under `$DSH_HOME/profiles/node_modules/` (use a junction on Windows):
   ```powershell
   New-Item -ItemType Junction -Path "$env:DSH_HOME\profiles\node_modules\dsh-usage-vendor-stats" -Target "<absolute path to this dir>"
   ```
2. Add a line to `$DSH_HOME/profiles/web/cordis.patch.yml`:
   ```yaml
   - insert:
       - id: usage-vendor-stats
         name: dsh-usage-vendor-stats
   ```
   The user patch layer hot-reloads: save and refresh the page.

### Usage

1. Open **Settings** (sidebar footer) and find the **API Usage Stats** page, or click the **📊 Usage Stats** entry in the sidebar footer to open the fullscreen panel.
2. Heatmap color = daily call count; click a vendor chip or table row to filter / drill down.
3. In **Vendor Management**, set each vendor's alias and type (subscription / official API), and optionally a per-million-token unit price for cost estimation.

### Architecture

- **Host half** (`lib/index.js`): scans durable session logs and aggregates usage (`assistant/message.usage` + `message.source`), listens to `session/event` for live folding; serves data routes via the `webServer` service:
  - `GET /api/usage-vendor-stats` — stats snapshot (vendors / models / daily / monthly / hourly / totals)
  - `POST /api/usage-vendor-stats/vendor` — set vendor alias, type, and unit price
- **Client half** (`lib/client.js`): `window.__ModuleLoader__` factory-format browser bundle, registering the **API Usage Stats** settings page (`settings.section` slot), a sidebar footer entry (`sidebar.footer.action`), and a fullscreen panel (`shell.overlay`).

### Development

- Editing `lib/index.js` / `lib/client.js` takes effect after a page refresh (client bundle loads with the page); host-half changes require a DSH restart.
- The plugin has no third-party runtime dependencies: the host half uses only Cordis services, the client half only React (provided by the module table).

### License

MIT

---

## 中文

DeepSeek Harness 用量统计插件：**按厂商（订阅 / 官方 API）× KPI** 聚合 API 使用量，带 GitHub 风格日历热力图、趋势折线图与日 / 月 / 小时统计看板。

> 区别于 [`dsh-usage-stats`](https://github.com/Make0209/dsh-usage-stats)（按工作区统计）：本插件以**厂商（provider）**为第一维度，自动识别 `assistant/message` 事件里的 `message.source.provider` 与 `message.source.model`，拆分 token / 缓存命中 / 输出 / 推理等 KPI。

### 功能

- **厂商维度**：自动发现所有使用过的厂商（如 `huoshan`、`hebox`、`deepseek-official`、`tokenrhythm`、`opencode`），可手动标记为「订阅 / 官方API」，设置别名（持久化到 `$DSH_HOME/storages` 的 KV 单元）
- **KPI 卡片**：总花费 Token（输入 / 缓存命中 / 输出 / 推理分项）、缓存命中率、模型调用次数、回合数、会话数、厂商数量，附多色 Token 构成比例条
- **53 周热力图**：GitHub 绿色风格，颜色深浅按当日模型调用次数；点击厂商筛选后仅统计该厂商；悬停查看按厂商明细与 Token 明细
- **趋势折线图**：Token / 调用双轴趋势，默认按日；选「今天」时**按小时**展示（小时级聚合）
- **厂商模型钻取**：点击厂商行展开该厂商的逐模型消耗
- **每日明细**：近 30 天逐日 Token / 缓存 / 输出 / 推理 / 命中率 / 回合
- **每月汇总**：全部历史按月聚合
- **厂商 KPI 表**：按总 Token 排序，含命中率、模型数、类型标签；点击行钻取模型
- **时间预设**：今天 / 7 天 / 14 天 / 30 天 / 90 天 / 全部
- **费用估算**：为每个厂商设置每百万 token 单价，即可看到折算的预估费用列
- **CSV 导出**：每日 / 每月 / 厂商表格均可导出 CSV
- **健康度/性能卡片**：平均首字延迟（TTFT）、生成速度（t/s）、峰值 Context、请求错误率、模型/工具总耗时，聚合自 DSH 的 `sessionStats` 投影
- 时间范围切换、动画、亮暗主题自适应

### 截图

![用量看板](assets/screenshot-dashboard.png)

![热力图与表格](assets/screenshot-heatmap.png)

### 数据说明

- 数据全部来自 DSH 持久化会话日志：`assistant/message` 事件携带 `usage`（Token 记账）与 `message.source.{provider,model}`（厂商/模型来源）
- Token 统计口径（与 DSH 一致）：`inputTokens` 为未命中输入，`cacheReadTokens` 为缓存命中输入，`outputTokens` 为输出，`reasoningTokens` 为推理，`cacheWriteTokens` 为缓存写入
- 缓存命中率 = 命中 /（命中 + 未命中输入）× 100%
- 插件激活时自动回填全部历史会话；插件卸载 / 重启后数据不丢

### 安装

本插件是标准的 DSH 社区插件包（声明 `dsh.bundle` manifest + web client 半）。

#### 从 GitHub 直接安装（推荐）

```bash
dsh plugin --profile web add "github:kirigayakazima/dsh-usage-vendor-stats"
```

安装后刷新页面即可，无需手动改配置、无需重启。

#### 手动注册（本地开发）

1. 把本目录放入任意位置，并在 `$DSH_HOME/profiles/node_modules/` 下创建指向本目录的符号链接（Windows 用 junction）：
   ```powershell
   New-Item -ItemType Junction -Path "$env:DSH_HOME\profiles\node_modules\dsh-usage-vendor-stats" -Target "<本目录绝对路径>"
   ```
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 添加一行：
   ```yaml
   - insert:
       - id: usage-vendor-stats
         name: dsh-usage-vendor-stats
   ```
   用户 patch 层会被热重载：保存后刷新页面即可。

### 使用

1. 打开 **设置**（侧边栏底部）找到「**API 用量统计**」页，或点击侧边栏底部的「**📊 用量统计**」入口打开全屏面板
2. 热力图颜色 = 当日调用次数；点击厂商 chip 或表格行可筛选 / 钻取
3. 在「厂商管理」里给每个厂商设置别名与类型（订阅 / 官方API），可选设置每百万 token 单价用于费用估算

### 架构

- **Host 半**（`lib/index.js`）：扫描持久化会话日志聚合用量（`assistant/message.usage` + `message.source`），监听 `session/event` 实时折叠；通过 `webServer` 服务注册数据路由：
  - `GET /api/usage-vendor-stats` — 统计快照（厂商 / 模型 / 日 / 月 / 小时 / 汇总）
  - `POST /api/usage-vendor-stats/vendor` — 设置厂商别名、类型与单价
- **Client 半**（`lib/client.js`）：`window.__ModuleLoader__` 工厂格式的浏览器 bundle，注册设置面板「API 用量统计」页（`settings.section` 槽位）、侧边栏底部入口（`sidebar.footer.action`）与全屏面板（`shell.overlay`）。

### 开发

- 修改 `lib/index.js` / `lib/client.js` 后刷新页面即生效（client bundle 随页面加载）；host 半改动通过重启 DSH 生效
- 插件包无第三方运行时依赖：host 半只使用 Cordis 服务，client 半只使用 react（模块表提供）

### License

MIT
