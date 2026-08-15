# dsh-usage-vendor-stats

DeepSeek Harness 用量统计插件：**按厂商（订阅 / 官方 API）× KPI** 聚合 API 使用量，带 GitHub 风格日历热力图与日 / 月统计看板。

> 参考并区别于 [`dsh-usage-stats`](https://github.com/Make0209/dsh-usage-stats)（按工作区统计）：本插件以**厂商（provider）**为第一维度，自动识别 `assistant/message` 事件里的 `message.source.provider` 与 `message.source.model`，拆分 token / 缓存命中 / 输出 / 推理等 KPI。

## 功能

- **厂商维度**：自动发现所有使用过的厂商（如 `huoshan`、`hebox`、`deepseek-official`、`tokenrhythm`、`opencode`），可手动标记为「订阅 / 官方API」，设置别名（持久化到 `$DSH_HOME/storages` 的 KV 单元）
- **KPI 卡片**：总花费 Token（输入 / 缓存命中 / 输出 / 推理分项）、缓存命中率、模型调用次数、回合数、会话数、厂商数量
- **53 周热力图**：GitHub 绿色风格，颜色深浅按当日模型调用次数；点击厂商筛选后仅统计该厂商；悬停查看按厂商明细与 Token 明细
- **每日明细**：近 30 天逐日 Token / 缓存 / 输出 / 推理 / 命中率 / 回合
- **每月汇总**：全部历史按月聚合
- **厂商 KPI 表**：按总 Token 排序，含命中率、模型数、类型标签；点击行可联动筛选
- 时间范围切换（近 30 天 / 近 90 天 / 全部）、动画、亮暗主题自适应

## 数据说明

- 数据全部来自 DSH 持久化会话日志：`assistant/message` 事件携带 `usage`（Token 记账）与 `message.source.{provider,model}`（厂商/模型来源）
- Token 统计口径（与 DSH 一致）：`inputTokens` 为未命中输入，`cacheReadTokens` 为缓存命中输入，`outputTokens` 为输出，`reasoningTokens` 为推理，`cacheWriteTokens` 为缓存写入
- 缓存命中率 = 命中 /（命中 + 未命中输入）× 100%
- 插件激活时自动回填全部历史会话；插件卸载 / 重启后数据不丢

## 安装

本插件是标准的 DSH 社区插件包（声明 `dsh.bundle` manifest + web client 半）。

### 方式一：官方插件命令（GitHub 源 / npm 发布后）

从本仓库（GitHub）直接安装：

```bash
dsh plugin --profile web add "github:<你的用户名>/dsh-usage-vendor-stats"
```

发布到 npm 后：

```bash
dsh plugin --profile web add dsh-usage-vendor-stats
```

安装后刷新页面即可，无需手动改配置、无需重启。

### 方式二：手动注册（本地开发）

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

## 使用

1. 打开 **设置**（侧边栏底部）
2. 找到「**API 用量统计**」页面
3. 热力图颜色 = 当日调用次数；点击厂商 chip 或表格行可筛选
4. 在「厂商管理」里给每个厂商设置别名与类型（订阅 / 官方API），实时保存

## 架构

- **Host 半**（`lib/index.js`）：扫描持久化会话日志聚合用量（`assistant/message.usage` + `message.source`），监听 `session/event` 实时折叠；通过 `webServer` 服务注册数据路由：
  - `GET /api/usage-vendor-stats` — 统计快照（厂商 / 模型 / 日 / 月 / 汇总）
  - `POST /api/usage-vendor-stats/vendor` — 设置厂商别名与类型（订阅 / 官方API）
- **Client 半**（`lib/client.js`）：`window.__ModuleLoader__` 工厂格式的浏览器 bundle，注册设置面板「API 用量统计」页（`settings.section` 槽位）。

## 开发

- 修改 `lib/index.js` / `lib/client.js` 后刷新页面即生效（client bundle 随页面加载）；host 半改动通过重启 DSH 生效
- 插件包无第三方运行时依赖：host 半只使用 Cordis 服务，client 半只使用 react（模块表提供）

## License

MIT
