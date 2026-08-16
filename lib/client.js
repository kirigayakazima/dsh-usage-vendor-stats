// dsh-usage-vendor-stats plugin - Client half (browser bundle)
// Client module factory format: window.__ModuleLoader__.load({ id, factory })
window.__ModuleLoader__.load({
  id: "dsh-usage-vendor-stats",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // ========== module-level shared state (entry button <-> fullscreen panel) ==========
    // Browser-side singleton: all slot components registered by apply share this scope
    let panelOpen = false
    const panelListeners = new Set()
    function setPanelOpen(v) {
      panelOpen = !!v
      for (const fn of panelListeners) try { fn(panelOpen) } catch (e) { /* ignore */ }
    }
    function usePanelOpen() {
      const [open, setOpen] = React.useState(panelOpen)
      React.useEffect(() => {
        panelListeners.add(setOpen)
        return () => { panelListeners.delete(setOpen) }
      }, [])
      return open
    }

    function pad2(n) {
      return String(n).padStart(2, '0')
    }
    function fmtDate(d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    }
    function trim1(v) {
      return String(Math.round(v * 10) / 10)
    }
    function fmtCompact(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
      if (n < 1000) return String(n)
      if (n < 1000000) return trim1(n / 1000) + 'k'
      if (n < 1000000000) return trim1(n / 1000000) + 'M'
      return trim1(n / 1000000000) + 'B'
    }
    function fmtMoney(n) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '—'
      return '¥' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    }
    function rateOf(input, cacheRead) {
      const denom = input + cacheRead
      if (denom <= 0) return 0
      return (cacheRead / denom) * 100
    }
    function humanDate(date) {
      const parts = date.split('-')
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
      return parts[0] + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + week
    }
    function monthLabel(month) {
      const parts = month.split('-')
      return Number(parts[0]) + '年' + Number(parts[1]) + '月'
    }
    // Heatmap intensity: graded by call count (default); can be filtered by vendor
    function levelOf(count) {
      if (count >= 16) return 4
      if (count >= 8) return 3
      if (count >= 4) return 2
      if (count >= 1) return 1
      return 0
    }
    const GH_GREEN = '#2ea043'
    const LEVEL_PCT = [20, 45, 70, 96]
    function cellBg(level) {
      if (level <= 0) return 'var(--dsw-alias-bg-layer-2)'
      return 'color-mix(in srgb, ' + GH_GREEN + ' ' + LEVEL_PCT[level - 1] + '%, var(--dsw-alias-bg-layer-2))'
    }
    function vendorColor(i) {
      return 'hsl(' + ((i * 137) % 360) + ', 70%, 55%)'
    }
    function typeLabel(type) {
      if (type === 'subscription') return '订阅'
      if (type === 'api') return '官方API'
      return '未分类'
    }
    function typeClass(type) {
      if (type === 'subscription') return 'uv-type-ss'
      if (type === 'api') return 'uv-type-api'
      return 'uv-type-unk'
    }
    // Token composition colors (for the ratio bar)
    const TOKEN_PARTS = [
      { key: 'input', label: '输入', color: '#2ea043' },
      { key: 'cacheRead', label: '缓存命中', color: '#0969da' },
      { key: 'output', label: '输出', color: '#bf3989' },
      { key: 'cacheWrite', label: '缓存写入', color: '#8250df' },
      { key: 'reasoning', label: '推理', color: '#d4a72c' },
    ]
    function tokenBar(tokens) {
      // tokens: {input, output, cacheRead, cacheWrite, reasoning}
      const parts = TOKEN_PARTS.map((p) => ({ key: p.key, label: p.label, color: p.color, value: tokens[p.key] || 0 }))
      const total = parts.reduce((s, p) => s + p.value, 0)
      return { parts, total }
    }
    // Range aggregation: today / 7d / 14d / 30d / 90d / all
    function rangeAgg(stats, range) {
      if (stats === null) return { totals: { turns: 0, calls: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }, byDay: [], hours: [] }
      if (range === 'all') return { totals: stats.totals, byDay: stats.byDay, hours: [] }
      const todayStr = fmtDate(new Date())
      let cutoff
      if (range === 'today') cutoff = todayStr
      else if (range === '7d') cutoff = fmtDate(new Date(Date.now() - 6 * 86400000))
      else if (range === '14d') cutoff = fmtDate(new Date(Date.now() - 13 * 86400000))
      else if (range === '30d') cutoff = fmtDate(new Date(Date.now() - 29 * 86400000))
      else cutoff = fmtDate(new Date(Date.now() - 89 * 86400000))
      const t = { turns: 0, calls: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
      const byDay = []
      for (const day of stats.byDay) {
        if (day.date < cutoff) continue
        t.turns += day.turns
        t.calls += day.calls
        t.input += day.tokens.input
        t.output += day.tokens.output
        t.cacheRead += day.tokens.cacheRead
        t.cacheWrite += day.tokens.cacheWrite
        t.reasoning += day.tokens.reasoning
        byDay.push(day)
      }
      if (stats.totals) t.sessions = stats.totals.sessions
      // Today hour data (for the "today by hour" trend)
      let hours = []
      if (range === 'today' && Array.isArray(stats.byHour)) {
        const prefix = todayStr + '|'
        const byH = new Map()
        for (const h of stats.byHour) {
          if (typeof h.key === 'string' && h.key.indexOf(prefix) === 0) {
            const hh = h.key.slice(prefix.length)
            byH.set(hh, { hour: hh, calls: h.calls, tokens: h.tokens })
          }
        }
        hours = Array.from(byH, (p) => p[1]).sort((a, b) => (a.hour < b.hour ? -1 : 1))
      }
      return { totals: t, byDay, hours }
    }
    // Count-up animation
    function useCountUp(target, timer) {
      const [state, setState] = React.useState({ value: 0, done: false })
      React.useEffect(() => {
        if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) {
          setState({ value: 0, done: false })
          return undefined
        }
        if (state.done) {
          setState({ value: target, done: true })
          return undefined
        }
        const start = Date.now()
        const duration = 700
        const stop = timer.interval(() => {
          const t = Math.min(1, (Date.now() - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          if (t >= 1) {
            stop()
            setState({ value: target, done: true })
          } else {
            setState({ value: Math.round(target * eased), done: false })
          }
        }, 32)
        return stop
      }, [target])
      return state.value
    }
    // CSV export
    function downloadCsv(filename, header, rows) {
      const esc = (v) => {
        const s = String(v === undefined || v === null ? '' : v)
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
      }
      const lines = [header.map(esc).join(',')].concat(rows.map((r) => r.map(esc).join(',')))
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }

    const CSS = `
.uv-page { display:flex; flex-direction:column; gap:14px; padding:2px 2px 28px; font-family:inherit; }
.uv-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.uv-title { margin:0; font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }
.uv-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.uv-range { display:inline-flex; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; overflow:hidden; }
.uv-range button { border:0; background:transparent; color:var(--dsw-alias-label-secondary); padding:4px 12px; font-size:12px; cursor:pointer; font-family:inherit; transition:background-color .15s ease, color .15s ease; }
.uv-range button + button { border-left:1px solid var(--dsw-alias-border-l2); }
.uv-range button.uv-on { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, var(--dsw-alias-bg-layer-2)); color:var(--dsw-alias-label-primary); font-weight:600; }
.uv-refresh { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); border-radius:8px; padding:4px 12px; font-size:12px; cursor:pointer; font-family:inherit; transition:border-color .15s ease, color .15s ease, transform .1s ease; }
.uv-refresh:hover { border-color:var(--dsw-alias-brand-primary); }
.uv-refresh:active, .uv-chip:active, .uv-range button:active { transform:scale(.96); }
.uv-panel { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:14px; }
.uv-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.uv-panel-title { margin:0; font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }
.uv-chips { display:flex; flex-wrap:wrap; gap:6px; }
.uv-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--dsw-alias-border-l2); background:transparent; color:var(--dsw-alias-label-primary); border-radius:999px; padding:2px 10px; font-size:11px; cursor:pointer; font-family:inherit; max-width:190px; transition:border-color .15s ease, background-color .15s ease, color .15s ease, transform .1s ease; }
.uv-chip .uv-chip-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.uv-chip.uv-on { border-color:var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.uv-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.uv-type-tag { font-size:10px; border-radius:4px; padding:1px 6px; flex:none; }
.uv-type-ss { background:color-mix(in srgb, #2ea043 18%, transparent); color:#2ea043; }
.uv-type-api { background:color-mix(in srgb, #0969da 18%, transparent); color:#0969da; }
.uv-type-unk { background:color-mix(in srgb, var(--dsw-alias-label-secondary) 18%, transparent); color:var(--dsw-alias-label-secondary); }
.uv-legend { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--dsw-alias-label-secondary); }
.uv-legend .uv-cell { width:10px; height:10px; border-radius:2px; animation:none; }
.uv-hm-wrap { position:relative; }
.uv-hm-scroll { overflow-x:auto; padding:0 2px 14px; scrollbar-width:thin; }
.uv-hm-scroll::-webkit-scrollbar { height:6px; }
.uv-hm-scroll::-webkit-scrollbar-thumb { background:var(--dsw-alias-border-l2); border-radius:3px; }
.uv-hm-scroll::-webkit-scrollbar-track { background:transparent; }
.uv-months { position:relative; height:18px; margin:0 0 4px 30px; width:686px; font-size:10px; color:var(--dsw-alias-label-secondary); }
.uv-months span { position:absolute; top:0; }
.uv-hm-body { display:flex; gap:6px; min-width:720px; }
.uv-wdays { display:flex; flex-direction:column; justify-content:flex-start; font-size:10px; color:var(--dsw-alias-label-secondary); text-align:right; width:24px; gap:3px; }
.uv-wdays span { height:10px; line-height:10px; }
.uv-grid { display:grid; grid-auto-flow:column; grid-template-rows:repeat(7,10px); gap:3px; }
.uv-cell { width:10px; height:10px; border-radius:2px; background:var(--dsw-alias-bg-layer-2); animation:uv-cell-in .45s ease both; transition:transform .12s ease, box-shadow .12s ease; }
.uv-cell:hover { transform:scale(1.35); box-shadow:0 1px 6px rgba(0,0,0,.28); position:relative; z-index:2; }
.uv-tip { position:fixed; z-index:1200; background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2); border-radius:10px; padding:10px 12px; box-shadow:0 8px 24px rgba(0,0,0,.18); pointer-events:auto; min-width:200px; max-width:300px; animation:uv-tip-in .16s ease both; }
.uv-tip-date { font-size:12px; font-weight:600; color:var(--dsw-alias-label-primary); margin-bottom:6px; }
.uv-tip-row { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-primary); padding:3px 6px; margin:0 -6px; border-radius:6px; cursor:pointer; transition:background-color .12s ease; }
.uv-tip-row:hover { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.uv-tip-row .uv-n { margin-left:auto; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-secondary); }
.uv-tip-tokens { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:6px; border-top:1px solid var(--dsw-alias-border-l1); padding-top:6px; }
.uv-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px; }
.uv-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:6px; min-height:86px; animation:uv-card-in .45s ease both; transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
.uv-card:hover { transform:translateY(-2px); border-color:var(--dsw-alias-border-l2); box-shadow:0 6px 18px rgba(0,0,0,.10); }
.uv-card-label { font-size:12px; color:var(--dsw-alias-label-secondary); }
.uv-card-value { font-size:20px; font-weight:650; color:var(--dsw-alias-label-primary); line-height:1.2; }
.uv-card-sub { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.55; }
/* Token composition ratio bar */
.uv-tokenbar { display:flex; height:8px; border-radius:4px; overflow:hidden; background:var(--dsw-alias-bg-layer-2); margin-top:2px; }
.uv-tokenbar i { display:block; height:100%; transition:width .4s ease; }
.uv-token-legend { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:10px; color:var(--dsw-alias-label-secondary); margin-top:6px; }
.uv-token-legend span { display:inline-flex; align-items:center; gap:4px; }
.uv-token-legend i { width:8px; height:8px; border-radius:2px; display:inline-block; }
.uv-tbl-scroll { overflow-x:auto; }
.uv-hrow, .uv-row { display:grid; grid-template-columns:minmax(140px,1.6fr) 74px .9fr .9fr .9fr .9fr .9fr 1fr .8fr; gap:8px; align-items:center; min-width:820px; padding:7px 10px; border-radius:8px; font-size:12px; }
.uv-hrow { color:var(--dsw-alias-label-secondary); font-size:11px; }
.uv-row { cursor:pointer; border:1px solid transparent; transition:background-color .15s ease, border-color .15s ease; }
.uv-row:hover { background:var(--dsw-alias-bg-layer-2); }
.uv-row.uv-sel { border-color:var(--dsw-alias-brand-primary); }
.uv-num { text-align:right; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-primary); }
.uv-hrow .uv-num { color:var(--dsw-alias-label-secondary); }
.uv-ws-title { color:var(--dsw-alias-label-primary); font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.uv-ws-path { color:var(--dsw-alias-label-secondary); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.uv-empty { color:var(--dsw-alias-label-secondary); font-size:12px; text-align:center; padding:26px 0; }
.uv-note { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.6; }
.uv-progress { font-size:12px; color:var(--dsw-alias-label-secondary); display:flex; align-items:center; gap:10px; }
.uv-bar { flex:1; height:6px; border-radius:3px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; max-width:340px; }
.uv-fill { height:100%; background:var(--dsw-alias-brand-primary); border-radius:3px; transition:width .3s ease; }
.uv-barwrap { height:5px; border-radius:3px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; margin-top:3px; }
.uv-barfill { height:100%; border-radius:3px; transform-origin:left center; animation:uv-bar-grow .7s cubic-bezier(.22,.61,.36,1) both; transition:width .5s cubic-bezier(.22,.61,.36,1); }
.uv-vendor-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.uv-vendor-type { display:inline-flex; gap:6px; }
.uv-vendor-type button { border:1px solid var(--dsw-alias-border-l2); background:transparent; color:var(--dsw-alias-label-secondary); border-radius:999px; padding:2px 10px; font-size:11px; cursor:pointer; font-family:inherit; transition:border-color .15s ease, color .15s ease; }
.uv-vendor-type button.uv-on { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-label-primary); font-weight:600; }
.uv-alias-ok { border:1px solid var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); color:var(--dsw-alias-label-primary); border-radius:6px; font-size:12px; padding:3px 12px; cursor:pointer; font-family:inherit; flex:none; transition:transform .1s ease; }
.uv-alias-ok:active { transform:scale(.96); }
.uv-vendor-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px; }
.uv-vendor-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.uv-vendor-top { display:flex; align-items:center; gap:8px; min-width:0; }
.uv-vendor-name { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.uv-vendor-kpis { display:grid; grid-template-columns:1fr 1fr; gap:4px 10px; font-size:11px; color:var(--dsw-alias-label-secondary); }
.uv-vendor-kpis b { color:var(--dsw-alias-label-primary); font-variant-numeric:tabular-nums; font-weight:550; }
.uv-vendor-alias { display:flex; align-items:center; gap:6px; }
.uv-vendor-alias input { flex:1; min-width:0; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); border-radius:6px; padding:3px 8px; font-size:12px; font-family:inherit; outline:none; transition:border-color .15s ease; }
.uv-vendor-alias input:focus { border-color:var(--dsw-alias-brand-primary); }
.uv-vendor-price { display:flex; align-items:center; gap:6px; }
.uv-vendor-price input { flex:1; min-width:0; width:70px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); border-radius:6px; padding:3px 8px; font-size:12px; font-family:inherit; outline:none; transition:border-color .15s ease; }
.uv-vendor-price input:focus { border-color:var(--dsw-alias-brand-primary); }
.uv-price-note { font-size:10px; color:var(--dsw-alias-label-secondary); line-height:1.5; }
.uv-cost-num { color:var(--dsw-alias-label-primary); font-variant-numeric:tabular-nums; font-weight:600; }
.uv-model-drill { grid-column:1 / -1; padding:8px 10px 4px; background:var(--dsw-alias-bg-layer-2); border-radius:8px; margin:0 0 2px; }
.uv-model-drill .uv-hrow, .uv-model-drill .uv-row { padding:6px 8px; }
/* outer: sidebar entry */
.uv-entry { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; cursor:pointer; color:var(--dsw-alias-label-primary); font-size:13px; user-select:none; transition:background-color .15s ease; border:1px solid transparent; }
.uv-entry:hover { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l1); }
.uv-entry .uv-entry-ic { font-size:15px; }
.uv-entry .uv-entry-tx { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.uv-entry .uv-entry-sub { font-size:10px; color:var(--dsw-alias-label-secondary); }
.uv-entry-rail { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; cursor:pointer; color:var(--dsw-alias-label-primary); font-size:16px; transition:background-color .15s ease; }
.uv-entry-rail:hover { background:var(--dsw-alias-bg-layer-2); }
/* outer: fullscreen panel */
.uv-overlay-mask { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; animation:uv-fade-in .18s ease both; }
.uv-overlay-panel { width:min(1200px, 94vw); height:min(860px, 92vh); background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l2); border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.3); display:flex; flex-direction:column; overflow:hidden; animation:uv-panel-pop .22s cubic-bezier(.22,.61,.36,1) both; }
.uv-overlay-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; border-bottom:1px solid var(--dsw-alias-border-l1); flex:none; }
.uv-overlay-title { margin:0; font-size:16px; font-weight:650; color:var(--dsw-alias-label-primary); }
.uv-overlay-actions { display:flex; align-items:center; gap:8px; }
.uv-overlay-close { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); border-radius:8px; padding:4px 12px; font-size:12px; cursor:pointer; font-family:inherit; transition:border-color .15s ease; }
.uv-overlay-close:hover { border-color:var(--dsw-alias-brand-primary); }
.uv-overlay-body { flex:1; overflow-y:auto; padding:16px 18px 24px; }
@keyframes uv-fade-in { from { opacity:0; } to { opacity:1; } }
@keyframes uv-panel-pop { from { opacity:0; transform:scale(.94) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
@keyframes uv-cell-in { from { opacity:0; transform:scale(.4); } to { opacity:1; transform:scale(1); } }
@keyframes uv-glow { 0% { box-shadow:0 0 0 0 rgba(46,160,67,.5); } 70% { box-shadow:0 0 0 5px rgba(46,160,67,0); } 100% { box-shadow:0 0 0 0 rgba(46,160,67,0); } }
@keyframes uv-card-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes uv-bar-grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
@keyframes uv-tip-in { from { opacity:0; } to { opacity:1; } }
@media (prefers-reduced-motion: reduce) {
  .uv-cell, .uv-card, .uv-barfill, .uv-tip, .uv-overlay-panel, .uv-overlay-mask { animation:none !important; }
  .uv-card, .uv-cell, .uv-barfill, .uv-refresh, .uv-chip, .uv-row, .uv-tip-row { transition:none !important; }
}
`
    const cssTagId = "dsh-usage-vendor-stats/styles.css"
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
      const tag = document.createElement("style")
      tag.dataset.plugin = "dsh-usage-vendor-stats"
      tag.dataset.pluginCss = cssTagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // Data interface to the Host half (webServer routes)
    const getStats = () => fetch('/api/usage-vendor-stats', { headers: { accept: 'application/json' } }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
    const setVendorMeta = (vendorId, patch) => fetch('/api/usage-vendor-stats/vendor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ vendorId }, patch)),
    }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })

    // Cost estimation: price = CNY per million tokens
    function vendorCost(v, meta) {
      const m = meta && meta[v.id]
      const price = m && typeof m.price === 'number' ? m.price : 0
      if (!price || price <= 0) return null
      const total = v.input + v.output + v.cacheRead + v.cacheWrite + v.reasoning
      return (total / 1000000) * price
    }

    // ========== Trend line chart (pure SVG, lightweight) ==========
    // data: [{ label, value }]; series: [{ key, color, label, values }]
    function TrendChart(props) {
      const { points, series, height, xLabels } = props
      const W = 760
      const H = height || 180
      const P = { l: 44, r: 12, t: 12, b: 24 }
      const iw = W - P.l - P.r
      const ih = H - P.t - P.b
      const n = points.length
      if (n === 0) {
        return React.createElement('div', { className: 'uv-empty' }, '该时间范围暂无趋势数据')
      }
      const x = (i) => P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
      const allMax = series.reduce((m, s) => Math.max(m, ...s.values), 1)
      const y = (v) => P.t + ih - (v / allMax) * ih
      const gridLines = [0, 1, 2, 3].map((i) => {
        const gy = P.t + (i * ih) / 3
        return React.createElement('line', { key: 'g' + i, x1: P.l, y1: gy, x2: W - P.r, y2: gy, stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1 })
      })
      const seriesEls = series.map((s) => {
        const path = s.values.map((v, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
        const dots = s.values.map((v, i) => React.createElement('circle', { key: 'd' + i, cx: x(i), cy: y(v), r: 2.5, fill: s.color }))
        return React.createElement('g', { key: s.key },
          React.createElement('path', { d: path, fill: 'none', stroke: s.color, strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
          dots,
        )
      })
      const labelEls = xLabels.map((t, i) => React.createElement('text', {
        key: 't' + i,
        x: x(i),
        y: H - 6,
        textAnchor: 'middle',
        fontSize: 10,
        fill: 'var(--dsw-alias-label-secondary)',
      }, t))
      return React.createElement('svg', { viewBox: '0 0 ' + W + ' ' + H, style: { width: '100%', height: 'auto', maxHeight: height + 'px' } },
        gridLines,
        seriesEls,
        labelEls,
      )
    }

    // ========== Core dashboard component (shared by fullscreen panel & settings page) ==========
    function Dashboard(props) {
      const timer = props.timerCtx
      const [stats, setStats] = React.useState(null)
      const [range, setRange] = React.useState('7d')
      const [vendorFilter, setVendorFilter] = React.useState(null)
      const [hover, setHover] = React.useState(null)
      const [aliasDrafts, setAliasDrafts] = React.useState({})
      const [priceDrafts, setPriceDrafts] = React.useState({})
      const [manageCollapsed, setManageCollapsed] = React.useState(true)

      React.useEffect(() => {
        let alive = true
        let scanDone = false
        const refreshStats = () => {
          getStats().then((data) => {
            if (!alive) return
            if (data && data.scan) scanDone = !!data.scan.done
            setStats(data)
          }, () => {})
        }
        refreshStats()
        const fast = timer.interval(() => { if (!scanDone) refreshStats() }, 3000)
        const slow = timer.interval(() => { if (scanDone) refreshStats() }, 20000)
        return () => { alive = false; fast(); slow() }
      }, [])

      const onRefresh = () => {
        getStats().then((d) => { if (d) setStats(d) }, () => {})
      }
      const toggleFilter = (id) => {
        setVendorFilter((prev) => (prev === id ? null : id))
      }
      // Vendor model drilldown state (hooks must be declared at the top of the component)
      const [expandedVendor, setExpandedVendor] = React.useState(null)

      const agg = rangeAgg(stats, range)
      const totalTokens = agg.totals.input + agg.totals.output + agg.totals.cacheRead + agg.totals.cacheWrite + agg.totals.reasoning
      const animatedTotal = useCountUp(totalTokens, timer)
      const animatedRate = useCountUp(Math.round(rateOf(agg.totals.input, agg.totals.cacheRead) * 10), timer)
      const animatedCalls = useCountUp(agg.totals.calls, timer)

      if (stats === null) {
        return React.createElement('div', { className: 'uv-page' },
          React.createElement('div', { className: 'uv-panel' }, React.createElement('div', { className: 'uv-empty' }, '正在加载用量统计…')),
        )
      }

      const scan = stats.scan || { done: true, started: true, scanned: 0, total: 0, failed: 0 }
      const vendors = Array.isArray(stats.vendors) ? stats.vendors : []
      const meta = stats.meta && typeof stats.meta === 'object' ? stats.meta : {}
      const vendorIndex = new Map()
      vendors.forEach((v, i) => { vendorIndex.set(v.id, i) })
      const vendorAlias = (id) => {
        const m = meta[id]
        return m && typeof m.alias === 'string' && m.alias !== '' ? m.alias : id
      }
      const dayMap = new Map()
      for (const d of stats.byDay) dayMap.set(d.date, d)

      const saveAlias = (vendorId, value) => {
        const patch = { alias: String(value === undefined ? '' : value).trim() }
        setVendorMeta(vendorId, patch).then((res) => {
          if (res && res.ok && res.meta) {
            setStats((prev) => (prev === null ? prev : Object.assign({}, prev, { meta: res.meta })))
          }
        }, () => {})
      }
      const saveType = (vendorId, type) => {
        setVendorMeta(vendorId, { type }).then((res) => {
          if (res && res.ok && res.meta) {
            setStats((prev) => (prev === null ? prev : Object.assign({}, prev, { meta: res.meta })))
          }
        }, () => {})
      }
      const savePrice = (vendorId, value) => {
        const n = parseFloat(String(value))
        if (!Number.isFinite(n) || n < 0) return
        setVendorMeta(vendorId, { price: n }).then((res) => {
          if (res && res.ok && res.meta) {
            setStats((prev) => (prev === null ? prev : Object.assign({}, prev, { meta: res.meta })))
          }
        }, () => {})
      }

      const cacheRate = rateOf(agg.totals.input, agg.totals.cacheRead)
      const today = new Date()
      const todayKey = fmtDate(today)
      const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
      const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 52 * 7)
      const cells = []
      for (let i = 0; i < 53 * 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
        cells.push({ date: fmtDate(d), month: d.getMonth(), year: d.getFullYear() })
      }
      const monthLabels = []
      for (let j = 0; j < 53; j++) {
        const first = cells[j * 7]
        const prev = j > 0 ? cells[(j - 1) * 7] : null
        if (prev === null || first.month !== prev.month) {
          monthLabels.push({ left: j * 13, text: first.month === 0 ? first.year + '年1月' : (first.month + 1) + '月' })
        }
      }
      const weekdayLabels = ['', '周一', '', '周三', '', '周五', '']

      const dayCallsOf = (day) => {
        if (day === undefined) return 0
        if (vendorFilter === null) return day.calls
        const v = day.byVendor.find((x) => x.vendorId === vendorFilter)
        return v !== undefined ? v.calls : 0
      }
      const onEnter = (cell, ev) => {
        setHover({ date: cell.date, x: ev.clientX, y: ev.clientY, day: dayMap.get(cell.date) })
      }
      const onMove = (cell, ev) => {
        setHover((prev) => (prev !== null && prev.date === cell.date ? { date: prev.date, x: ev.clientX, y: ev.clientY, day: prev.day } : prev))
      }
      const onLeave = () => setHover(null)

      const cellElements = cells.map((cell, i) => {
        const day = dayMap.get(cell.date)
        const count = dayCallsOf(day)
        const level = levelOf(count)
        const dim = vendorFilter !== null && day !== undefined && day.calls > 0 && count === 0
        const isToday = cell.date === todayKey
        const style = {
          background: cellBg(level),
          opacity: dim ? 0.22 : 1,
          animationDelay: (i * 1.2) + 'ms',
        }
        if (isToday) style.animation = 'uv-cell-in .45s ease both, uv-glow 3s ease-in-out .7s infinite'
        return React.createElement('div', {
          key: cell.date,
          className: 'uv-cell',
          style,
          onMouseEnter: (ev) => onEnter(cell, ev),
          onMouseMove: (ev) => onMove(cell, ev),
          onMouseLeave: onLeave,
        })
      })

      const card = (label, value, sub, delay, extra) => React.createElement('div', { className: 'uv-card', style: { animationDelay: (delay * 70) + 'ms' } },
        React.createElement('div', { className: 'uv-card-label' }, label),
        React.createElement('div', { className: 'uv-card-value' }, value),
        React.createElement('div', { className: 'uv-card-sub' }, sub),
        extra || null,
      )

      // Token composition ratio bar
      const tb = tokenBar(agg.totals)
      const tokenBarEl = totalTokens > 0
        ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'uv-tokenbar' },
              tb.parts.filter((p) => p.value > 0).map((p) => React.createElement('i', {
                key: p.key,
                style: { width: (p.value / tb.total) * 100 + '%', background: p.color },
              })),
            ),
            React.createElement('div', { className: 'uv-token-legend' },
              tb.parts.filter((p) => p.value > 0).map((p) => React.createElement('span', { key: p.key },
                React.createElement('i', { style: { background: p.color } }),
                p.label + ' ' + fmtCompact(p.value),
              )),
            ),
          )
        : null

      // Vendor KPI table (sorted by total tokens desc)
      const vTotal = (v) => v.input + v.output + v.cacheRead + v.cacheWrite + v.reasoning
      const vendorRows = vendors.slice().sort((a, b) => vTotal(b) - vTotal(a))
      const maxVTotal = vendorRows.length > 0 ? vTotal(vendorRows[0]) : 0
      const vendorRowEls = vendorRows.map((v) => {
        const total = vTotal(v)
        const idx = vendorIndex.get(v.id)
        const color = vendorColor(idx === undefined ? 0 : idx)
        const selected = vendorFilter === v.id
        const m = meta[v.id]
        const type = m && m.type ? m.type : v.type || 'unknown'
        const cost = vendorCost(v, meta)
        const expanded = expandedVendor === v.id
        let row = React.createElement('div', {
          key: v.id,
          className: 'uv-row' + (selected ? ' uv-sel' : ''),
          onClick: () => {
            // Click: toggle model drilldown; if expanded, collapse while keeping the vendor filter
            setExpandedVendor((prev) => (prev === v.id ? null : v.id))
          },
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
            React.createElement('span', { className: 'uv-dot', style: { background: color } }),
            React.createElement('span', { className: 'uv-ws-title', style: { flex: 1 } }, vendorAlias(v.id)),
            React.createElement('span', { className: 'uv-type-tag ' + typeClass(type) }, typeLabel(type)),
            React.createElement('span', { className: 'uv-num', style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, expanded ? '▲' : '▼'),
          ),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(v.calls)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(v.input)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(v.cacheRead)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(v.output)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(v.reasoning)),
          React.createElement('div', {},
            React.createElement('div', { className: 'uv-num' }, fmtCompact(total)),
            React.createElement('div', { className: 'uv-barwrap' },
              React.createElement('div', { className: 'uv-barfill', style: { width: maxVTotal > 0 ? Math.max(2, (total / maxVTotal) * 100) + '%' : '0%', background: color } }),
            ),
          ),
          React.createElement('div', { className: 'uv-num' }, rateOf(v.input, v.cacheRead).toFixed(1) + '%'),
          React.createElement('div', { className: 'uv-num' }, cost !== null ? React.createElement('span', { className: 'uv-cost-num' }, fmtMoney(cost)) : '—'),
        )
        // Expand the vendor model details
        if (expanded) {
          const vModels = (Array.isArray(stats.models) ? stats.models : [])
            .filter((md) => md && md.provider === v.id)
            .sort((a, b) => ((b.calls || 0) - (a.calls || 0)))
          row = React.createElement(React.Fragment, { key: v.id },
            row,
            React.createElement('div', { className: 'uv-model-drill' },
              vModels.length === 0
                ? React.createElement('div', { className: 'uv-empty', style: { padding: '10px 0' } }, '该厂商暂无模型明细')
                : React.createElement('div', { className: 'uv-tbl-scroll' },
                  React.createElement('div', { className: 'uv-hrow', style: { gridTemplateColumns: '1.6fr .9fr .9fr .9fr .9fr .9fr 1fr', minWidth: 560 } },
                    React.createElement('div', {}, '模型'),
                    React.createElement('div', { className: 'uv-num' }, '调用'),
                    React.createElement('div', { className: 'uv-num' }, '输入'),
                    React.createElement('div', { className: 'uv-num' }, '缓存命中'),
                    React.createElement('div', { className: 'uv-num' }, '输出'),
                    React.createElement('div', { className: 'uv-num' }, '推理'),
                    React.createElement('div', { className: 'uv-num' }, '合计'),
                  ),
                  vModels.map((md) => React.createElement('div', { key: md.key, className: 'uv-row', style: { gridTemplateColumns: '1.6fr .9fr .9fr .9fr .9fr .9fr 1fr', minWidth: 560, cursor: 'default' } },
                    React.createElement('div', { className: 'uv-ws-title' }, md.model),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact(md.calls || 0)),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact(md.input || 0)),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact(md.cacheRead || 0)),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact(md.output || 0)),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact(md.reasoning || 0)),
                    React.createElement('div', { className: 'uv-num' }, fmtCompact((md.input || 0) + (md.output || 0) + (md.cacheRead || 0) + (md.cacheWrite || 0) + (md.reasoning || 0))),
                  )),
                ),
            ),
          )
        }
        return row
      })

      // Daily detail (last 30 days, descending)
      const dayRows = agg.byDay.slice().reverse().slice(0, 30).map((day) => {
        const filteredTokens = vendorFilter === null ? day.tokens : (() => {
          const v = day.byVendor.find((x) => x.vendorId === vendorFilter)
          if (v === undefined) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
          return { input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite, reasoning: v.reasoning }
        })()
        const calls = vendorFilter === null ? day.calls : (() => {
          const v = day.byVendor.find((x) => x.vendorId === vendorFilter)
          return v !== undefined ? v.calls : 0
        })()
        const total = filteredTokens.input + filteredTokens.output + filteredTokens.cacheRead + filteredTokens.cacheWrite + filteredTokens.reasoning
        return React.createElement('div', { key: day.date, className: 'uv-row' },
          React.createElement('div', {}, humanDate(day.date)),
          React.createElement('div', { className: 'uv-num' }, calls),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.input)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.cacheRead)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.output)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.reasoning)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(total)),
          React.createElement('div', { className: 'uv-num' }, rateOf(filteredTokens.input, filteredTokens.cacheRead).toFixed(1) + '%'),
          React.createElement('div', { className: 'uv-num' }, day.turns),
        )
      })

      // Monthly summary (all history, descending)
      const monthRows = (Array.isArray(stats.byMonth) ? stats.byMonth : []).slice().reverse().map((mo) => {
        const filteredTokens = vendorFilter === null ? mo.tokens : (() => {
          const v = mo.byVendor.find((x) => x.vendorId === vendorFilter)
          if (v === undefined) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
          return { input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite, reasoning: v.reasoning }
        })()
        const calls = vendorFilter === null ? mo.calls : (() => {
          const v = mo.byVendor.find((x) => x.vendorId === vendorFilter)
          return v !== undefined ? v.calls : 0
        })()
        const total = filteredTokens.input + filteredTokens.output + filteredTokens.cacheRead + filteredTokens.cacheWrite + filteredTokens.reasoning
        return React.createElement('div', { key: mo.month, className: 'uv-row' },
          React.createElement('div', {}, monthLabel(mo.month)),
          React.createElement('div', { className: 'uv-num' }, calls),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.input)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.cacheRead)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.output)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(filteredTokens.reasoning)),
          React.createElement('div', { className: 'uv-num' }, fmtCompact(total)),
          React.createElement('div', { className: 'uv-num' }, rateOf(filteredTokens.input, filteredTokens.cacheRead).toFixed(1) + '%'),
          React.createElement('div', { className: 'uv-num' }, mo.turns),
        )
      })

      // Vendor management (collapsible): alias + type + unit price
      const manageCards = vendorRows.map((v, i) => {
        const m = meta[v.id]
        const type = m && m.type ? m.type : v.type || 'unknown'
        const color = vendorColor(vendorIndex.get(v.id) === undefined ? 0 : vendorIndex.get(v.id))
        return React.createElement('div', { key: v.id, className: 'uv-vendor-card' },
          React.createElement('div', { className: 'uv-vendor-top' },
            React.createElement('span', { className: 'uv-dot', style: { background: color } }),
            React.createElement('span', { className: 'uv-vendor-name' }, v.id),
            React.createElement('span', { className: 'uv-type-tag ' + typeClass(type) }, typeLabel(type)),
          ),
          React.createElement('div', { className: 'uv-vendor-kpis' },
            React.createElement('span', {}, '调用 ', React.createElement('b', {}, fmtCompact(v.calls))),
            React.createElement('span', {}, 'Token ', React.createElement('b', {}, fmtCompact(vTotal(v)))),
            React.createElement('span', {}, '缓存命中率 ', React.createElement('b', {}, rateOf(v.input, v.cacheRead).toFixed(1) + '%')),
            React.createElement('span', {}, '模型数 ', React.createElement('b', {}, v.modelCount)),
          ),
          React.createElement('div', { className: 'uv-vendor-alias' },
            React.createElement('input', {
              value: aliasDrafts[v.id] !== undefined ? aliasDrafts[v.id] : (m && m.alias ? m.alias : ''),
              placeholder: '别名（可选）',
              onChange: (e) => setAliasDrafts((prev) => Object.assign({}, prev, { [v.id]: e.target.value })),
              onKeyDown: (e) => { if (e.key === 'Enter') saveAlias(v.id, e.target.value) },
            }),
            React.createElement('button', { className: 'uv-alias-ok', onClick: () => saveAlias(v.id, aliasDrafts[v.id]) }, '保存'),
          ),
          React.createElement('div', { className: 'uv-vendor-type' },
            React.createElement('button', { className: type === 'subscription' ? 'uv-on' : '', onClick: () => saveType(v.id, 'subscription') }, '订阅'),
            React.createElement('button', { className: type === 'api' ? 'uv-on' : '', onClick: () => saveType(v.id, 'api') }, '官方API'),
            React.createElement('button', { className: type === 'unknown' ? 'uv-on' : '', onClick: () => saveType(v.id, 'unknown') }, '未分类'),
          ),
          React.createElement('div', { className: 'uv-vendor-price' },
            React.createElement('input', {
              type: 'number',
              min: '0',
              step: '0.01',
              value: priceDrafts[v.id] !== undefined ? priceDrafts[v.id] : (m && typeof m.price === 'number' ? m.price : ''),
              placeholder: '每百万token单价(¥)',
              onChange: (e) => setPriceDrafts((prev) => Object.assign({}, prev, { [v.id]: e.target.value })),
              onKeyDown: (e) => { if (e.key === 'Enter') savePrice(v.id, priceDrafts[v.id]) },
            }),
            React.createElement('button', { className: 'uv-alias-ok', onClick: () => savePrice(v.id, priceDrafts[v.id]) }, '存'),
          ),
          React.createElement('div', { className: 'uv-price-note' }, '设置单价后,厂商表「费用」列会按总 token 折算预估费用(元)。'),
        )
      })

      // CSV export
      const exportDaysCsv = () => {
        downloadCsv('usage-daily.csv',
          ['日期', '调用', '输入', '缓存命中', '输出', '推理', '合计', '命中率%', '回合'],
          agg.byDay.slice().reverse().map((day) => {
            const ft = vendorFilter === null ? day.tokens : (day.byVendor.find((x) => x.vendorId === vendorFilter) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
            const calls = vendorFilter === null ? day.calls : (day.byVendor.find((x) => x.vendorId === vendorFilter) || {}).calls || 0
            const total = ft.input + ft.output + ft.cacheRead + ft.cacheWrite + ft.reasoning
            return [day.date, calls, ft.input, ft.cacheRead, ft.output, ft.reasoning, total, rateOf(ft.input, ft.cacheRead).toFixed(1), day.turns]
          }))
      }
      const exportMonthsCsv = () => {
        downloadCsv('usage-monthly.csv',
          ['月份', '调用', '输入', '缓存命中', '输出', '推理', '合计', '命中率%', '回合'],
          (Array.isArray(stats.byMonth) ? stats.byMonth : []).slice().reverse().map((mo) => {
            const ft = vendorFilter === null ? mo.tokens : (mo.byVendor.find((x) => x.vendorId === vendorFilter) || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
            const calls = vendorFilter === null ? mo.calls : (mo.byVendor.find((x) => x.vendorId === vendorFilter) || {}).calls || 0
            const total = ft.input + ft.output + ft.cacheRead + ft.cacheWrite + ft.reasoning
            return [mo.month, calls, ft.input, ft.cacheRead, ft.output, ft.reasoning, total, rateOf(ft.input, ft.cacheRead).toFixed(1), mo.turns]
          }))
      }
      const exportVendorsCsv = () => {
        downloadCsv('usage-vendors.csv',
          ['厂商', '类型', '调用', '输入', '缓存命中', '输出', '推理', '合计', '命中率%', '模型数', '费用(¥)'],
          vendorRows.map((v) => {
            const m = meta[v.id]
            const type = m && m.type ? m.type : v.type || 'unknown'
            const cost = vendorCost(v, meta)
            return [v.id, typeLabel(type), v.calls, v.input, v.cacheRead, v.output, v.reasoning, vTotal(v), rateOf(v.input, v.cacheRead).toFixed(1), v.modelCount, cost !== null ? cost.toFixed(4) : '']
          }))
      }

      let tip = null
      if (hover !== null && hover !== undefined) {
        const day = hover.day
        let rowsContent = []
        let tokensText = ''
        if (day !== undefined) {
          const filtered = vendorFilter === null ? day.byVendor : day.byVendor.filter((x) => x.vendorId === vendorFilter)
          const sorted = filtered.slice().sort((a, b) => (b.input + b.output + b.cacheRead) - (a.input + a.output + a.cacheRead))
          rowsContent = sorted.map((entry) => {
            const idx = vendorIndex.get(entry.vendorId)
            return React.createElement('div', {
              key: entry.vendorId,
              className: 'uv-tip-row',
              onClick: () => { toggleFilter(entry.vendorId); setHover(null) },
            },
              React.createElement('span', { className: 'uv-dot', style: { background: vendorColor(idx === undefined ? 0 : idx) } }),
              React.createElement('span', {}, vendorAlias(entry.vendorId)),
              React.createElement('span', { className: 'uv-n' }, entry.calls + ' 次'),
            )
          })
          const t = day.tokens
          if (t.input + t.output + t.cacheRead > 0) {
            tokensText = 'Token：输入 ' + fmtCompact(t.input) + ' · 缓存命中 ' + fmtCompact(t.cacheRead) + ' · 输出 ' + fmtCompact(t.output) + (t.reasoning > 0 ? ' · 推理 ' + fmtCompact(t.reasoning) : '')
          }
        }
        const flip = hover.x > 640
        tip = React.createElement('div', {
          key: hover.date,
          className: 'uv-tip',
          style: {
            left: hover.x + 14,
            top: hover.y + 12,
            transform: flip ? 'translateX(calc(-100% - 28px))' : 'none',
          },
        },
          React.createElement('div', { className: 'uv-tip-date' }, humanDate(hover.date)),
          day !== undefined && day.calls > 0
            ? rowsContent
            : React.createElement('div', { className: 'uv-empty', style: { padding: '6px 0' } }, '这一天没有使用记录'),
          tokensText !== '' ? React.createElement('div', { className: 'uv-tip-tokens' }, tokensText) : null,
        )
      }

      const rangeLabel = range === 'today' ? '今天' : range === '7d' ? '近 7 天' : range === '14d' ? '近 14 天' : range === '30d' ? '近 30 天' : range === '90d' ? '近 90 天' : '全部'
      const scanning = !scan.done
      const pct = scan.total > 0 ? Math.min(100, Math.round((scan.scanned / scan.total) * 100)) : 40
      const isEmpty = scan.done && stats.byDay.length === 0 && stats.totals.calls === 0

      // Trend data: by day (or by hour for today)
      let trendLabels = []
      let trendSeries = []
      if (range === 'today') {
        trendLabels = agg.hours.map((h) => h.hour + ':00')
        const tokenByH = agg.hours.map((h) => h.tokens.input + h.tokens.output + h.tokens.cacheRead + h.tokens.cacheWrite + h.tokens.reasoning)
        const callsByH = agg.hours.map((h) => h.calls)
        trendSeries = [
          { key: 'tokens', color: '#2563eb', label: 'Token', values: tokenByH },
          { key: 'calls', color: '#10b981', label: '调用', values: callsByH },
        ]
      } else if (agg.byDay.length > 0) {
        trendLabels = agg.byDay.map((d) => d.date.slice(5))
        trendSeries = [
          { key: 'tokens', color: '#2563eb', label: 'Token', values: agg.byDay.map((d) => d.tokens.input + d.tokens.output + d.tokens.cacheRead + d.tokens.cacheWrite + d.tokens.reasoning) },
          { key: 'calls', color: '#10b981', label: '调用', values: agg.byDay.map((d) => d.calls) },
        ]
      }
      const trendChartEl = React.createElement('div', { className: 'uv-panel' },
        React.createElement('div', { className: 'uv-panel-head' },
          React.createElement('h3', { className: 'uv-panel-title' }, 'Token / 调用趋势（' + rangeLabel + '）'),
          React.createElement('div', { className: 'uv-legend' },
            trendSeries.map((s) => React.createElement('span', { key: s.key, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
              React.createElement('span', { className: 'uv-dot', style: { background: s.color } }),
              s.label,
            )),
          ),
        ),
        React.createElement(TrendChart, {
          points: trendLabels,
          series: trendSeries,
          xLabels: range === 'today'
            ? trendLabels.filter((_, i) => i % 3 === 0)
            : trendLabels.filter((_, i) => i === 0 || i === Math.floor((trendLabels.length - 1) / 2) || i === trendLabels.length - 1),
          height: 180,
        }),
      )

      // Vendor model drilldown: list models of a vendor when expanded
      return React.createElement('div', { className: 'uv-page' },
        React.createElement('div', { className: 'uv-head' },
          React.createElement('h2', { className: 'uv-title' }, 'API 用量统计'),
          React.createElement('div', { className: 'uv-actions' },
            React.createElement('div', { className: 'uv-range' },
              ['today', '7d', '14d', '30d', '90d', 'all'].map((r) => React.createElement('button', {
                key: r,
                className: range === r ? 'uv-on' : '',
                onClick: () => setRange(r),
              }, r === 'today' ? '今天' : r === '7d' ? '7 天' : r === '14d' ? '14 天' : r === '30d' ? '近 30 天' : r === '90d' ? '近 90 天' : '全部')),
            ),
            React.createElement('button', { className: 'uv-refresh', onClick: onRefresh }, '刷新'),
          ),
        ),
        scanning ? React.createElement('div', { className: 'uv-progress' },
          React.createElement('span', {}, '正在统计历史会话 ' + scan.scanned + ' / ' + scan.total + (scan.failed > 0 ? '（' + scan.failed + ' 个读取失败）' : '')),
          React.createElement('div', { className: 'uv-bar' }, React.createElement('div', { className: 'uv-fill', style: { width: pct + '%' } })),
        ) : null,
        isEmpty ? React.createElement('div', { className: 'uv-panel' },
          React.createElement('div', { className: 'uv-empty' }, '还没有使用记录。开始对话后，这里会点亮。'),
        ) : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'uv-cards' },
            card('总花费 Token', fmtCompact(animatedTotal), '输入 ' + fmtCompact(agg.totals.input) + ' · 命中 ' + fmtCompact(agg.totals.cacheRead) + ' · 输出 ' + fmtCompact(agg.totals.output) + ' · 推理 ' + fmtCompact(agg.totals.reasoning), 0, tokenBarEl),
            card('缓存命中率', (animatedRate / 10).toFixed(1) + '%', '命中 ' + fmtCompact(agg.totals.cacheRead) + ' / 未命中输入 ' + fmtCompact(agg.totals.input), 1),
            card('模型调用次数', fmtCompact(animatedCalls), rangeLabel + '内 assistant 调用', 2),
            card('回合数', fmtCompact(agg.totals.turns), rangeLabel + '内的回合', 3),
            card('会话数', fmtCompact(agg.totals.sessions), '统计到的会话总数', 4),
            card('厂商数量', fmtCompact(vendors.length), '自动发现 ' + vendors.filter((v) => (meta[v.id] ? meta[v.id].type === 'api' : v.type === 'api')).length + ' 官方API · ' + vendors.filter((v) => (meta[v.id] ? meta[v.id].type === 'subscription' : v.type === 'subscription')).length + ' 订阅', 5),
          ),
          trendChartEl,
          React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, '厂商日历热力图'),
              React.createElement('div', { className: 'uv-chips' },
                React.createElement('button', { className: 'uv-chip' + (vendorFilter === null ? ' uv-on' : ''), onClick: () => setVendorFilter(null) },
                  React.createElement('span', { className: 'uv-chip-title' }, '全部'),
                ),
                vendors.map((v, i) => {
                  const on = vendorFilter === v.id
                  return React.createElement('button', {
                    key: v.id,
                    className: 'uv-chip' + (on ? ' uv-on' : ''),
                    onClick: () => toggleFilter(v.id),
                  },
                    React.createElement('span', { className: 'uv-dot', style: { background: vendorColor(i) } }),
                    React.createElement('span', { className: 'uv-chip-title' }, vendorAlias(v.id)),
                  )
                }),
              ),
            ),
            React.createElement('div', { className: 'uv-hm-wrap' },
              React.createElement('div', { className: 'uv-months' }, monthLabels.map((m, i) => React.createElement('span', { key: i, style: { left: m.left } }, m.text))),
              React.createElement('div', { className: 'uv-hm-scroll' },
                React.createElement('div', { className: 'uv-hm-body' },
                  React.createElement('div', { className: 'uv-wdays' }, weekdayLabels.map((w, i) => React.createElement('span', { key: i }, w))),
                  React.createElement('div', { className: 'uv-grid' }, cellElements),
                ),
              ),
            ),
            React.createElement('div', { className: 'uv-note', style: { marginTop: 10 } },
              '口径：颜色深浅按当日模型调用次数（点击厂商筛选后仅统计该厂商）。悬停查看按厂商明细与 Token 明细。',
            ),
          ),
          React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, '厂商 KPI 明细（' + rangeLabel + '）'),
              React.createElement('div', { className: 'uv-actions' },
                React.createElement('button', { className: 'uv-refresh', onClick: exportVendorsCsv, title: '导出 CSV' }, '导出'),
              ),
            ),
            vendorRows.length === 0
              ? React.createElement('div', { className: 'uv-empty' }, '该时间范围内没有使用记录')
              : React.createElement('div', { className: 'uv-tbl-scroll' },
                React.createElement('div', { className: 'uv-hrow' },
                  React.createElement('div', {}, '厂商'),
                  React.createElement('div', { className: 'uv-num' }, '调用'),
                  React.createElement('div', { className: 'uv-num' }, '输入'),
                  React.createElement('div', { className: 'uv-num' }, '缓存命中'),
                  React.createElement('div', { className: 'uv-num' }, '输出'),
                  React.createElement('div', { className: 'uv-num' }, '推理'),
                  React.createElement('div', { className: 'uv-num' }, '合计'),
                  React.createElement('div', { className: 'uv-num' }, '命中率'),
                  React.createElement('div', { className: 'uv-num' }, '费用(¥)'),
                ),
                vendorRowEls,
              ),
          ),
          React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, '厂商管理（别名 / 类型 / 单价）'),
              React.createElement('button', { className: 'uv-refresh', onClick: () => setManageCollapsed(!manageCollapsed) },
                manageCollapsed ? '展开' : '收起',
              ),
            ),
            manageCollapsed
              ? React.createElement('div', { className: 'uv-empty', style: { padding: '12px 0' } }, '已折叠。点「展开」编辑各厂商的别名、订阅/官方API 类型与 token 单价。')
              : React.createElement('div', { className: 'uv-vendor-grid' }, manageCards),
          ),
          React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, '每日明细（近 30 天）'),
              React.createElement('button', { className: 'uv-refresh', onClick: exportDaysCsv, title: '导出 CSV' }, '导出'),
            ),
            dayRows.length === 0
              ? React.createElement('div', { className: 'uv-empty' }, '该时间范围内没有使用记录')
              : React.createElement('div', { className: 'uv-tbl-scroll' },
                React.createElement('div', { className: 'uv-hrow' },
                  React.createElement('div', {}, '日期'),
                  React.createElement('div', { className: 'uv-num' }, '调用'),
                  React.createElement('div', { className: 'uv-num' }, '输入'),
                  React.createElement('div', { className: 'uv-num' }, '缓存命中'),
                  React.createElement('div', { className: 'uv-num' }, '输出'),
                  React.createElement('div', { className: 'uv-num' }, '推理'),
                  React.createElement('div', { className: 'uv-num' }, '合计'),
                  React.createElement('div', { className: 'uv-num' }, '命中率'),
                  React.createElement('div', { className: 'uv-num' }, '回合'),
                ),
                dayRows,
              ),
          ),
          React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, '每月汇总（全部历史）'),
              React.createElement('button', { className: 'uv-refresh', onClick: exportMonthsCsv, title: '导出 CSV' }, '导出'),
            ),
            monthRows.length === 0
              ? React.createElement('div', { className: 'uv-empty' }, '暂无月度数据')
              : React.createElement('div', { className: 'uv-tbl-scroll' },
                React.createElement('div', { className: 'uv-hrow' },
                  React.createElement('div', {}, '月份'),
                  React.createElement('div', { className: 'uv-num' }, '调用'),
                  React.createElement('div', { className: 'uv-num' }, '输入'),
                  React.createElement('div', { className: 'uv-num' }, '缓存命中'),
                  React.createElement('div', { className: 'uv-num' }, '输出'),
                  React.createElement('div', { className: 'uv-num' }, '推理'),
                  React.createElement('div', { className: 'uv-num' }, '合计'),
                  React.createElement('div', { className: 'uv-num' }, '命中率'),
                  React.createElement('div', { className: 'uv-num' }, '回合'),
                ),
                monthRows,
              ),
          ),
        ),
        tip,
      )
    }

    // ========== Sidebar entry button ==========
    function SidebarEntry(props) {
      const open = usePanelOpen()
      const wide = props.wide
      if (!wide) {
        return React.createElement('div', {
          className: 'uv-entry-rail',
          title: 'API 用量统计',
          onClick: () => setPanelOpen(!open),
        }, '📊')
      }
      return React.createElement('div', {
        className: 'uv-entry',
        onClick: () => setPanelOpen(!open),
      },
        React.createElement('span', { className: 'uv-entry-ic' }, '📊'),
        React.createElement('span', { className: 'uv-entry-tx' }, '用量统计'),
        React.createElement('span', { className: 'uv-entry-sub' }, open ? '收起' : '展开'),
      )
    }

    // ========== Fullscreen analysis panel (shell.overlay) ==========
    function OverlayPanel(props) {
      const timer = props.timerCtx
      const open = usePanelOpen()
      if (!open) return null
      return React.createElement('div', {
        className: 'uv-overlay-mask',
        onClick: () => setPanelOpen(false),
      },
        React.createElement('div', {
          className: 'uv-overlay-panel',
          onClick: (e) => e.stopPropagation(),
        },
          React.createElement('div', { className: 'uv-overlay-head' },
            React.createElement('h2', { className: 'uv-overlay-title' }, '📊 API 用量统计'),
            React.createElement('div', { className: 'uv-overlay-actions' },
              React.createElement('button', { className: 'uv-overlay-close', onClick: () => setPanelOpen(false) }, '关闭'),
            ),
          ),
          React.createElement('div', { className: 'uv-overlay-body' },
            React.createElement(Dashboard, { timerCtx: timer }),
          ),
        ),
      )
    }

    // ========== React error boundary (prevents white-screen lockup on render errors) ==========
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, message: '' }
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, message: String(error && error.message ? error.message : error) }
      }
      componentDidCatch(error, info) {
        console.error('[usage-vendor-stats] render error:', error, info)
      }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', { className: 'uv-panel' },
            React.createElement('div', { className: 'uv-panel-head' },
              React.createElement('h3', { className: 'uv-panel-title' }, 'Usage Stats render error'),
            ),
            React.createElement('div', { className: 'uv-empty' }, 'Something went wrong while rendering the dashboard.'),
            React.createElement('div', { style: { textAlign: 'center', marginTop: 8 } },
              React.createElement('button', {
                className: 'uv-refresh',
                onClick: () => this.setState({ hasError: false, message: '' }),
              }, 'Retry'),
            ),
          )
        }
        return this.props.children
      }
    }

    // ========== Registration ==========
    exports.inject = ['timer']
    exports.apply = (ctx) => {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      // Settings page (kept as an alternate entry)
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'usage-vendor-stats', order: 31, label: () => 'API Usage Stats' },
        () => React.createElement(ErrorBoundary, null, React.createElement(Dashboard, { timerCtx: ctx })),
      ))
      // Sidebar footer entry (beside Settings)
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'usage-vendor-stats-entry', order: 10, label: () => 'Usage Stats' },
        (props) => React.createElement(SidebarEntry, { wide: props && props.wide, timerCtx: ctx }),
      ))
      // Fullscreen analysis panel
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'usage-vendor-stats-panel', order: 10, label: () => 'Usage Stats Panel' },
        () => React.createElement(ErrorBoundary, null, React.createElement(OverlayPanel, { timerCtx: ctx })),
      ))
    }
    return module.exports;
  }
});
