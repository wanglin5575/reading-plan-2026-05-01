/**
 * 用于 UI 展示「AI生成(读取…)」括号内短说明：与真实送入模型的素材对齐（书库分类、随览 enrich、读前弹窗）。
 */

import type { Article } from "@/lib/types";
import type { MediaKind } from "@/lib/media-kind";
import { detectMediaKindFromUrl } from "@/lib/media-kind";

function joinParts(parts: string[], max = 6): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.join("、");
}

/** 书库添加/刷新：与 enrichArticleWithAi 使用的正文样本一致 */
export function buildBookAiReadSourcesLabel(opts: {
  mediaKind: MediaKind;
  bodyForAi: string;
  hadScreenshot: boolean;
}): string {
  const parts: string[] = ["标题与页面元数据"];
  const b = opts.bodyForAi;
  if (opts.hadScreenshot) parts.push("视频页首屏截图(约前十余秒画面)");
  if (b.includes("【多媒体页面】")) parts.push("多媒体页可见文案");
  if (b.includes("【页面中与音视频相关的文字摘录】")) parts.push("页面字幕或时间轴文案");
  else if (opts.mediaKind === "video") parts.push("视频简介与页面转写");
  else if (opts.mediaKind === "audio") parts.push("音频简介与页面转写");
  if (b.replace(/\s/g, "").length >= 60) parts.push("正文转写节选");
  return joinParts(parts);
}

/** 随览 Wolf enrich：基于检索抓取到的 markdown 与元数据 */
export function buildBrowseAiReadSourcesLabel(hit: {
  url: string;
  summary: string;
  excerpt: string;
  description: string;
  mediaType?: MediaKind;
  fullMarkdownForAi?: string;
}): string {
  const md = (hit.fullMarkdownForAi ?? "").trim();
  const hasBody = md.length >= 120;
  const kind = hit.mediaType ?? detectMediaKindFromUrl(hit.url);
  const parts: string[] = ["标题与检索摘要"];
  if (hasBody) parts.push("页面正文转写节选");
  else parts.push("检索摘要与描述");
  if (kind === "video") parts.push("视频页元数据与可见文案");
  if (kind === "audio") parts.push("音频页元数据与可见文案");
  if (/【页面中与音视频|字幕|Transcript|自动字幕|Caption/i.test(md)) parts.push("字幕或文案区");
  return joinParts(parts);
}

/** 读前弹窗：与 POST read-preview 的 sourceText 一致（书库摘要+节选等） */
export function buildReadPreviewInputLabel(sourceText: string, url: string): string {
  const s = sourceText.trim();
  const kind = detectMediaKindFromUrl(url);
  const parts: string[] = [];
  if (s.includes("\n\n") && s.split("\n\n").filter(Boolean).length >= 2) parts.push("书库摘要");
  else if (s.length > 0) parts.push("书库摘要或要点");
  parts.push("正文节选");
  if (kind === "video") parts.push("视频类链接语境");
  if (/【多媒体|字幕|时间轴|\d{1,2}:\d{2}/.test(s)) parts.push("字幕或时间轴文案");
  return joinParts(parts);
}

/** 无 DB 字段时的弱推断（旧数据） */
export function inferBookAiReadSourcesFromArticle(a: {
  url: string;
  mediaType: MediaKind;
  rawExcerpt: string;
  summary: string;
}): string {
  const ex = a.rawExcerpt?.trim() ?? "";
  const sum = a.summary?.trim() ?? "";
  const parts: string[] = ["标题与链接"];
  if (sum && sum !== "(暂无摘要)") parts.push("书库摘要");
  if (ex.length >= 40) parts.push("正文节选");
  if (a.mediaType === "video") parts.push("视频类素材");
  if (a.mediaType === "audio") parts.push("音频类素材");
  if (/【多媒体|字幕|\d{1,2}:\d{2}/.test(`${sum}\n${ex}`)) parts.push("字幕或页面时间轴线索");
  return joinParts(parts);
}

/** 卡片 / 读前弹窗：优先用入库的生成说明，否则推断 */
export function resolveArticleAiReadLabel(a: Article): string {
  const t = a.aiReadSourcesLabel?.trim();
  if (t) return t;
  return inferBookAiReadSourcesFromArticle(a);
}
