// dsh-usage-vendor-stats 插件 Host 半
// 数据聚合：按「厂商(provider) × KPI」统计 API 用量（token / 缓存命中 / 输出 / 推理 / 回合 / 调用次数），
// 支持订阅与官方 API 两种厂商类型，提供日 / 月 / 模型多维聚合，通过 webServer 路由向客户端提供数据。
const name = 'dsh-usage-vendor-stats'
const inject = ['sessionQuery', 'workspaceRegistry', 'timer']

function sendJson(res, code, value) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= maxBytes) chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

function apply(ctx) {
  const storage = ctx.get('storage')
  const webServer = ctx.get('webServer')

  // ---------- owned aggregation state ----------
  // vendorId -> vendor meta + lifetime totals
  const vendors = new Map()
  // modelKey 'provider/model' -> lifetime totals
  const models = new Map()
  // date 'YYYY-MM-DD' -> DayAgg
  const byDay = new Map()
  // sessionId -> last consumed event seq
  const sessionSeq = new Map()
  const sessionCount = new Set()
  const chains = new Map()
  const scan = { started: false, done: false, scanned: 0, total: 0, failed: 0 }
  // 全局回合计数（turn/end 无厂商归属，单独累计）
  let turnTotal = 0
  // vendorId -> { alias, type: 'subscription' | 'api' | 'unknown' }
  const vendorMeta = {}
  let kvUnit = null
  let metaWriteChain = Promise.resolve()

  const DAY_MS = 86400000
  const WEEKS = 53

  function dayKey(ms) {
    const d = new Date(ms)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function monthKey(dateStr) {
    return typeof dateStr === 'string' && dateStr.length >= 7 ? dateStr.slice(0, 7) : dateStr
  }
  function cutoffKey() {
    return dayKey(Date.now() - WEEKS * 7 * DAY_MS)
  }
  function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  function emptyTokens() {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  }
  function emptyVendorTotals() {
    return { turns: 0, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  }
  function ensureVendor(vendorId) {
    let v = vendors.get(vendorId)
    if (v === undefined) {
      v = Object.assign({ id: vendorId, ...emptyVendorTotals() }, { modelKeys: new Set() })
      vendors.set(vendorId, v)
    }
    return v
  }
  function ensureModel(modelKey) {
    let m = models.get(modelKey)
    if (m === undefined) {
      const slash = modelKey.indexOf('/')
      m = Object.assign({
        key: modelKey,
        provider: slash >= 0 ? modelKey.slice(0, slash) : 'unknown',
        model: slash >= 0 ? modelKey.slice(slash + 1) : modelKey,
        ...emptyVendorTotals(),
      })
      models.set(modelKey, m)
    }
    return m
  }
  function ensureDay(date) {
    let day = byDay.get(date)
    if (day === undefined) {
      day = { date, turns: 0, calls: 0, tokens: emptyTokens(), byVendor: new Map(), byModel: new Map() }
      byDay.set(date, day)
    }
    return day
  }
  function ensureDayVendor(day, vendorId) {
    let v = day.byVendor.get(vendorId)
    if (v === undefined) {
      v = { vendorId, ...emptyVendorTotals() }
      day.byVendor.set(vendorId, v)
    }
    return v
  }
  function ensureDayModel(day, modelKey) {
    let m = day.byModel.get(modelKey)
    if (m === undefined) {
      m = { modelKey, ...emptyVendorTotals() }
      day.byModel.set(modelKey, m)
    }
    return m
  }

  function addUsage(vendorId, modelKey, time, usage, isTurnEnd) {
    const input = num(usage && usage.inputTokens)
    const output = num(usage && usage.outputTokens)
    const cacheRead = num(usage && usage.cacheReadTokens)
    const cacheWrite = num(usage && usage.cacheWriteTokens)
    const reasoning = num(usage && usage.reasoningTokens)
    const hasUsage = input + output + cacheRead + cacheWrite + reasoning > 0

    // lifetime vendor
    const v = ensureVendor(vendorId)
    if (hasUsage) v.calls += 1
    if (isTurnEnd) v.turns += 1
    v.input += input
    v.output += output
    v.cacheRead += cacheRead
    v.cacheWrite += cacheWrite
    v.reasoning += reasoning

    // lifetime model
    const m = ensureModel(modelKey)
    if (hasUsage) m.calls += 1
    if (isTurnEnd) m.turns += 1
    m.input += input
    m.output += output
    m.cacheRead += cacheRead
    m.cacheWrite += cacheWrite
    m.reasoning += reasoning
    v.modelKeys.add(modelKey)

    const date = dayKey(time)
    if (date < cutoffKey()) return
    const day = ensureDay(date)
    if (hasUsage) day.calls += 1
    if (isTurnEnd) day.turns += 1
    day.tokens.input += input
    day.tokens.output += output
    day.tokens.cacheRead += cacheRead
    day.tokens.cacheWrite += cacheWrite
    day.tokens.reasoning += reasoning

    const dv = ensureDayVendor(day, vendorId)
    if (hasUsage) dv.calls += 1
    if (isTurnEnd) dv.turns += 1
    dv.input += input
    dv.output += output
    dv.cacheRead += cacheRead
    dv.cacheWrite += cacheWrite
    dv.reasoning += reasoning

    const dm = ensureDayModel(day, modelKey)
    if (hasUsage) dm.calls += 1
    if (isTurnEnd) dm.turns += 1
    dm.input += input
    dm.output += output
    dm.cacheRead += cacheRead
    dm.cacheWrite += cacheWrite
    dm.reasoning += reasoning
  }

  // 从 assistant/message 事件读取 provider / model / usage
  function sourceOf(eventData) {
    if (eventData === null || eventData === undefined || typeof eventData !== 'object') return null
    const message = eventData.message
    if (message === null || message === undefined || typeof message !== 'object') return null
    const source = message.source
    if (source === null || source === undefined || typeof source !== 'object') return null
    return source
  }
  function foldEvent(wsId, time, type, data) {
    if (type === 'turn/end') {
      // 回合结束：厂商未知（回合可能跨厂商），按 day 计回合即可，不归属具体厂商
      turnTotal += 1
      const date = dayKey(time)
      if (date < cutoffKey()) return
      ensureDay(date).turns += 1
      return
    }
    if (type !== 'assistant/message') return
    const usage = data && data.usage
    if (usage === undefined || usage === null) return
    const source = sourceOf(data)
    const provider = source && typeof source.provider === 'string' && source.provider !== '' ? source.provider : 'unknown'
    const model = source && typeof source.model === 'string' && source.model !== '' ? source.model : 'unknown'
    addUsage(provider, provider + '/' + model, time, usage, false)
  }
  function foldEvents(wsId, events, fromSeq) {
    for (const ev of events) {
      if (fromSeq !== undefined) {
        const s = typeof ev.seq === 'number' ? ev.seq : -1
        if (s <= fromSeq) continue
      }
      if (ev.type === 'assistant/message' || ev.type === 'turn/end') foldEvent(wsId, ev.time, ev.type, ev.data)
    }
  }
  function lastSeqOf(events) {
    let last = 0
    for (const ev of events) {
      const s = typeof ev.seq === 'number' ? ev.seq : -1
      if (s > last) last = s
    }
    return last
  }
  function enqueue(sid, task) {
    const prev = chains.get(sid) || Promise.resolve()
    const next = prev.then(() => task(), () => task())
    chains.set(sid, next)
    return next
  }
  function wsForLiveSession(session) {
    return null // 本插件不按工作区过滤，全量统计
  }
  async function processLiveEvent(sid, wsId, event) {
    const seq = typeof event.seq === 'number' ? event.seq : -1
    const last = sessionSeq.get(sid)
    if (last === undefined) {
      try {
        const snap = await ctx.sessionQuery.readSession(sid)
        if (snap && Array.isArray(snap.events)) {
          foldEvents(wsId, snap.events)
          sessionSeq.set(sid, lastSeqOf(snap.events))
          sessionCount.add(sid)
        }
      } catch (err) { /* retry on the next event */ }
      return
    }
    if (seq <= last) return
    if (seq > last + 1) {
      try {
        const snap = await ctx.sessionQuery.readSession(sid)
        if (snap && Array.isArray(snap.events)) {
          foldEvents(wsId, snap.events, last)
          sessionSeq.set(sid, lastSeqOf(snap.events))
        }
      } catch (err) { /* keep last; retry later */ }
      return
    }
    foldEvent(wsId, event.time, event.type, event.data)
    sessionSeq.set(sid, seq)
    sessionCount.add(sid)
  }

  // ---------- baseline scan over durable logs ----------
  async function runBaseline() {
    if (scan.started) return
    scan.started = true
    let records = []
    try {
      records = await ctx.sessionQuery.listSessions()
    } catch (err) {
      console.error('[usage-vendor-stats] session list failed:', err)
    }
    scan.total = Array.isArray(records) ? records.length : 0
    for (const record of records) {
      if (record === undefined || record === null || record.header === undefined) {
        scan.scanned += 1
        continue
      }
      const sid = record.header.id
      if (typeof sid !== 'string') {
        scan.scanned += 1
        continue
      }
      await enqueue(sid, async () => {
        try {
          if (sessionSeq.has(sid)) return
          const snap = await ctx.sessionQuery.readSession(sid)
          if (snap && Array.isArray(snap.events)) {
            foldEvents(null, snap.events)
            sessionSeq.set(sid, lastSeqOf(snap.events))
            sessionCount.add(sid)
          }
        } catch (err) {
          sessionSeq.set(sid, -1)
          scan.failed += 1
        } finally {
          scan.scanned += 1
        }
      })
      await ctx.timeout(0)
    }
    scan.done = true
  }

  // ---------- live feed ----------
  ctx.on('session/event', (session, event) => {
    if (event === undefined || event === null) return
    const type = event.type
    if (type !== 'turn/end' && type !== 'assistant/message') return
    const sid = session && session.id
    if (typeof sid !== 'string') return
    enqueue(sid, () => processLiveEvent(sid, null, event))
  })

  // ---------- vendor metadata (alias + type, durable KV) ----------
  async function loadVendorMeta() {
    if (storage === undefined) return
    try {
      const backend = storage.backend.get('json')
      if (backend === undefined || backend === null || backend.kv === undefined) return
      const unit = await backend.kv.open({ name: 'usage_vendor_stats_meta', version: 0, tables: [], hasGlobal: true })
      kvUnit = unit
      const snap = await unit.loadAll()
      const g = snap && snap.global
      if (g !== null && g !== undefined && typeof g === 'object') {
        for (const key of Object.keys(g)) {
          const value = g[key]
          if (value !== null && typeof value === 'object') vendorMeta[key] = value
        }
      }
    } catch (err) {
      console.error('[usage-vendor-stats] vendor meta storage unavailable:', err)
    }
  }
  function persistVendorMeta() {
    const snapshotMeta = {}
    for (const key of Object.keys(vendorMeta)) snapshotMeta[key] = Object.assign({}, vendorMeta[key])
    metaWriteChain = metaWriteChain.then(() => {
      if (kvUnit === null || kvUnit === undefined) return undefined
      return kvUnit.setGlobal(snapshotMeta).catch((err) => {
        console.error('[usage-vendor-stats] vendor meta persist failed:', err)
      })
    })
  }
  function setVendorMeta(vendorId, raw) {
    if (typeof vendorId !== 'string' || vendorId === '') return { ok: false, message: 'bad-vendor', meta: snapshotVendorMeta() }
    const prev = vendorMeta[vendorId] || {}
    const alias = typeof raw.alias === 'string' ? raw.alias.trim().slice(0, 80) : prev.alias
    const type = raw.type === 'subscription' || raw.type === 'api' ? raw.type : prev.type || 'unknown'
    if (alias === '' && (prev.alias === undefined || prev.alias === '')) {
      // 未设置别名则保留原样
    }
    vendorMeta[vendorId] = { alias, type }
    persistVendorMeta()
    return { ok: true, meta: snapshotVendorMeta() }
  }
  function snapshotVendorMeta() {
    const out = {}
    for (const key of Object.keys(vendorMeta)) out[key] = Object.assign({}, vendorMeta[key])
    return out
  }
  ctx.effect(() => () => {
    const unit = kvUnit
    kvUnit = null
    if (unit !== null && unit !== undefined) void unit.close().catch(() => {})
  })

  // ---------- snapshot for the client ----------
  function snapshot() {
    const cutoff = cutoffKey()
    const byDayArr = []
    for (const pair of byDay) {
      const date = pair[0]
      const day = pair[1]
      if (date < cutoff) continue
      byDayArr.push({
        date,
        turns: day.turns,
        calls: day.calls,
        tokens: Object.assign({}, day.tokens),
        byVendor: Array.from(day.byVendor, (p) => ({ vendorId: p[0], turns: p[1].turns, calls: p[1].calls, input: p[1].input, output: p[1].output, cacheRead: p[1].cacheRead, cacheWrite: p[1].cacheWrite, reasoning: p[1].reasoning })),
        byModel: Array.from(day.byModel, (p) => ({ modelKey: p[0], calls: p[1].calls, input: p[1].input, output: p[1].output, cacheRead: p[1].cacheRead, cacheWrite: p[1].cacheWrite, reasoning: p[1].reasoning })),
      })
    }
    byDayArr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    // 月份聚合（由 byDay 实时计算，覆盖全部历史而非仅热力窗口）
    const byMonthMap = new Map()
    for (const pair of byDay) {
      const date = pair[0]
      const day = pair[1]
      const mk = monthKey(date)
      let mo = byMonthMap.get(mk)
      if (mo === undefined) {
        mo = { month: mk, turns: 0, calls: 0, tokens: emptyTokens(), byVendor: new Map() }
        byMonthMap.set(mk, mo)
      }
      mo.turns += day.turns
      mo.calls += day.calls
      mo.tokens.input += day.tokens.input
      mo.tokens.output += day.tokens.output
      mo.tokens.cacheRead += day.tokens.cacheRead
      mo.tokens.cacheWrite += day.tokens.cacheWrite
      mo.tokens.reasoning += day.tokens.reasoning
      for (const p of day.byVendor) {
        const vid = p[0]
        const cur = mo.byVendor.get(vid)
        if (cur === undefined) {
          mo.byVendor.set(vid, { vendorId: vid, turns: p[1].turns, calls: p[1].calls, input: p[1].input, output: p[1].output, cacheRead: p[1].cacheRead, cacheWrite: p[1].cacheWrite, reasoning: p[1].reasoning })
        } else {
          cur.turns += p[1].turns
          cur.calls += p[1].calls
          cur.input += p[1].input
          cur.output += p[1].output
          cur.cacheRead += p[1].cacheRead
          cur.cacheWrite += p[1].cacheWrite
          cur.reasoning += p[1].reasoning
        }
      }
    }
    const byMonthArr = Array.from(byMonthMap, (p) => ({
      month: p[0],
      turns: p[1].turns,
      calls: p[1].calls,
      tokens: p[1].tokens,
      byVendor: Array.from(p[1].byVendor, (q) => ({ vendorId: q[0], turns: q[1].turns, calls: q[1].calls, input: q[1].input, output: q[1].output, cacheRead: q[1].cacheRead, cacheWrite: q[1].cacheWrite, reasoning: q[1].reasoning })),
    }))
    byMonthArr.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))

    const totals = { turns: turnTotal, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
    for (const pair of vendors) {
      const v = pair[1]
      totals.calls += v.calls
      totals.input += v.input
      totals.output += v.output
      totals.cacheRead += v.cacheRead
      totals.cacheWrite += v.cacheWrite
      totals.reasoning += v.reasoning
    }

    return {
      scan: { started: scan.started, done: scan.done, scanned: scan.scanned, total: scan.total, failed: scan.failed },
      generatedAt: Date.now(),
      meta: snapshotVendorMeta(),
      vendors: Array.from(vendors, (p) => {
        const v = p[1]
        const meta = vendorMeta[v.id]
        return {
          id: v.id,
          alias: meta && typeof meta.alias === 'string' && meta.alias !== '' ? meta.alias : v.id,
          type: meta && meta.type ? meta.type : 'unknown',
          turns: v.turns,
          calls: v.calls,
          input: v.input,
          output: v.output,
          cacheRead: v.cacheRead,
          cacheWrite: v.cacheWrite,
          reasoning: v.reasoning,
          modelCount: v.modelKeys.size,
        }
      }),
      models: Array.from(models, (p) => Object.assign({}, p[1], { modelKeys: undefined })),
      totals: Object.assign({ sessions: sessionCount.size }, totals),
      byDay: byDayArr,
      byMonth: byMonthArr,
    }
  }

  // ---------- HTTP data routes for the client half ----------
  if (webServer !== undefined) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/usage-vendor-stats',
      handler: (req, res) => {
        if (!scan.started) void runBaseline()
        sendJson(res, 200, snapshot())
      },
    }))
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/usage-vendor-stats/vendor',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const body = await readBody(req, 16 * 1024)
        let args = null
        try {
          args = JSON.parse(body)
        } catch (err) { /* invalid json */ }
        const result = args !== null && args !== undefined && typeof args.vendorId === 'string'
          ? setVendorMeta(args.vendorId, args)
          : { ok: false, message: 'bad-request', meta: snapshotVendorMeta() }
        sendJson(res, 200, result)
      },
    }))
  }

  // ---------- start the historical backfill immediately ----------
  void runBaseline()
  void loadVendorMeta()
}

export { name, inject, apply }
export default { name, inject, apply }
