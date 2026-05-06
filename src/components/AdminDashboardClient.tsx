"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { AdminOverviewPayload, AdminUsageRow } from "@/lib/admin-overview";
import {
  buildPreviewDailyForRange,
  buildPreviewDetailSeriesForRange,
  type AdminDashboardPreviewData,
} from "@/lib/admin-preview-demo";
import { LS_ADMIN_REGISTRY_ACK_AT } from "@/lib/admin-registry-badge";
import { formatTok, formatUsd } from "@/lib/admin-usage-format";
import { AdminDailyTrendChart } from "@/components/AdminDailyTrendChart";
import { MemberTokenUsageTable } from "@/components/MemberTokenUsageTable";
import { PasswordInputWithToggle } from "@/components/PasswordInputWithToggle";

type DailyPoint = {
  day: string;
  newUsers: number;
  totalTokens: number;
  costUsd: number;
};

type SliceRow = {
  day: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

type VipAccount = { id: string; username: string; enabled: boolean; createdAt: string };

export default function AdminDashboardClient({
  isAdmin,
  previewData,
  previewBannerLead = "演示模式",
  defaultTab = "overview",
  /** 仅展示某一模块并隐藏 Tab 栏（用于「模拟管理员」直达 VIP 预览） */
  singleTabPreview,
}: {
  isAdmin: boolean;
  /** 传入时不请求接口，用于 /admin-preview 等本地 UI 演示 */
  previewData?: AdminDashboardPreviewData | null;
  /** 预览卡片首行加粗文案，例如「模拟已登录（管理员）」 */
  previewBannerLead?: string;
  /** 初始选中的 Tab；`singleTabPreview` 为 vip 时强制为 vip */
  defaultTab?: "overview" | "daily" | "vip";
  singleTabPreview?: "vip";
}) {
  const [tab, setTab] = useState<"overview" | "daily" | "vip">(() =>
    singleTabPreview === "vip" ? "vip" : defaultTab,
  );
  const effectiveTab: "overview" | "daily" | "vip" = singleTabPreview === "vip" ? "vip" : tab;
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(() => previewData?.overview ?? null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>(() => previewData?.daily ?? []);
  const [dailyErr, setDailyErr] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [pricingNoteOpen, setPricingNoteOpen] = useState(false);
  const vipAddDialogRef = useRef<HTMLDialogElement>(null);
  const vipFormFieldId = useId();

  const [detailRow, setDetailRow] = useState<AdminUsageRow | null>(null);
  const [detailSeries, setDetailSeries] = useState<SliceRow[]>([]);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDays, setDetailDays] = useState(30);

  const [vipList, setVipList] = useState<VipAccount[]>(() => previewData?.vip ?? []);
  const [vipErr, setVipErr] = useState<string | null>(null);
  const [vipCreateErr, setVipCreateErr] = useState<string | null>(null);
  const [vipUser, setVipUser] = useState("");
  const [vipPass, setVipPass] = useState("");
  const [vipBusy, setVipBusy] = useState(false);

  const title = isAdmin ? "管理后台" : "Token消耗查看";

  /** 管理员：`?tab=overview|daily|vip` 直达对应 Tab（预览与真实 /admin 均可用）；单页 VIP 预览不处理 */
  useEffect(() => {
    if (singleTabPreview === "vip" || !isAdmin || typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab")?.trim().toLowerCase();
    if (t === "overview" || t === "daily" || t === "vip") setTab(t);
  }, [isAdmin, singleTabPreview]);

  useEffect(() => {
    if (previewData || !isAdmin || typeof window === "undefined") return;
    localStorage.setItem(LS_ADMIN_REGISTRY_ACK_AT, new Date().toISOString());
    window.dispatchEvent(new Event("admin-registry-ack"));
  }, [isAdmin, previewData]);

  useEffect(() => {
    if (previewData) return;
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
  }, [previewData]);

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

  const loadVip = useCallback(async () => {
    if (!isAdmin) return;
    setVipErr(null);
    try {
      const r = await fetch("/api/admin/vip-accounts", { cache: "no-store" });
      const d = (await r.json()) as { accounts?: VipAccount[]; error?: string };
      if (!r.ok) throw new Error(d.error || "加载失败");
      setVipList(d.accounts ?? []);
    } catch (e) {
      setVipErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (previewData) return;
    if (tab !== "daily") return;
    void loadDaily(rangeDays);
  }, [tab, rangeDays, loadDaily, previewData]);

  /** 预览模式：切换「按日趋势」区间时本地重算示意曲线，可交互且不调接口 */
  useEffect(() => {
    if (!previewData) return;
    setDaily(buildPreviewDailyForRange(rangeDays));
  }, [previewData, rangeDays]);

  useEffect(() => {
    if (previewData) return;
    if (tab !== "vip" || !isAdmin) return;
    void loadVip();
  }, [tab, isAdmin, loadVip, previewData]);

  useEffect(() => {
    if (!detailRow) return;
    if (previewData) {
      setDetailLoading(false);
      setDetailErr(null);
      setDetailSeries(buildPreviewDetailSeriesForRange(detailDays));
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailErr(null);
      const qs = new URLSearchParams({
        userId: detailRow.userId,
        days: String(detailDays),
      });
      try {
        const r = await fetch(`/api/admin/usage-daily?${qs.toString()}`, { cache: "no-store" });
        const d = (await r.json()) as { series?: SliceRow[]; error?: string };
        if (!r.ok) throw new Error(d.error || "加载失败");
        if (!cancelled) setDetailSeries(d.series ?? []);
      } catch (e) {
        if (!cancelled) setDetailErr(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailRow, detailDays, previewData]);

  const detailSeriesWithUsage = useMemo(
    () => detailSeries.filter((s) => s.totalTokens > 0),
    [detailSeries],
  );
  const detailSeriesNoUsage = useMemo(
    () => detailSeries.filter((s) => s.totalTokens === 0),
    [detailSeries],
  );

  const showRegSeries = isAdmin;

  function openRowDetail(row: AdminUsageRow) {
    setDetailRow(row);
  }

  function openVipAddDialog() {
    setVipCreateErr(null);
    vipAddDialogRef.current?.showModal();
  }

  function closeVipAddDialog() {
    vipAddDialogRef.current?.close();
  }

  async function onCreateVip(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (previewData) {
      const u = vipUser.trim();
      const p = vipPass;
      setVipCreateErr(null);
      if (u.length < 2) {
        setVipCreateErr("用户名至少 2 个字符");
        return;
      }
      if (p.length < 6) {
        setVipCreateErr("密码至少 6 位");
        return;
      }
      const taken = vipList.some((v) => v.username.toLowerCase() === u.toLowerCase());
      if (taken) {
        setVipCreateErr("演示：该用户名已存在");
        return;
      }
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `preview-${Date.now()}`;
      setVipList((list) => [...list, { id, username: u, enabled: true, createdAt: new Date().toISOString() }]);
      setVipUser("");
      setVipPass("");
      setVipCreateErr(null);
      closeVipAddDialog();
      return;
    }
    setVipBusy(true);
    setVipCreateErr(null);
    try {
      const r = await fetch("/api/admin/vip-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: vipUser, password: vipPass, enabled: true }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "创建失败");
      setVipUser("");
      setVipPass("");
      await loadVip();
      setVipCreateErr(null);
      closeVipAddDialog();
    } catch (err) {
      setVipCreateErr(err instanceof Error ? err.message : "创建失败");
    } finally {
      setVipBusy(false);
    }
  }

  async function patchVip(id: string, body: { password?: string; enabled?: boolean }) {
    if (previewData) {
      setVipErr(null);
      if (typeof body.password === "string" && body.password.length >= 6) {
        setVipErr("演示：密码已示意更新，刷新页面会恢复初始数据。");
      }
      if (typeof body.enabled === "boolean") {
        setVipList((list) => list.map((v) => (v.id === id ? { ...v, enabled: body.enabled! } : v)));
      }
      return;
    }
    setVipBusy(true);
    setVipErr(null);
    try {
      const r = await fetch(`/api/admin/vip-accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "更新失败");
      await loadVip();
    } catch (err) {
      setVipErr(err instanceof Error ? err.message : "更新失败");
    } finally {
      setVipBusy(false);
    }
  }

  async function removeVip(id: string) {
    if (previewData) {
      if (!confirm("确定删除该 VIP 账号？（演示：仅本页有效，刷新后恢复）")) return;
      setVipErr(null);
      setVipList((list) => list.filter((v) => v.id !== id));
      return;
    }
    if (!confirm("确定删除该 VIP 账号？")) return;
    setVipBusy(true);
    setVipErr(null);
    try {
      const r = await fetch(`/api/admin/vip-accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "删除失败");
      await loadVip();
    } catch (err) {
      setVipErr(err instanceof Error ? err.message : "删除失败");
    } finally {
      setVipBusy(false);
    }
  }

  return (
    <div className="admin-dash">
      {previewData ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="muted-link" style={{ margin: 0 }}>
            <strong>{previewBannerLead}</strong>
            ：本页可交互（切换趋势区间、表格行明细天数、VIP 列表增删改/启停等），数据仅在浏览器内示意、
            <strong>不落库</strong>；刷新会恢复初始演示数据。真实数据请{" "}
            <Link href="/admin">登录管理员账号后打开 /admin</Link>。
          </p>
        </div>
      ) : null}
      <header className="admin-dash-head">
        <h1 className="admin-dash-title">{title}</h1>
        <Link href="/weekly" className="admin-dash-back">
          返回用户端
        </Link>
      </header>

      {isAdmin ? (
        <div className="admin-pricing-toolbar">
          <div
            className={
              pricingNoteOpen ? "admin-pricing-note-inner" : "admin-pricing-note-inner admin-pricing-note-inner--collapsed"
            }
          >
            <p className="admin-pricing-note muted-link">
              {overview?.pricing ? (
                <>
                  列表与 KPI 金额为「输入 / 缓存输入（按输入同档单价）/ 补全 tokens」按当前规则重算（与日志分项一致）。计价模式：
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
                  金额按输入、缓存输入（与输入同价）、补全分列计价；默认输入 0.003、补全 0.015 美元/千 tokens（对应 WolfAI 图示 $3/$15 每百万）。详见{" "}
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
      ) : null}

      {singleTabPreview === "vip" ? (
        <p className="admin-single-preview-hint muted-link">
          当前为 <strong>模拟管理员</strong> 下的 VIP 账号管理预览（可交互、不落库）。
          <Link href="/logged-in-admin-preview">打开完整管理后台预览</Link>
        </p>
      ) : (
        <div className="admin-tabs" role="tablist">
          <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
            {isAdmin ? "会员与用量" : "我的用量"}
          </button>
          <button type="button" className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>
            {isAdmin ? "按日趋势" : "我的消耗趋势"}
          </button>
          {isAdmin ? (
            <button type="button" className={tab === "vip" ? "active" : ""} onClick={() => setTab("vip")}>
              VIP 账号管理
            </button>
          ) : null}
        </div>
      )}

      {effectiveTab === "overview" ? (
        <section className="admin-section">
          {overviewErr ? <p className="me-msg">{overviewErr}</p> : null}
          {overview ? (
            <>
              <div className="admin-kpi-row">
                {isAdmin ? (
                  <div className="admin-kpi-card">
                    <span className="admin-kpi-label">当前会员数量</span>
                    <span className="admin-kpi-value">{overview.memberCount.toLocaleString("zh-CN")}</span>
                  </div>
                ) : null}
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">{isAdmin ? "AI Token 总消耗" : "我的 AI Token 消耗"}</span>
                  <span className="admin-kpi-value">{formatTok(overview.totalTokens)}</span>
                  <span className="admin-kpi-sub">估算金额 {formatUsd(overview.totalCostUsd)}</span>
                </div>
              </div>
              {isAdmin ? (
                <p className="admin-hint muted-link">
                  会员列表数据来源：
                  {overview.authSource === "supabase_admin"
                    ? "Supabase Auth（已配置 SUPABASE_SERVICE_ROLE_KEY）。"
                    : "应用内登记（用户登录后首次调用接口时写入）；配置服务密钥后可拉取完整 Auth 用户。"}
                </p>
              ) : (
                <p className="admin-hint muted-link">以下按自然日汇总你的用量（与上方 KPI 一致）。</p>
              )}
              {overview.usageRows.length === 0 ? (
                <div className="admin-list-empty muted-link">
                  <p className="admin-list-empty-title">当前表格没有数据，通常是以下几类情况：</p>
                  <ul className="admin-list-empty-ul">
                    <li>
                      <strong>数据库未连上或未配置</strong>（接口检测：<code className="admin-code-inline">databaseConfigured</code>
                      ={overview.meta.databaseConfigured === false ? " false" : overview.meta.databaseConfigured === true ? " true" : " 未知"}
                      ）：请在线上环境配置 <code className="admin-code-inline">DATABASE_URL</code>（或 Postgres 同类变量），否则{" "}
                      <code className="admin-code-inline">app_user_registry</code>、用量表无法读写。
                    </li>
                    {isAdmin ? (
                      <>
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
                          <code className="admin-code-inline">registryCount</code>={overview.meta.registryCount}）。
                        </li>
                      </>
                    ) : (
                      <li>
                        <strong>尚无用量</strong>：在随览拉取、添加文章、书库侧 AI 等产生 tokens 后，会按日记入用量表。
                      </li>
                    )}
                  </ul>
                </div>
              ) : null}
              {overview.usageRows.length > 0 ? (
                <MemberTokenUsageTable
                  usageRows={overview.usageRows}
                  layout={isAdmin ? "admin-dashboard" : "modal-self-daily"}
                  interactive={isAdmin}
                  onRowClick={isAdmin ? openRowDetail : undefined}
                />
              ) : null}
            </>
          ) : !overviewErr ? (
            <p className="muted-link">加载中…</p>
          ) : null}
        </section>
      ) : effectiveTab === "daily" ? (
        <AdminDailyTrendChart
          daily={daily}
          showRegSeries={showRegSeries}
          rangeDays={rangeDays}
          onRangeDaysChange={setRangeDays}
          errorText={dailyErr}
        />
      ) : (
        <section className="admin-section">
          <h2 className="admin-vip-heading">VIP 账号管理（用户名 + 密码）</h2>
          <p className="admin-hint muted-link">
            VIP 登录依赖 httpOnly 会话签名：未单独配置{" "}
            <code className="admin-code-inline">READING_PLAN_VIP_SESSION_SECRET</code> 时，将使用{" "}
            <code className="admin-code-inline">SUPABASE_SERVICE_ROLE_KEY</code> 或数据库连接串自动派生密钥（与现有部署通常已具备的配置一致）。生产环境仍建议单独设置随机长字符串，便于轮换。
          </p>
          {vipErr ? <p className="me-msg">{vipErr}</p> : null}
          <div className="admin-vip-add-row">
            <button type="button" className="btn" onClick={openVipAddDialog}>
              新增用户
            </button>
          </div>
          <dialog
            ref={vipAddDialogRef}
            className="me-register-dialog"
            onClose={() => {
              setVipCreateErr(null);
              setVipUser("");
              setVipPass("");
            }}
          >
            <div className="me-register-dialog-inner">
              <div className="me-register-head">
                <h2 className="me-register-title">新增 VIP 用户</h2>
                <button
                  type="button"
                  className="me-register-close"
                  aria-label="关闭"
                  disabled={vipBusy && !previewData}
                  onClick={closeVipAddDialog}
                >
                  ×
                </button>
              </div>
              <form className="row me-login-form" onSubmit={(e) => void onCreateVip(e)}>
                <label className="muted-link" htmlFor={`${vipFormFieldId}-vip-add-user`}>
                  用户名
                </label>
                <input
                  id={`${vipFormFieldId}-vip-add-user`}
                  className="input"
                  value={vipUser}
                  onChange={(e) => setVipUser(e.target.value)}
                  autoComplete="off"
                  required
                  disabled={vipBusy && !previewData}
                />
                <label className="muted-link" htmlFor={`${vipFormFieldId}-vip-add-pw`}>
                  初始密码
                </label>
                <PasswordInputWithToggle
                  id={`${vipFormFieldId}-vip-add-pw`}
                  autoComplete="new-password"
                  value={vipPass}
                  onChange={setVipPass}
                  minLength={6}
                  required
                  disabled={vipBusy && !previewData}
                />
                {vipCreateErr ? <p className="me-msg me-msg--in-dialog">{vipCreateErr}</p> : null}
                <button className="btn" type="submit" disabled={vipBusy && !previewData}>
                  {vipBusy && !previewData ? "创建中…" : "创建"}
                </button>
              </form>
            </div>
          </dialog>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {vipList.map((v) => (
                  <tr key={v.id}>
                    <td>{v.username}</td>
                    <td>
                      <span className={`admin-vip-status ${v.enabled ? "is-on" : "is-off"}`}>
                        {v.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                    <td>{new Date(v.createdAt).toLocaleString("zh-CN")}</td>
                    <td>
                      <div className="admin-vip-actions">
                        <button
                          type="button"
                          className="btn secondary admin-vip-btn"
                          disabled={vipBusy}
                          onClick={() => void patchVip(v.id, { enabled: !v.enabled })}
                        >
                          {v.enabled ? "停用" : "启用"}
                        </button>
                        <button
                          type="button"
                          className="btn secondary admin-vip-btn"
                          disabled={vipBusy}
                          onClick={() => {
                            const pw = prompt("新密码（至少 6 位）");
                            if (pw && pw.length >= 6) void patchVip(v.id, { password: pw });
                          }}
                        >
                          重置密码
                        </button>
                        <button
                          type="button"
                          className="btn danger admin-vip-btn"
                          disabled={vipBusy}
                          onClick={() => void removeVip(v.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detailRow && typeof document !== "undefined"
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDetailRow(null);
              }}
            >
              <div
                className="modal-sheet admin-detail-sheet"
                role="dialog"
                aria-modal="true"
                onClick={(ev) => ev.stopPropagation()}
              >
                <div className="modal-sheet-header">
                  <h2 className="admin-detail-title">按日消耗 · {detailRow.email}</h2>
                  <button type="button" className="modal-sheet-close" aria-label="关闭" onClick={() => setDetailRow(null)}>
                    ×
                  </button>
                </div>
                <p className="muted-link admin-detail-sub">
                  区间
                  <select
                    className="input admin-range-select admin-detail-range"
                    value={detailDays}
                    onChange={(e) => setDetailDays(parseInt(e.target.value, 10) || 30)}
                  >
                    <option value={7}>7 天</option>
                    <option value={30}>30 天</option>
                    <option value={90}>90 天</option>
                  </select>
                </p>
                {detailLoading ? <p className="muted-link">加载中…</p> : null}
                {detailErr ? <p className="me-msg">{detailErr}</p> : null}
                {!detailLoading && !detailErr && detailSeries.length === 0 ? (
                  <p className="muted-link admin-detail-empty">所选区间暂无消耗记录。</p>
                ) : null}
                {!detailLoading && !detailErr && detailSeries.length > 0 ? (
                  <>
                    <p className="muted-link" style={{ margin: "0 0 8px", fontSize: "var(--fs-small)" }}>
                      默认展示<strong>有消耗</strong>的日期；列表按时间顺序，末行即区间内最近有数据的一天。
                    </p>
                    <div className="admin-detail-totals">
                      <span>
                        合计 Token <strong>{formatTok(detailSeries.reduce((s, x) => s + x.totalTokens, 0))}</strong>
                      </span>
                      <span>
                        估算 <strong>{formatUsd(detailSeries.reduce((s, x) => s + x.costUsd, 0))}</strong>
                      </span>
                    </div>
                    {detailSeriesWithUsage.length === 0 ? (
                      <p className="muted-link admin-detail-empty">所选区间内每日均无消耗。</p>
                    ) : (
                      <div className="admin-detail-table-wrap">
                        <table className="admin-table admin-detail-table">
                          <thead>
                            <tr>
                              <th>日期</th>
                              <th>输入</th>
                              <th>缓存输入</th>
                              <th>补全</th>
                              <th>合计</th>
                              <th>估算 USD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailSeriesWithUsage.map((s) => (
                              <tr key={s.day}>
                                <td>{s.day}</td>
                                <td>{formatTok(s.promptTokens)}</td>
                                <td>{formatTok(s.cachedPromptTokens)}</td>
                                <td>{formatTok(s.completionTokens)}</td>
                                <td>{formatTok(s.totalTokens)}</td>
                                <td>{formatUsd(s.costUsd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {detailSeriesNoUsage.length > 0 ? (
                      <details style={{ marginTop: 12 }}>
                        <summary className="muted-link" style={{ cursor: "pointer", userSelect: "none" }}>
                          无消耗的日期（{detailSeriesNoUsage.length} 天）· 默认折叠
                        </summary>
                        <div className="admin-detail-table-wrap" style={{ marginTop: 8 }}>
                          <table className="admin-table admin-detail-table">
                            <thead>
                              <tr>
                                <th>日期</th>
                                <th>输入</th>
                                <th>缓存输入</th>
                                <th>补全</th>
                                <th>合计</th>
                                <th>估算 USD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailSeriesNoUsage.map((s) => (
                                <tr key={s.day}>
                                  <td>{s.day}</td>
                                  <td>{formatTok(s.promptTokens)}</td>
                                  <td>{formatTok(s.cachedPromptTokens)}</td>
                                  <td>{formatTok(s.completionTokens)}</td>
                                  <td>{formatTok(s.totalTokens)}</td>
                                  <td>{formatUsd(s.costUsd)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
