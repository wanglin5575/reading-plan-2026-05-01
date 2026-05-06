"use client";

import type { AdminUsageRow } from "@/lib/admin-overview";
import { formatTok, formatUsd, usageRowKey } from "@/lib/admin-usage-format";

function regCell(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return "—";
  }
}

export type MemberTokenUsageTableLayout = "admin-dashboard" | "modal-self-daily" | "modal-admin-all";

export function MemberTokenUsageTable({
  usageRows,
  layout,
  onRowClick = () => {},
  interactive = true,
}: {
  usageRows: AdminUsageRow[];
  layout: MemberTokenUsageTableLayout;
  onRowClick?: (row: AdminUsageRow) => void;
  /** 为 false 时行不可点选（例如仅展示的弹窗表格） */
  interactive?: boolean;
}) {
  const rowProps = (m: AdminUsageRow) =>
    interactive
      ? ({
          className: "admin-table-row-click",
          role: "button" as const,
          tabIndex: 0,
          onClick: () => onRowClick(m),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(m);
            }
          },
        } as const)
      : ({} as const);

  if (layout === "admin-dashboard") {
    return (
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>账号</th>
              <th>注册时间</th>
              <th>输入 Token</th>
              <th>缓存输入 Token</th>
              <th>补全 Token</th>
              <th>合计</th>
              <th>估算金额 (USD)</th>
            </tr>
          </thead>
          <tbody>
            {usageRows.map((m) => (
              <tr key={usageRowKey(m)} {...rowProps(m)}>
                <td>{m.email}</td>
                <td>{regCell(m.registeredAt)}</td>
                <td>{formatTok(m.promptTokens)}</td>
                <td>{formatTok(m.cachedPromptTokens)}</td>
                <td>{formatTok(m.completionTokens)}</td>
                <td>{formatTok(m.totalTokens)}</td>
                <td>{formatUsd(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (layout === "modal-self-daily") {
    return (
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>输入 Token</th>
              <th>缓存输入 Token</th>
              <th>补全 Token</th>
              <th>合计</th>
              <th>估算金额 (USD)</th>
            </tr>
          </thead>
          <tbody>
            {usageRows.map((m) => (
              <tr key={usageRowKey(m)} {...rowProps(m)}>
                <td>{m.usageDay || "—"}</td>
                <td>{formatTok(m.promptTokens)}</td>
                <td>{formatTok(m.cachedPromptTokens)}</td>
                <td>{formatTok(m.completionTokens)}</td>
                <td>{formatTok(m.totalTokens)}</td>
                <td>{formatUsd(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* modal-admin-all */
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>账号</th>
            <th>日期</th>
            <th>输入 Token</th>
            <th>缓存输入 Token</th>
            <th>补全 Token</th>
            <th>合计</th>
            <th>估算金额 (USD)</th>
          </tr>
        </thead>
        <tbody>
          {usageRows.map((m) => (
            <tr key={usageRowKey(m)} {...rowProps(m)}>
              <td>{m.email}</td>
              <td>{m.usageDay ? m.usageDay : "汇总"}</td>
              <td>{formatTok(m.promptTokens)}</td>
              <td>{formatTok(m.cachedPromptTokens)}</td>
              <td>{formatTok(m.completionTokens)}</td>
              <td>{formatTok(m.totalTokens)}</td>
              <td>{formatUsd(m.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
