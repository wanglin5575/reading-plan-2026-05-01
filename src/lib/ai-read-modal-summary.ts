/**
 * 阅读弹窗：基于已有摘要用 AI 生成 ≤500 字的阅读原文摘要（中文）。
 * 复用 AI_SUMMARY_* / WOLF_* 环境变量。
 */

import { clampZhBody, READ_MODAL_MAX_CHARS } from "@/lib/read-modal-fallback";

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

function chatCompletionsUrl(baseRaw: string): string {
  const b = baseRaw.replace(/\/$/, "");
  if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

export type AiChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function parseUsage(data: unknown): AiChatUsage | null {
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

/**
 * @returns 正文摘要文本（≤500 字）；失败返回 null（由路由改为节选降级）。
 */
export async function generateReadModalSummary(params: {
  title: string;
  url: string;
  sourceText: string;
}): Promise<{ text: string; usage: AiChatUsage | null } | null> {
  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return null;

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) ||
    12000;
  const bodyText = params.sourceText.replace(/\s+/g, " ").trim().slice(0, maxInput);
  if (!bodyText) return null;

  const maxTokens = Math.min(
    Math.max(parseInt(process.env.AI_SUMMARY_MAX_OUTPUT_TOKENS?.trim() || "900", 10) || 900, 200),
    2000,
  );

  const systemText = `你是阅读策展助手。用户点击文章标题后先看到弹窗摘要，而不是直接打开外链。
请只输出一段连贯的简体中文正文（不要使用 Markdown、不要用标题、不要用编号列表，除非材料本身必须用极少量分点才能说清）。
写作要求：
1）概括原文的主要信息与结论；
2）复述原文最重要的观点（若有多条，合并为一段）；
3）若材料涉及大语言模型评测、基准测试、benchmark、AI Evals、模型对比或实验设置，请单独点出与评测相关的主要内容；
4）全文严格不超过 ${READ_MODAL_MAX_CHARS} 个汉字（含标点），宁短勿超；不要输出链接或复述 URL。`;

  const userContent = `标题：${params.title.slice(0, 400)}
链接（仅供你理解语境，不要写入输出）：${params.url}

下列为已有的摘要与节选，请据此写作：
${bodyText}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authMode = (trimEnv("AI_SUMMARY_AUTH") || "bearer")!.toLowerCase();
  if (authMode === "x-api-key" || authMode === "x_api_key") {
    headers["X-API-Key"] = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.AI_SUMMARY_TIMEOUT_MS?.trim() || "60000", 10) || 60000, 5000),
    120000,
  );

  const bodyPayload: Record<string, unknown> = {
    model,
    temperature: 0.25,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
  };

  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }

  let jsonPayload: unknown;
  try {
    jsonPayload = await res.json();
  } catch {
    return null;
  }

  const usage = parseUsage(jsonPayload);
  if (!res.ok) return null;

  let text = "";
  try {
    const data = jsonPayload as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    text =
      data.choices?.[0]?.message?.content?.trim() ||
      (typeof data.choices?.[0]?.text === "string" ? data.choices[0].text.trim() : "") ||
      "";
  } catch {
    return null;
  }
  if (!text) return null;

  return { text: clampZhBody(text), usage };
}
