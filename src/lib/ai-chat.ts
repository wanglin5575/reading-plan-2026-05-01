/**
 * Shared helpers for OpenAI-compatible Chat Completions gateways.
 * Keep secrets out of logs; only log endpoint host/path, model and status.
 */

export function chatCompletionsUrl(baseRaw: string): string {
  const b = baseRaw.replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

/** OpenAI-compatible Chat Completions usage field. */
export type AiChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export function parseOpenAiCompatibleUsage(data: unknown): AiChatUsage | null {
  if (!data || typeof data !== "object") return null;
  const u = (data as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const prompt =
    "prompt_tokens" in u && typeof (u as { prompt_tokens?: unknown }).prompt_tokens === "number"
      ? (u as { prompt_tokens: number }).prompt_tokens
      : 0;
  const completion =
    "completion_tokens" in u && typeof (u as { completion_tokens?: unknown }).completion_tokens === "number"
      ? (u as { completion_tokens: number }).completion_tokens
      : 0;
  const total =
    "total_tokens" in u && typeof (u as { total_tokens?: unknown }).total_tokens === "number"
      ? (u as { total_tokens: number }).total_tokens
      : prompt + completion;
  if (!Number.isFinite(total) || total < 0) return null;
  return {
    promptTokens: Number.isFinite(prompt) ? Math.max(0, Math.round(prompt)) : 0,
    completionTokens: Number.isFinite(completion) ? Math.max(0, Math.round(completion)) : 0,
    totalTokens: Math.max(0, Math.round(total)),
  };
}

export function buildAiHeaders(key: string, authModeRaw?: string): Record<string, string> {
  const authMode = (authModeRaw || "bearer").toLowerCase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authMode === "x-api-key" || authMode === "x_api_key") {
    headers["X-API-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function endpointLabel(baseRaw: string): string {
  try {
    const u = new URL(chatCompletionsUrl(baseRaw));
    return `${u.host}${u.pathname}`;
  } catch {
    return "invalid_ai_base_url";
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function modelName(payload: Record<string, unknown>): string {
  const m = payload.model;
  return typeof m === "string" && m.trim() ? m.trim() : "unknown";
}

async function parseJsonResponse(res: Response): Promise<{ json: unknown; preview: string }> {
  const text = await res.text();
  try {
    return { json: text ? (JSON.parse(text) as unknown) : {}, preview: text.slice(0, 500) };
  } catch {
    return { json: null, preview: text.slice(0, 500) };
  }
}

function logAiWarning(
  label: string,
  base: string,
  payload: Record<string, unknown>,
  message: string,
  extra?: Record<string, unknown>,
) {
  console.warn("[ai-chat]", {
    label,
    endpoint: endpointLabel(base),
    model: modelName(payload),
    message,
    ...extra,
  });
}

export type AiChatResult =
  | { ok: true; jsonPayload: unknown; usage: AiChatUsage | null }
  | { ok: false; jsonPayload: unknown | null; usage: AiChatUsage | null };

/** 网关侧可重试的临时性 HTTP 状态：超时/过早/限流/网关错误。 */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 调用 OpenAI 兼容网关（如 WolfAI）。
 *
 * WolfAI 网关延迟波动大且偶发「fetch failed / 超时 / 5xx / 429」，故对**临时性失败**
 * 做有限次指数退避重试（默认最多 2 次），并以总时长预算兜底，避免超出 Vercel maxDuration。
 * 非临时性失败（4xx、非法 JSON）不重试。`retryWithoutResponseFormat` 仍保留：
 * 若带 response_format 始终失败，则去掉该字段再走一轮（同样带重试）。
 */
export async function fetchAiChatCompletions(params: {
  base: string;
  key: string;
  authMode?: string;
  bodyPayload: Record<string, unknown>;
  timeoutMs: number;
  label: string;
  retryWithoutResponseFormat?: boolean;
  /** 单个 payload 变体的额外重试次数（不含首次）。默认 2。 */
  maxRetries?: number;
}): Promise<AiChatResult> {
  const headers = buildAiHeaders(params.key, params.authMode);
  const url = chatCompletionsUrl(params.base);
  const maxRetries = Math.max(0, params.maxRetries ?? 2);

  // 总时长预算：避免「单次超时 × 多次重试」拖垮 Serverless（maxDuration 通常 120s）。
  const budgetMs = Math.min(params.timeoutMs * (maxRetries + 1), 110000);
  const deadline = Date.now() + budgetMs;

  const attemptOnce = async (
    payload: Record<string, unknown>,
    retried: boolean,
    perAttemptTimeout: number,
  ): Promise<{ result: AiChatResult | null; transient: boolean }> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(perAttemptTimeout),
      });
    } catch (e) {
      logAiWarning(params.label, params.base, payload, "request_failed", {
        error: errorMessage(e),
        retried,
        responseFormat: Boolean(payload.response_format),
      });
      // 网络层异常（含 AbortSignal 超时、连接重置）通常是临时性的。
      return { result: null, transient: true };
    }

    const { json, preview } = await parseJsonResponse(res);
    const usage = parseOpenAiCompatibleUsage(json);
    if (!res.ok) {
      logAiWarning(params.label, params.base, payload, "non_2xx_response", {
        status: res.status,
        bodyPreview: preview,
        retried,
        responseFormat: Boolean(payload.response_format),
      });
      return { result: { ok: false, jsonPayload: json, usage }, transient: isTransientStatus(res.status) };
    }
    if (!json) {
      logAiWarning(params.label, params.base, payload, "invalid_json_response", {
        status: res.status,
        bodyPreview: preview,
        retried,
      });
      return { result: { ok: false, jsonPayload: null, usage }, transient: false };
    }
    return { result: { ok: true, jsonPayload: json, usage }, transient: false };
  };

  const runWithRetries = async (
    payload: Record<string, unknown>,
    retried: boolean,
  ): Promise<AiChatResult | null> => {
    let last: AiChatResult | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) break;
      const perAttemptTimeout = Math.min(params.timeoutMs, remaining);
      const { result, transient } = await attemptOnce(payload, retried, perAttemptTimeout);
      if (result?.ok) return result;
      last = result;
      if (!transient || i === maxRetries) break;
      const backoff = Math.min(600 * 2 ** i, 4000) + Math.floor(Math.random() * 300);
      if (deadline - Date.now() < backoff + 3000) break;
      await sleep(backoff);
    }
    return last;
  };

  const first = await runWithRetries(params.bodyPayload, false);
  if (first?.ok) return first;

  if (params.retryWithoutResponseFormat && params.bodyPayload.response_format) {
    const { response_format: _drop, ...fallbackPayload } = params.bodyPayload;
    const retry = await runWithRetries(fallbackPayload, true);
    if (retry) return retry;
  }

  return first ?? { ok: false, jsonPayload: null, usage: null };
}
