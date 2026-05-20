/** 卡片/摘要前的「AI生成：」；读取来源详情仅放在 title 悬停提示 */
export function AiGeneratedInlineLabel({ readLead }: { readLead?: string }) {
  const lead = readLead?.trim();
  return (
    <span className="browse-hit-ai-inline" title={lead ? `模型读取：${lead}` : undefined}>
      AI生成：
    </span>
  );
}
