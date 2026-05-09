/**
 * 阅读弹窗：同一会话内第二次点开同一内容时立即展示上次结果，避免「正在生成」闪烁与多余请求。
 * 与 /api/read-preview 的入参（title、url、sourceText）语义对齐。
 */

import type { ReadPreviewApiSource } from "@/lib/read-preview-source";

const MAX_ENTRIES = 120;

type Entry = {
  fp: string;
  text: string;
  showFallback: boolean;
  /** 上次请求写入的服务端来源；本页二次打开时 UI 仍显示为 client_cache */
  apiSource?: ReadPreviewApiSource;
};

const store = new Map<string, Entry>();

/** 与 title + url + 正文绑定的指纹，正文变化则自动失效 */
export function readPreviewInputFingerprint(title: string, url: string, sourceText: string): string {
  const s = `${title}\n${url}\n${sourceText}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}

export function getReadPreviewUiCache(
  namespaceId: string,
  title: string,
  url: string,
  sourceText: string,
): Entry | null {
  const fp = readPreviewInputFingerprint(title, url, sourceText);
  const key = `${namespaceId}::${fp}`;
  const row = store.get(key);
  if (!row || row.fp !== fp) return null;
  return row;
}

export function setReadPreviewUiCache(
  namespaceId: string,
  title: string,
  url: string,
  sourceText: string,
  text: string,
  showFallback: boolean,
  apiSource?: ReadPreviewApiSource,
): void {
  const fp = readPreviewInputFingerprint(title, url, sourceText);
  const key = `${namespaceId}::${fp}`;
  store.set(key, { fp, text, showFallback, apiSource });
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
    else break;
  }
}

/** 强制重新走模型前清除本页会话缓存，避免仍命中 client_cache */
export function clearReadPreviewUiCache(
  namespaceId: string,
  title: string,
  url: string,
  sourceText: string,
): void {
  const fp = readPreviewInputFingerprint(title, url, sourceText);
  store.delete(`${namespaceId}::${fp}`);
}
