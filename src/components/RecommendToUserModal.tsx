"use client";

import { useEffect, useState } from "react";

export type FollowPickRow = { followedId: string; label: string; nickname: string; emailHint: string };

export function RecommendToUserModal({
  open,
  articleTitle,
  busy,
  error,
  follows,
  onClose,
  onPick,
}: {
  open: boolean;
  articleTitle: string;
  busy: boolean;
  error: string | null;
  follows: FollowPickRow[];
  onClose: () => void;
  onPick: (followedId: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="rec-pick-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet-header">
          <h2 id="rec-pick-title">推荐 TA 读</h2>
          <button type="button" className="modal-sheet-close" onClick={() => !busy && onClose()} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="muted-link" style={{ margin: "0 0 10px", fontSize: "var(--fs-small)" }}>
          {articleTitle}
        </p>
        <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
          仅可将文章推荐给<strong>你已关注</strong>的用户；对方待读主题将显示为「你的备注或昵称 + 推荐」。
        </p>
        <div className="modal-sheet-body">
          {error ? <p className="me-msg">{error}</p> : null}
          {follows.length === 0 ? (
            <p className="muted-link">暂无关注对象，请先在「随览」里关注用户。</p>
          ) : (
            <ul className="recommend-pick-list">
              {follows.map((f) => (
                <li key={f.followedId}>
                  <button type="button" className="recommend-pick-row" disabled={busy} onClick={() => onPick(f.followedId)}>
                    <span className="recommend-pick-main">
                      <span className="recommend-pick-name">{f.label || f.nickname}</span>
                      <span className="muted-link recommend-pick-sub">{f.nickname}</span>
                    </span>
                    <span className="recommend-pick-chev" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** 供 ArticleCard 等拉取关注列表（与 /api/social/follows 一致） */
export function useMyFollowsForRecommend() {
  const [follows, setFollows] = useState<FollowPickRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/social/follows", { cache: "no-store" });
        const d = (await r.json()) as {
          follows?: { followedId: string; label: string; nickname: string; emailHint: string }[];
        };
        if (!r.ok || cancelled) return;
        setFollows(
          (d.follows ?? []).map((row) => ({
            followedId: row.followedId,
            label: row.label?.trim() || "",
            nickname: row.nickname?.trim() || "用户",
            emailHint: row.emailHint?.trim() || "",
          })),
        );
      } catch {
        if (!cancelled) setFollows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return follows;
}
