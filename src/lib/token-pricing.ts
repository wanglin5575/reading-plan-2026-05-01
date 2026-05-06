/**
 * AI Token 美元估算（与 WolfAI 控制台「按量计费」常见展示一致：输入/补全分列，单价为美元/千 tokens）。
 *
 * 图示 default 分组参考：输入 $3 / 1M → $0.003/1K；补全 $15 / 1M → $0.015/1K。
 *
 * 「缓存输入」按产品规则单独计量：`cachedPromptTokens` 与输入同档单价一并计入（常见为 3× 输入规模）。
 */

/** 美元 / 千 input tokens（对应 $3/1M） */
export const DEFAULT_AI_TOKEN_INPUT_USD_PER_1K = 0.003;
/** 美元 / 千 completion tokens（对应 $15/1M） */
export const DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K = 0.015;

function parseNonNegativeFloat(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** 是否显式配置了分列单价（任一） */
export function hasExplicitSplitPricingEnv(): boolean {
  return Boolean(
    process.env.AI_TOKEN_INPUT_USD_PER_1K?.trim() || process.env.AI_TOKEN_COMPLETION_USD_PER_1K?.trim(),
  );
}

/**
 * 估算美元成本（含缓存输入 token，与输入同档单价）。
 * - 分列模式：`(prompt + cachedPrompt) / 1000 * inputRate + completion / 1000 * outputRate`
 * - 单一单价：`(prompt + cachedPrompt + completion) / 1000 * blended`
 */
export function estimateUsdForPromptCompletionWithCache(
  promptTokens: number,
  completionTokens: number,
  cachedPromptTokens: number,
): number {
  const p = Math.max(0, Math.round(promptTokens));
  const c = Math.max(0, Math.round(completionTokens));
  const cp = Math.max(0, Math.round(cachedPromptTokens));

  if (hasExplicitSplitPricingEnv()) {
    const inRaw = parseNonNegativeFloat(process.env.AI_TOKEN_INPUT_USD_PER_1K);
    const outRaw = parseNonNegativeFloat(process.env.AI_TOKEN_COMPLETION_USD_PER_1K);
    const inRate = inRaw ?? DEFAULT_AI_TOKEN_INPUT_USD_PER_1K;
    const outRate = outRaw ?? DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K;
    return ((p + cp) / 1000) * inRate + (c / 1000) * outRate;
  }

  const blended = parseNonNegativeFloat(process.env.AI_TOKEN_USD_PER_1K);
  if (blended != null) {
    return ((p + cp + c) / 1000) * blended;
  }

  return (
    ((p + cp) / 1000) * DEFAULT_AI_TOKEN_INPUT_USD_PER_1K + (c / 1000) * DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K
  );
}

/**
 * 估算美元成本（无缓存输入分项时 cached=0）。
 * - 若单独设置了 AI_TOKEN_INPUT_USD_PER_1K 或 AI_TOKEN_COMPLETION_USD_PER_1K：分列计价，未写的一侧用图示默认值。
 * - 否则若设置了 AI_TOKEN_USD_PER_1K：按合计 tokens 单一单价（兼容旧配置）。
 * - 否则：图示默认分列（0.003 / 0.015 每千 tokens）。
 */
export function estimateUsdForPromptCompletion(promptTokens: number, completionTokens: number): number {
  return estimateUsdForPromptCompletionWithCache(promptTokens, completionTokens, 0);
}

export type AdminPricingSnapshot = {
  mode: "split" | "blended";
  /** 当前生效：美元/千 input */
  inputUsdPer1k: number;
  /** 当前生效：美元/千 completion */
  completionUsdPer1k: number;
  /** 仅 blended 模式时有值 */
  blendedUsdPer1k: number | null;
  /** 图示参考文案 */
  referenceNote: string;
};

export function getAdminPricingSnapshot(): AdminPricingSnapshot {
  const ref =
    "参考 WolfAI 控制台「按量计费」：输入 $3/1M、补全 $15/1M → AI_TOKEN_INPUT_USD_PER_1K=0.003、AI_TOKEN_COMPLETION_USD_PER_1K=0.015（美元/千 tokens）。";

  if (hasExplicitSplitPricingEnv()) {
    const inRaw = parseNonNegativeFloat(process.env.AI_TOKEN_INPUT_USD_PER_1K);
    const outRaw = parseNonNegativeFloat(process.env.AI_TOKEN_COMPLETION_USD_PER_1K);
    return {
      mode: "split",
      inputUsdPer1k: inRaw ?? DEFAULT_AI_TOKEN_INPUT_USD_PER_1K,
      completionUsdPer1k: outRaw ?? DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K,
      blendedUsdPer1k: null,
      referenceNote: ref,
    };
  }

  const blended = parseNonNegativeFloat(process.env.AI_TOKEN_USD_PER_1K);
  if (blended != null) {
    return {
      mode: "blended",
      inputUsdPer1k: DEFAULT_AI_TOKEN_INPUT_USD_PER_1K,
      completionUsdPer1k: DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K,
      blendedUsdPer1k: blended,
      referenceNote:
        "当前使用 AI_TOKEN_USD_PER_1K 对「输入+补全」合计 tokens 单一计价；与分列图示不一致时可改成分列环境变量或删除此项以使用默认分列。",
    };
  }

  return {
    mode: "split",
    inputUsdPer1k: DEFAULT_AI_TOKEN_INPUT_USD_PER_1K,
    completionUsdPer1k: DEFAULT_AI_TOKEN_COMPLETION_USD_PER_1K,
    blendedUsdPer1k: null,
    referenceNote: ref,
  };
}
