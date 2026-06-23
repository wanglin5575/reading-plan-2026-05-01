/**
 * 阅读弹窗：基于已有摘要用 AI 生成 ≤500 字的阅读原文摘要（中文）。
 * 复用 AI_SUMMARY_* / WOLF_* 环境变量。
 */

import { fetchAiChatCompletions, type AiChatUsage } from "@/lib/ai-chat";

function trimEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export type { AiChatUsage } from "@/lib/ai-chat";

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
    Math.max(parseInt(process.env.READ_MODAL_MAX_OUTPUT_TOKENS?.trim() || "2400", 10) || 2400, 400),
    4096,
  );

  const systemText = `你是阅读策展助手。用户点击文章标题后先看到弹窗摘要，而不是直接打开外链。
请只输出一段连贯的简体中文正文（不要使用 Markdown、不要用标题、不要用编号列表，除非材料本身必须用极少量分点才能说清）。
写作要求：
1）概括原文的主要信息与结论；
2）复述原文最重要的观点（若有多条，合并为一段）；
3）若材料涉及大语言模型评测、基准测试、benchmark、AI Evals、模型对比或实验设置，请单独点出与评测相关的主要内容；
4）行文简明、不堆砌，但不设字数上限；信息尽量完整，不要为压缩字数而牺牲要点；不要输出链接或复述 URL。`;

  const userContent = `标题：${params.title.slice(0, 400)}
链接（仅供你理解语境，不要写入输出）：${params.url}

下列为已有的摘要与节选，请据此写作：
${bodyText}`;

  const authMode = (trimEnv("AI_SUMMARY_AUTH") || "bearer")!.toLowerCase();

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

  const aiResult = await fetchAiChatCompletions({
    base,
    key,
    authMode,
    bodyPayload,
    timeoutMs,
    label: "read_preview",
  });
  const usage = aiResult.usage;
  if (!aiResult.ok) return null;
  const jsonPayload = aiResult.jsonPayload;

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

  return { text: text.trim(), usage };
}
