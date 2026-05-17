/**
 * 阅读弹窗摘要来源：服务端 API（方案 2-2）与客户端本页缓存共用类型。
 */

/** POST /api/read-preview 成功体中的 source */
export type ReadPreviewApiSource = "server_cache" | "llm" | "fallback";

/** 含本页内存命中（仅前端） */
export type ReadPreviewSource = ReadPreviewApiSource | "client_cache";

export function isReadPreviewApiSource(v: unknown): v is ReadPreviewApiSource {
  return v === "server_cache" || v === "llm" || v === "fallback";
}

/** 弹窗副标题：AI 路径展示「AI生成(读取…)」 */
export function readPreviewSourceHeadline(
  source: ReadPreviewSource,
  readSourcesShort?: string | null,
): string {
  const rs = readSourcesShort?.trim();
  switch (source) {
    case "client_cache":
    case "server_cache":
    case "llm":
      return rs ? `AI生成(读取${rs})` : "AI生成(读取书库摘要与正文节选)";
    case "fallback":
      return "摘要来源：节选";
    default:
      return "摘要来源：节选";
  }
}

/** 加载完成后一行说明（节选路径仅用原有节选提示，不重复） */
export function readPreviewReadinessNote(source: ReadPreviewSource): string | null {
  switch (source) {
    case "client_cache":
    case "server_cache":
      return "本次未调用模型，已使用历史生成结果。";
    case "llm":
      return "本次已调用模型生成摘要。";
    case "fallback":
      return null;
    default:
      return null;
  }
}

/** 将 API JSON 规范为来源（兼容旧字段 cached / fallback / ai） */
export function readPreviewSourceFromApiPayload(d: {
  source?: unknown;
  cached?: unknown;
  fallback?: unknown;
  ai?: unknown;
}): ReadPreviewApiSource {
  if (isReadPreviewApiSource(d.source)) return d.source;
  if (d.cached === true) return "server_cache";
  if (d.fallback === true) return "fallback";
  if (d.ai === true) return "llm";
  return "fallback";
}
