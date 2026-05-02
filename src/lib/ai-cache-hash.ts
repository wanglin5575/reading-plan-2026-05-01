import { createHash } from "node:crypto";

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** 与 `generateReadModalSummary` 中的正文截断规则一致 */
export function readModalInputHash(title: string, url: string, sourceText: string): string {
  const maxInput =
    Math.min(parseInt(process.env.AI_SUMMARY_MAX_INPUT_CHARS?.trim() || "12000", 10) || 12000, 60000) ||
    12000;
  const bodyText = sourceText.replace(/\s+/g, " ").trim().slice(0, maxInput);
  return sha256Hex(
    JSON.stringify({
      v: 1,
      title: title.slice(0, 400),
      url,
      t: bodyText,
    }),
  );
}

export function enrichArticleInputHash(parts: {
  title: string;
  url: string;
  bodyText: string;
  browseQualify: boolean;
  scrapeAuthorHint: string;
  publishedIsoHint: string;
}): string {
  return sha256Hex(JSON.stringify({ v: 1, ...parts }));
}

/** 与 `translateWithOpenAiCompatibleGateway` 内对正文规范化一致 */
export function translateLlmInputHash(normalizedText: string): string {
  return sha256Hex(JSON.stringify({ v: 1, kind: "translate_llm", t: normalizedText }));
}
