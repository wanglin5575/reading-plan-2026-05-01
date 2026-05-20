/**
 * 待读列表摘要：根据用户「阅读目的」与待读条目生成 ≤1000 字中文摘要。
 * 复用 AI_SUMMARY_* / WOLF_* 环境变量。
 */

import { clampZhBody } from "@/lib/read-modal-fallback";
import type { Article } from "@/lib/types";
import { MEDIA_KIND_LABEL } from "@/lib/media-kind";

export const TODO_DIGEST_MAX_CHARS = 1000;

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

function buildPurposeBlock(p: {
  readingRole: string;
  readingDuties: string;
  readingGoal: string;
  readingPromptExtra: string;
}): string {
  const parts: string[] = [];
  const role = p.readingRole.trim();
  const duties = p.readingDuties.trim();
  const goal = p.readingGoal.trim();
  const extra = p.readingPromptExtra.trim();
  if (role) parts.push(`职业/角色：${role}`);
  if (duties) parts.push(`工作职责：${duties}`);
  if (goal) parts.push(`希望通过阅读实现：${goal}`);
  if (extra) parts.push(`补充说明：${extra}`);
  return parts.length ? parts.join("\n") : "（用户未填写阅读目的，请仅根据待读列表提炼最值得关注的共性信息。）";
}

function compactArticleLine(a: Article, index: number, tight?: boolean): string {
  const kind = MEDIA_KIND_LABEL[a.mediaType] ?? "文章";
  const title = (a.titleZh?.trim() || a.title).replace(/\s+/g, " ").trim().slice(0, 120);
  const theme = a.theme.replace(/\s+/g, " ").trim().slice(0, 40);
  const sum = a.summary.replace(/\s+/g, " ").trim().slice(0, tight ? 160 : 320);
  const ex = a.rawExcerpt.replace(/\s+/g, " ").trim().slice(0, tight ? 140 : 260);
  return `${index + 1}. [${kind}] ${title}${theme ? ` · 主题「${theme}」` : ""}\n   摘要：${sum || "（无）"}\n   节选：${ex || "（无）"}`;
}

export type TodoDigestGenerateMode = "full" | "incremental";

export async function generateTodoDigest(params: {
  readingRole: string;
  readingDuties: string;
  readingGoal: string;
  readingPromptExtra: string;
  /** 全文重算：当前全部待读；增量：仅自上次生成以来新增的待读 */
  todos: Article[];
  mode: TodoDigestGenerateMode;
  /** 有内容时全文模式下单次附加要求（省 token：勿与 profile 重复） */
  oneTimeExtra?: string;
  /** 增量模式：上一版已展示的摘要全文 */
  previousDigest?: string;
}): Promise<{ text: string; usage: AiChatUsage | null } | null> {
  const base = trimEnv("AI_SUMMARY_BASE_URL", "WOLF_BASE_URL");
  const key = trimEnv("AI_SUMMARY_API_KEY", "WOLF_API_KEY");
  const model = trimEnv("AI_SUMMARY_MODEL", "WOLF_MODEL");
  if (!base || !key || !model) return null;

  const purpose = buildPurposeBlock(params);
  const maxItems = Math.min(Math.max(parseInt(process.env.TODO_DIGEST_MAX_ITEMS?.trim() || "60", 10) || 60, 5), 120);
  const slice = params.todos.slice(0, maxItems);
  const tight = params.mode === "incremental";
  const lines = slice.map((a, i) => compactArticleLine(a, i, tight)).join("\n\n");

  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 58000) || 12000;

  const extraBlock =
    params.mode === "full" && params.oneTimeExtra?.trim()
      ? `【本次单次附加要求（仅此一轮，优先满足；勿与下方固定背景重复）】\n${params.oneTimeExtra.trim().slice(0, 800)}\n\n`
      : "";

  let listSection: string;
  if (params.mode === "incremental") {
    listSection = `【自上次摘要生成以来新加入的待读条目】\n${lines || "（无，若你仍收到此段则说明数据异常）"}`;
  } else {
    listSection = `【待读清单（含文章/视频/音频的摘要与节选）】\n${lines}`;
  }

  const prevBlock =
    params.mode === "incremental" && params.previousDigest?.trim()
      ? `【上一版待读摘要（请有机融入新增要点，勿逐句复述，可改写压缩）】\n${params.previousDigest.trim().slice(0, TODO_DIGEST_MAX_CHARS)}\n\n`
      : "";

  const bundle = `【用户阅读目的与背景】\n${purpose}\n\n${extraBlock}${prevBlock}${listSection}`.slice(0, maxInput);

  const maxTokens = Math.min(
    Math.max(parseInt(process.env.TODO_DIGEST_MAX_OUTPUT_TOKENS?.trim() || "2200", 10) || 2200, 400),
    4096,
  );

  const systemBase = `你是阅读计划助手。用户有一份「待读」清单（可能包含文章、视频、音频类素材的摘要与节选）。
输出为简体中文纯文本：全文严格不超过 ${TODO_DIGEST_MAX_CHARS} 个汉字（含标点），不得超过上限；不要输出链接；不要复述用户固定背景原文。
写作要求：在字数上限内做到**内容完整、逻辑连贯、有信息深度**——讲清「待读库在说什么、彼此如何关联、对用户目标意味着什么、建议优先关注什么」；避免空话套话、标题堆砌、只列书名式罗列或浅层概括。可用 2～4 个自然段组织，段内因果/递进清晰。`;
  const systemStyle =
    params.mode === "incremental"
      ? `你已收到「上一版待读摘要」与「新增条目」。请将新增条目的关键信息**有机融入**全文：可改写、合并、删繁就简；不要简单拼接两段；更新后仍须满足上述完整性与深度要求。`
      : `请根据用户的职业背景、职责与阅读目的，判断当前待读库中**最值得关注或优先处理**的信息并写成摘要。
若存在「本次单次附加要求」，须优先满足，同时保持整体完整、有逻辑、有深度。`;

  const systemText = `${systemBase}\n${systemStyle}`;

  const userContent = bundle;

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
    Math.max(parseInt(process.env.AI_SUMMARY_TIMEOUT_MS?.trim() || "90000", 10) || 90000, 8000),
    120000,
  );

  const bodyPayload: Record<string, unknown> = {
    model,
    temperature: 0.3,
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

  return { text: clampZhBody(text, TODO_DIGEST_MAX_CHARS), usage };
}
