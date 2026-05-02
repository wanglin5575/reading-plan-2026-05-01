"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AdminMemberRow, AdminOverviewPayload } from "@/lib/admin-overview";
import { LS_ADMIN_REGISTRY_ACK_AT } from "@/lib/admin-registry-badge";

type DailyPoint = {
  day: string;
  newUsers: number;
  totalTokens: number;
  costUsd: number;
};

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `$${n.toFixed(4)}`;
}

function formatTok(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("zh-CN") : "0";
}

export default function AdminDashboardClient() {
  const [tab, setTab] = useState<"overview" | "daily">("overview");
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [dailyErr, setDailyErr] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  /** 顶部计价说明默认折叠为一行 */
  const [pricingNoteOpen, setPricingNoteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_ADMIN_REGISTRY_ACK_AT, new Date().toISOString());
      window.dispatchEvent(new Event("admin-registry-ack"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOverviewErr(null);
      try {
        const r = await fetch("/api/admin/overview", { cache: "no-store" });
        const d = (await r.json()) as AdminOverviewPayload & { error?: string };
        if (!r.ok) throw new Error(d.error || "加载失败");
        if (!cancelled) setOverview(d);
      } catch (e) {
        if (!cancelled) setOverviewErr(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDaily = useCallback(async (days: number) => {
    setDailyErr(null);
    try {
      const r = await fetch(`/api/admin/daily?days=${days}`, { cache: "no-store" });
      const d = (await r.json()) as { series?: DailyPoint[]; error?: string };
      if (!r.ok) throw new Error(d.error || "加载失败");
      setDaily(d.series ?? []);
    } catch (e) {
      setDailyErr(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    if (tab !== "daily") return;
    void loadDaily(rangeDays);
  }, [tab, rangeDays, loadDaily]);

  const chartMetrics = useMemo(() => {
    if (!daily.length) return { maxU: 1, maxT: 1 };
    const maxU = Math.max(1, ...daily.map((x) => x.newUsers));
    const maxT = Math.max(1, ...daily.map((x) => x.totalTokens));
    return { maxU, maxT };
  }, [daily]);

  const chartW = Math.max(480, daily.length * 28);

  function onPointerDown(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = dragRef.current;
    const el = scrollRef.current;
    if (!st?.active || !el) return;
    const dx = e.clientX - st.startX;
    el.scrollLeft = st.scrollLeft - dx;
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragRef.current?.active) {
      dragRef.current = null;
      scrollRef.current?.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="admin-dash">
      <header className="admin-dash-head">
        <h1 className="admin-dash-title">管理后台</h1>
        <Link href="/weekly" className="admin-dash-back">
          返回用户端
        </Link>
      </header>

      <div className="admin-pricing-toolbar">
        <div
          className={
            pricingNoteOpen ? "admin-pricing-note-inner" : "admin-pricing-note-inner admin-pricing-note-inner--collapsed"
          }
        >
          <p className="admin-pricing-note muted-link">
            {overview?.pricing ? (
              <>
                列表与 KPI 金额为「输入 / 补全 tokens」按当前规则重算（与日志分项一致）。计价模式：
                {overview.pricing.mode === "blended" ? (
                  <>
                    {" "}
                    单一环境变量 <code className="admin-code-inline">AI_TOKEN_USD_PER_1K</code>
                    = {overview.pricing.blendedUsdPer1k?.toFixed(6) ?? "—"} 美元/千（合计 tokens）。
                  </>
                ) : (
                  <>
                    {" "}
                    <code className="admin-code-inline">AI_TOKEN_INPUT_USD_PER_1K</code>
                    ={overview.pricing.inputUsdPer1k.toFixed(6)} 美元/千、
                    <code className="admin-code-inline">AI_TOKEN_COMPLETION_USD_PER_1K</code>
                    ={overview.pricing.completionUsdPer1k.toFixed(6)} 美元/千（默认对应 WolfAI 图示：输入 $3/1M、补全 $15/1M）。
                  </>
                )}{" "}
                {overview.pricing.referenceNote}
                <a href="https://wolfai.top/pricing" target="_blank" rel="noopener noreferrer">
                  定价页
                </a>
                、
                <a href="https://wolfai.top/console" target="_blank" rel="noopener noreferrer">
                  控制台
                </a>
                。
              </>
            ) : (
              <>
                金额按输入/补全分列计价；默认输入 0.003、补全 0.015 美元/千 tokens（对应 WolfAI 图示 $3/$15 每百万）。详见{" "}
                <a href="https://wolfai.top/pricing" target="_blank" rel="noopener noreferrer">
                  wolfai.top/pricing
                </a>
                。
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="admin-pricing-toggle"
          onClick={() => setPricingNoteOpen((o) => !o)}
          aria-expanded={pricingNoteOpen}
        >
          {pricingNoteOpen ? "收起" : "展开"}
        </button>
      </div>

      <div className="admin-tabs" role="tablist">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          会员与用量
        </button>
        <button type="button" className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>
          按日趋势
        </button>
      </div>

      {tab === "overview" ? (
        <section className="admin-section">
          {overviewErr ? <p className="me-msg">{overviewErr}</p> : null}
          {overview ? (
            <>
              <div className="admin-kpi-row">
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">当前会员数量</span>
                  <span className="admin-kpi-value">{overview.memberCount.toLocaleString("zh-CN")}</span>
                </div>
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">AI Token 总消耗</span>
                  <span className="admin-kpi-value">{formatTok(overview.totalTokens)}</span>
                  <span className="admin-kpi-sub">估算金额 {formatUsd(overview.totalCostUsd)}</span>
                </div>
              </div>
              <p className="admin-hint muted-link">
                会员列表数据来源：
                {overview.authSource === "supabase_admin"
                  ? "Supabase Auth（已配置 SUPABASE_SERVICE_ROLE_KEY）。"
                  : "应用内登记（用户登录后首次调用接口时写入）；配置服务密钥后可拉取完整 Auth 用户。"}
              </p>
              {overview.members.length === 0 ? (
                <div className="admin-list-empty muted-link">
                  <p className="admin-list-empty-title">当前表格没有数据，通常是以下几类情况：</p>
                  <ul className="admin-list-empty-ul">
                    <li>
                      <strong>数据库未连上或未配置</strong>（接口检测：<code className="admin-code-inline">databaseConfigured</code>
                      ={overview.meta.databaseConfigured === false ? " false" : overview.meta.databaseConfigured === true ? " true" : " 未知"}
                      ）：请在线上环境配置 <code className="admin-code-inline">DATABASE_URL</code>（或 Postgres 同类变量），否则{" "}
                      <code className="admin-code-inline">app_user_registry</code>、用量表无法读写。
                    </li>
                    <li>
                      <strong>没有枚举到 Supabase 注册用户</strong>：未配置{" "}
                      <code className="admin-code-inline">SUPABASE_SERVICE_ROLE_KEY</code> 时无法列出 Auth 全量用户（当前{" "}
                      <code className="admin-code-inline">supabaseAuthCount</code>={overview.meta.supabaseAuthCount}）。请在 Vercel
                      添加<strong>服务端专用</strong>的 Service Role Key（勿泄露到前端）。
                    </li>
                    <li>
                      <strong>登记库尚无记录</strong>：<code className="admin-code-inline">app_user_registry</code> 在用户<strong>
                        登录后首次
                      </strong>
                      调用「添加文章 / 刷新文章 / 随览拉取」等需登录接口时写入（当前{" "}
                      <code className="admin-code-inline">registryCount</code>={overview.meta.registryCount}）。可让用户在本站任意操作一次触发写入。
                    </li>
                  </ul>
                </div>
              ) : null}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>邮箱</th>
                      <th className="admin-col-browse">订阅主题</th>
                      <th className="admin-col-browse">关键词</th>
                      <th>注册时间</th>
                      <th>输入 Token</th>
                      <th>补全 Token</th>
                      <th>合计</th>
                      <th>估算金额 (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.members.map((m: AdminMemberRow) => (
                      <tr key={m.userId}>
                        <td>{m.email}</td>
                        <td className="admin-table-td-clip" title={m.browseTopicTitles}>
                          {m.browseTopicTitles}
                        </td>
                        <td className="admin-table-td-clip" title={m.browseKeywords}>
                          {m.browseKeywords}
                        </td>
                        <td>{m.registeredAt ? new Date(m.registeredAt).toLocaleString("zh-CN") : "—"}</td>
                        <td>{formatTok(m.promptTokens)}</td>
                        <td>{formatTok(m.completionTokens)}</td>
                        <td>{formatTok(m.totalTokens)}</td>
                        <td>{formatUsd(m.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : !overviewErr ? (
            <p className="muted-link">加载中…</p>
          ) : null}
        </section>
      ) : (
        <section className="admin-section">
          <div className="admin-daily-toolbar">
            <label className="muted-link">
              区间（天）
              <select
                className="input admin-range-select"
                value={rangeDays}
                onChange={(e) => setRangeDays(parseInt(e.target.value, 10) || 30)}
              >
                <option value={7}>7</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
                <option value={180}>180</option>
              </select>
            </label>
            <span className="muted-link admin-chart-hint">在图表上按住拖拽可横向查看</span>
          </div>
          {dailyErr ? <p className="me-msg">{dailyErr}</p> : null}
          {daily.length === 0 && !dailyErr ? <p className="muted-link">暂无数据</p> : null}
          {daily.length > 0 ? (
            <div
              ref={scrollRef}
              className="admin-chart-scroll"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <svg
                className="admin-chart-svg"
                width={chartW}
                height={220}
                viewBox={`0 0 ${chartW} 220`}
                preserveAspectRatio="xMinYMid meet"
              >
                <defs>
                  <linearGradient id="adminGradTok" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent, #3b82f6)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--accent, #3b82f6)" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <text x={8} y={18} className="admin-chart-legend" fill="currentColor">
                  每日新增注册（左轴）
                </text>
                <text x={chartW - 180} y={18} className="admin-chart-legend" fill="currentColor">
                  每日 Token（右轴）
                </text>
                {daily.map((p, i) => {
                  const x = 40 + (i * (chartW - 80)) / Math.max(1, daily.length - 1);
                  const yU = 200 - (p.newUsers / chartMetrics.maxU) * 160;
                  const yT = 200 - (p.totalTokens / chartMetrics.maxT) * 160;
                  return (
                    <g key={p.day}>
                      <text x={x} y={212} textAnchor="middle" className="admin-chart-xlabel" fill="currentColor" fontSize="10">
                        {p.day.slice(5)}
                      </text>
                      <circle cx={x} cy={yU} r={3} fill="#22c55e" />
                      <circle cx={x} cy={yT} r={3} fill="#3b82f6" />
                    </g>
                  );
                })}
                <polyline
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2"
                  points={daily
                    .map((p, i) => {
                      const x = 40 + (i * (chartW - 80)) / Math.max(1, daily.length - 1);
                      const y = 200 - (p.newUsers / chartMetrics.maxU) * 160;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points={daily
                    .map((p, i) => {
                      const x = 40 + (i * (chartW - 80)) / Math.max(1, daily.length - 1);
                      const y = 200 - (p.totalTokens / chartMetrics.maxT) * 160;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
                <line x1={40} y1={200} x2={chartW - 40} y2={200} stroke="currentColor" strokeOpacity={0.2} />
              </svg>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
