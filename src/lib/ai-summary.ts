/**
 * 可选：OpenAI 兼容 Chat Completions 生成约 70 字中文摘要。
 * 密钥仅读 process.env，勿使用 NEXT_PUBLIC_ 前缀，避免暴露到浏览器。
 *
 * 支持环境变量别名：WOLF_API_KEY、WOLF_BASE_URL、WOLF_MODEL（与 AI_SUMMARY_* 二选一，后者优先）
 */

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

/** @returns 简体中文摘要原文（未截断），失败返回 null 以便上层回退 */
export async function summarizeArticleZhWithAi(params: {
  title: string;
  body: string;
  url: string;
}): Promise<string | null> {
  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return null;

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) ||
    12000;
  const maxTokens =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_OUTPUT_TOKENS?.trim() || "220", 10) || 220, 2000) || 220;

  const bodyText = params.body.replace(/\s+/g, " ").trim().slice(0, maxInput);
  const userContent = `标题：${params.title.slice(0, 400)}\n链接：${params.url}\n\n正文节选：\n${bodyText || "(正文为空)"}`;

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
    Math.max(parseInt(process.env.AI_SUMMARY_TIMEOUT_MS?.trim() || "45000", 10) || 45000, 5000),
    120000,
  );

  let res: Response;
  try {
    res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content:
              "你是阅读摘要助手。请用简体中文写一句话概括正文主旨，严格不超过70个字（含标点）。不要加引号或书名号包裹；不要输出「摘要：」等前缀；不要复述链接；若正文信息量极少，据标题合理推断并简短说明。",
          },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  try {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    const text =
      data.choices?.[0]?.message?.content?.trim() ||
      (typeof data.choices?.[0]?.text === "string" ? data.choices[0].text.trim() : "");
    return text || null;
  } catch {
    return null;
  }
}
