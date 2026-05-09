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
  onConfirm,
}: {
  open: boolean;
  articleTitle: string;
  busy: boolean;
  error: string | null;
  follows: FollowPickRow[];
  onClose: () => void;
  onConfirm: (followedId: string) => void;
}) {
  const [pick, setPick] = useState<FollowPickRow | null>(null);

  useEffect(() => {
    if (open) setPick(null);
  }, [open]);

  if (!open) return null;

  const displayName = pick ? pick.label || pick.nickname : "";

  function handleBackdrop() {
    if (busy) return;
    if (pick) setPick(null);
    else onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && handleBackdrop()}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rec-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-sheet-header">
          <h2 id="rec-pick-title">{pick ? "确认推荐" : "推荐 TA 读"}</h2>
          <button type="button" className="modal-sheet-close" onClick={() => !busy && onClose()} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="muted-link" style={{ margin: "0 0 10px", fontSize: "var(--fs-small)" }}>
          {articleTitle}
        </p>
        {!pick ? (
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
            仅可将文章推荐给<strong>互相关注</strong>的用户；对方待读主题将显示为「你的备注或昵称 + 推荐」。
          </p>
        ) : (
          <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
            确认将上文推荐给「{displayName}」？对方待读中会出现对应篇目。
          </p>
        )}
        <div className="modal-sheet-body">
          {error ? <p className="me-msg">{error}</p> : null}
          {!pick ? (
            follows.length === 0 ? (
              <p className="muted-link">暂无互相关注对象。请在「随览」关注对方，并请对方在「我的」里回关你。</p>
            ) : (
              <ul className="recommend-pick-list">
                {follows.map((f) => (
                  <li key={f.followedId}>
                    <button type="button" className="recommend-pick-row" disabled={busy} onClick={() => setPick(f)}>
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
            )
          ) : (
            <div className="modal-sheet-footer" style={{ marginTop: 8, paddingTop: 0, borderTop: "none" }}>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => setPick(null)}>
                返回重选
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => onConfirm(pick.followedId)}>
                {busy ? "提交中…" : "确认推荐"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 供 ArticleCard 等拉取可推荐对象（互关，见 GET /api/social/follows?mutual=1） */
export function useMyFollowsForRecommend() {
  const [follows, setFollows] = useState<FollowPickRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/social/follows?mutual=1", { cache: "no-store" });
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
