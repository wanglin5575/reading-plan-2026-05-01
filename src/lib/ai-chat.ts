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

export async function fetchAiChatCompletions(params: {
  base: string;
  key: string;
  authMode?: string;
  bodyPayload: Record<string, unknown>;
  timeoutMs: number;
  label: string;
  retryWithoutResponseFormat?: boolean;
}): Promise<AiChatResult> {
  const headers = buildAiHeaders(params.key, params.authMode);
  const url = chatCompletionsUrl(params.base);

  const attempt = async (payload: Record<string, unknown>, retried: boolean): Promise<AiChatResult | null> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(params.timeoutMs),
      });
    } catch (e) {
      logAiWarning(params.label, params.base, payload, "request_failed", {
        error: errorMessage(e),
        retried,
        responseFormat: Boolean(payload.response_format),
      });
      return null;
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
      return { ok: false, jsonPayload: json, usage };
    }
    if (!json) {
      logAiWarning(params.label, params.base, payload, "invalid_json_response", {
        status: res.status,
        bodyPreview: preview,
        retried,
      });
      return { ok: false, jsonPayload: null, usage };
    }
    return { ok: true, jsonPayload: json, usage };
  };

  const first = await attempt(params.bodyPayload, false);
  if (first?.ok) return first;

  if (params.retryWithoutResponseFormat && params.bodyPayload.response_format) {
    const { response_format: _drop, ...fallbackPayload } = params.bodyPayload;
    const retry = await attempt(fallbackPayload, true);
    if (retry) return retry;
  }

  return first ?? { ok: false, jsonPayload: null, usage: null };
}
