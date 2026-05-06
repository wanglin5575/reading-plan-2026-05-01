"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTok, formatUsd } from "@/lib/admin-usage-format";

export type AdminDailyChartPoint = {
  day: string;
  newUsers: number;
  totalTokens: number;
  costUsd: number;
};

type Props = {
  daily: AdminDailyChartPoint[];
  showRegSeries: boolean;
  rangeDays: number;
  onRangeDaysChange: (n: number) => void;
  rangeOptions?: number[];
  errorText?: string | null;
};

/** 折线图仅连接「有 Token 消耗」的日期；无消耗日期在下方 details 中默认折叠 */
export function AdminDailyTrendChart({
  daily,
  showRegSeries,
  rangeDays,
  onRangeDaysChange,
  rangeOptions = [7, 30, 90, 180],
  errorText,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number } | null>(null);
  const [showTokenLine, setShowTokenLine] = useState(true);
  const [showGreenLine, setShowGreenLine] = useState(true);

  const tokenActive = useMemo(() => daily.filter((d) => d.totalTokens > 0), [daily]);

  const idleDays = useMemo(() => daily.filter((d) => d.totalTokens === 0), [daily]);

  const chartMetrics = useMemo(() => {
    const maxT = Math.max(1, ...tokenActive.map((x) => x.totalTokens));
    const maxU = showRegSeries ? Math.max(1, ...tokenActive.map((x) => x.newUsers), 1) : 1;
    return { maxT, maxU };
  }, [tokenActive, showRegSeries]);

  const chartW = Math.max(400, tokenActive.length * 42 + 88);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    });
  }, [tokenActive.length, chartW, daily.length, rangeDays]);

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

  const xAt = (i: number) => {
    const n = tokenActive.length;
    if (n <= 1) return chartW / 2;
    return 44 + (i * (chartW - 88)) / (n - 1);
  };

  const yToken = (t: number) => 210 - (t / chartMetrics.maxT) * 168;
  const yReg = (u: number) => 210 - (u / chartMetrics.maxU) * 168;

  const lastActive = tokenActive.length ? tokenActive[tokenActive.length - 1]! : null;

  return (
    <section className="admin-section">
      <div className="admin-daily-toolbar">
        <label className="muted-link">
          区间（天）
          <select
            className="input admin-range-select"
            value={rangeDays}
            onChange={(e) => onRangeDaysChange(parseInt(e.target.value, 10) || 30)}
          >
            {rangeOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <span className="muted-link admin-chart-hint">图表默认定位到最近有消耗的日期；可横向拖拽查看</span>
      </div>
      {errorText ? <p className="me-msg">{errorText}</p> : null}
      {daily.length === 0 && !errorText ? <p className="muted-link">暂无数据</p> : null}
      {lastActive ? (
        <p className="muted-link" style={{ margin: "0 0 10px", fontSize: "var(--fs-small)" }}>
          最新有消耗：<strong>{lastActive.day}</strong> · Token {formatTok(lastActive.totalTokens)} · 估算{" "}
          {formatUsd(lastActive.costUsd)}
        </p>
      ) : null}
      {tokenActive.length > 0 ? (
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
            height={278}
            viewBox={`0 0 ${chartW} 278`}
            preserveAspectRatio="xMinYMid meet"
          >
            {showRegSeries && showGreenLine ? (
              <text x={8} y={16} className="admin-chart-legend" fill="currentColor" fontSize="11">
                每日新增注册（左轴）
              </text>
            ) : null}
            {showTokenLine ? (
              <text x={Math.max(8, chartW - 220)} y={16} className="admin-chart-legend" fill="currentColor" fontSize="11">
                每日 Token（右轴）· 点位标注估算金额 (USD)
              </text>
            ) : null}
            {tokenActive.map((p, i) => {
              const x = xAt(i);
              const yT = yToken(p.totalTokens);
              const yU = yReg(p.newUsers);
              const labelY = yT < 52 ? yT + 22 : yT - 10;
              const greenLabelY = yU < 52 ? yU + 22 : yU - 10;
              return (
                <g key={p.day}>
                  <text x={x} y={268} textAnchor="middle" className="admin-chart-xlabel" fill="currentColor" fontSize="10">
                    {p.day.slice(5)}
                  </text>
                  {showRegSeries && showGreenLine ? <circle cx={x} cy={yU} r={3} fill="#22c55e" /> : null}
                  {showTokenLine ? <circle cx={x} cy={yT} r={4} fill="#3b82f6" /> : null}
                  {showTokenLine ? (
                    <text
                      x={x}
                      y={labelY}
                      textAnchor="middle"
                      className="admin-chart-usd-label"
                      fill="currentColor"
                      fontSize="10"
                      fontWeight={600}
                    >
                      {p.costUsd > 0 ? formatUsd(p.costUsd) : "—"}
                    </text>
                  ) : null}
                  {showRegSeries && showGreenLine ? (
                    <text
                      x={x}
                      y={greenLabelY}
                      textAnchor="middle"
                      className="admin-chart-usd-label"
                      fill="#22c55e"
                      fontSize="10"
                      fontWeight={600}
                    >
                      {p.newUsers}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {showRegSeries && showGreenLine ? (
              <polyline
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                points={tokenActive
                  .map((p, i) => {
                    const x = xAt(i);
                    const y = yReg(p.newUsers);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            ) : null}
            {showTokenLine ? (
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={tokenActive
                  .map((p, i) => {
                    const x = xAt(i);
                    const y = yToken(p.totalTokens);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            ) : null}
            <line x1={44} y1={210} x2={chartW - 44} y2={210} stroke="currentColor" strokeOpacity={0.2} />
          </svg>
        </div>
      ) : daily.length > 0 && !errorText ? (
        <p className="muted-link">所选区间内暂无 Token 消耗（可展开下方日期列表查看无消耗日）。</p>
      ) : null}
      <div className="muted-link" style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn secondary"
          style={{ padding: "4px 10px", fontSize: "var(--fs-small)" }}
          onClick={() => setShowTokenLine((v) => !v)}
        >
          {showTokenLine ? "隐藏" : "显示"}蓝线（每日 Token）
        </button>
        {showRegSeries ? (
          <button
            type="button"
            className="btn secondary"
            style={{ padding: "4px 10px", fontSize: "var(--fs-small)" }}
            onClick={() => setShowGreenLine((v) => !v)}
          >
            {showGreenLine ? "隐藏" : "显示"}绿线（每日新增注册）
          </button>
        ) : null}
      </div>

      {idleDays.length > 0 ? (
        <details className="admin-daily-idle-details" style={{ marginTop: 14 }}>
          <summary className="muted-link" style={{ cursor: "pointer", userSelect: "none" }}>
            无 Token 消耗的日期（{idleDays.length} 天）· 默认折叠
          </summary>
          <ul
            className="muted-link"
            style={{ fontSize: "var(--fs-small)", margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.6 }}
          >
            {idleDays.map((d) => (
              <li key={d.day}>
                {d.day}
                {showRegSeries && d.newUsers > 0 ? ` · 当日新增注册 ${d.newUsers}（无 AI Token 消耗）` : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
