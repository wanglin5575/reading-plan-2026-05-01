"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasActiveTextSelection } from "@/lib/text-selection";

function DigestExtraTextarea({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 280)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id="todo-digest-extra-req"
      className="todo-digest-extra-textarea"
      rows={2}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 800))}
      placeholder="可选：填写本次希望摘要侧重的方向、受众、格式等（留空则仅在上一版摘要上合并新增待读，更省 token）"
      aria-label="本次生成摘要的附加要求"
    />
  );
}

/** 待读页：服务端存储的 AI 摘要条（手动刷新生成） */
export function TodoDigestBar({ signedIn }: { signedIn: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);
  const [extraRequirement, setExtraRequirement] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadStored = useCallback(async () => {
    if (!signedIn) return;
    try {
      const r = await fetch("/api/plan/todo-digest", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { error?: string; text?: string; updatedAt?: string | null };
      if (!r.ok) throw new Error(d.error || "加载摘要失败");
      setText(typeof d.text === "string" ? d.text : "");
      setUpdatedAt(d.updatedAt ?? null);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setInitialLoaded(true);
    }
  }, [signedIn]);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  const postRefresh = useCallback(
    async (extra: string, opts?: { force?: boolean }) => {
      if (!signedIn || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setLoadErr(null);
      setInfoMsg(null);
      try {
        const r = await fetch("/api/plan/todo-digest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            extraRequirement: extra,
            force: opts?.force === true,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          error?: string;
          text?: string;
          updatedAt?: string | null;
          skipped?: boolean;
          reason?: string;
        };
        if (!r.ok) throw new Error(d.error || "生成失败");
        if (d.skipped && d.reason === "no_new_todos") {
          setInfoMsg("暂无新增待读，已跳过模型调用以节省额度，摘要未改动。");
          return;
        }
        setText(typeof d.text === "string" ? d.text : "");
        setUpdatedAt(d.updatedAt ?? null);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "生成失败");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [signedIn],
  );

  useEffect(() => {
    const onProfileSaved = () => {
      void postRefresh("");
    };
    window.addEventListener("reading-plan-profile-saved", onProfileSaved);
    return () => window.removeEventListener("reading-plan-profile-saved", onProfileSaved);
  }, [postRefresh]);

  function openRefreshModal() {
    setInfoMsg(null);
    setExtraRequirement("");
    setForceConfirmOpen(false);
    setRefreshModalOpen(true);
  }

  function closeRefreshModal() {
    if (busy) return;
    setRefreshModalOpen(false);
    setForceConfirmOpen(false);
    setExtraRequirement("");
  }

  async function confirmRefreshFromModal() {
    const ex = extraRequirement.trim();
    await postRefresh(ex);
    closeRefreshModal();
  }

  async function confirmForceRefresh() {
    const ex = extraRequirement.trim();
    await postRefresh(ex, { force: true });
    closeRefreshModal();
  }

  if (!signedIn) return null;

  const display =
    text.trim() ||
    "尚未生成待读摘要。展开后点击「刷新摘要」将根据你的阅读目的与当前待读列表生成（内容力求完整、有逻辑、有深度）。";
  const timeLine = updatedAt
    ? new Date(updatedAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })
    : null;

  const refreshModal =
    refreshModalOpen && mounted ? (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && closeRefreshModal()}
      >
        <div
          className="modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="todo-digest-refresh-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <h2 id="todo-digest-refresh-title">{forceConfirmOpen ? "确认强制刷新" : "刷新待读摘要"}</h2>
            <button type="button" className="modal-sheet-close" onClick={() => closeRefreshModal()} aria-label="关闭">
              ×
            </button>
          </div>
          <div className="modal-sheet-body">
            {forceConfirmOpen ? (
              <p className="muted-link" style={{ margin: 0, fontSize: "var(--fs-small)" }}>
                将依据<strong>当前全部待读</strong>重新生成摘要，覆盖上一版内容，并消耗更多 token。若上方已填写附加要求，会一并纳入本次生成。确定继续？
              </p>
            ) : (
              <>
                <p className="muted-link" style={{ margin: "0 0 12px", fontSize: "var(--fs-small)" }}>
                  留空下方输入框并确认：在<strong>上一版摘要</strong>基础上，仅根据<strong>自上次生成以来新加入的待读</strong>合并更新（更省
                  token）。填写要求并确认：对<strong>当前全部待读</strong>重新生成一轮，并将你的要求作为<strong>单次临时说明</strong>追加到
                  prompt（摘要力求完整、有逻辑、有深度）。
                </p>
                <DigestExtraTextarea value={extraRequirement} onChange={setExtraRequirement} disabled={busy} />
                <p className="muted-link" style={{ margin: "8px 0 0", fontSize: "var(--fs-small)" }}>
                  最多 800 字；与账号里配置的长期阅读目的互补，无需重复粘贴个人资料全文。需要无视增量、全量重算时请用下方「强制刷新」。
                </p>
              </>
            )}
          </div>
          <div className="modal-sheet-footer">
            {forceConfirmOpen ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => void confirmForceRefresh()}>
                  {busy ? "生成中…" : "确认强制刷新"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setForceConfirmOpen(false)}
                >
                  返回
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => void confirmRefreshFromModal()}>
                  {busy ? "生成中…" : "开始生成"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setForceConfirmOpen(true)}
                >
                  强制刷新
                </button>
              </>
            )}
            <button type="button" className="btn secondary" disabled={busy} onClick={() => closeRefreshModal()}>
              取消
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <section className="todo-digest" aria-label="待读摘要">
      <div
        className={`todo-digest-bar${expanded ? " is-expanded" : ""}`}
        onClick={() => {
          if (hasActiveTextSelection()) return;
          setExpanded((v) => !v);
        }}
      >
        <button
          type="button"
          className="todo-digest-chevron"
          aria-expanded={expanded}
          aria-label={expanded ? "收起待读摘要" : "展开待读摘要"}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <div className="todo-digest-text-wrap">
          <div className={`todo-digest-text${expanded ? " is-full" : " is-clamp"}`}>{display}</div>
        </div>
      </div>
      {loadErr ? <p className="me-msg todo-digest-err">{loadErr}</p> : null}
      {infoMsg ? (
        <p className="muted-link todo-digest-err" style={{ color: "var(--muted-fg, #666)" }}>
          {infoMsg}
        </p>
      ) : null}
      {timeLine ? <p className="todo-digest-meta muted-link">上次生成：{timeLine}</p> : null}
      {expanded ? (
        <div className="todo-digest-actions">
          <button type="button" className="btn todo-digest-action-btn" disabled={busy} onClick={() => openRefreshModal()}>
            刷新摘要
          </button>
        </div>
      ) : null}
      {!initialLoaded ? <p className="muted-link todo-digest-loading">摘要状态加载中…</p> : null}
      {refreshModal ? createPortal(refreshModal, document.body) : null}
    </section>
  );
}
