import { listArticles } from "@/lib/db";
import { buildWeeklyReview } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default function WeeklyPage() {
  const review = buildWeeklyReview(listArticles());
  const { comparedToLast } = review;

  return (
    <>
      <header className="app-header">
        <h1>每周回顾</h1>
        <span className="sub">{review.weekStart} 至 {review.weekEnd}</span>
      </header>

      <section className="kpi-grid">
        <div className="kpi">
          <div className="label">本周读完</div>
          <div className="value">{review.totalRead}<span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>篇</span></div>
        </div>
        <div className="kpi">
          <div className="label">阅读时长</div>
          <div className="value">{review.totalMinutes}<span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>分钟</span></div>
        </div>
        <div className="kpi">
          <div className="label">较上周篇数</div>
          <div className="value">
            <DeltaBadge value={comparedToLast.deltaArticles} unit="篇" />
          </div>
        </div>
        <div className="kpi">
          <div className="label">较上周时长</div>
          <div className="value">
            <DeltaBadge value={comparedToLast.deltaMinutes} unit="分钟" />
          </div>
        </div>
      </section>

      <div className="card">
        <h2>本周覆盖主题</h2>
        {review.themes.length === 0 ? (
          <p className="muted-link">本周还没有完成的文章。</p>
        ) : (
          <div className="theme-list">
            {review.themes.map(({ theme, count }) => (
              <span key={theme} className="chip">{theme} · {count}</span>
            ))}
          </div>
        )}
      </div>

      {comparedToLast.newThemes.length > 0 && (
        <div className="card">
          <h2>较上周新增的主题</h2>
          <div className="theme-list">
            {comparedToLast.newThemes.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>本周关键知识点</h2>
        {review.topKnowledgeTags.length === 0 ? (
          <p className="muted-link">完成更多文章后，会在这里看到关键词提炼。</p>
        ) : (
          <div className="theme-list">
            {review.topKnowledgeTags.map((tag) => (
              <span key={tag} className="chip">#{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>本周复盘建议</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
          {generateAdvice(review)}
        </p>
      </div>
    </>
  );
}

function DeltaBadge({ value, unit }: { value: number; unit: string }) {
  const kind = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <span className={`delta ${kind}`}>{arrow} {Math.abs(value)} {unit}</span>
  );
}

function generateAdvice(review: ReturnType<typeof buildWeeklyReview>): string {
  const lines: string[] = [];
  if (review.totalRead === 0) {
    return "本周还没有完成的阅读。建议先把今日待读清掉，再补充新链接。";
  }
  if (review.comparedToLast.deltaArticles > 0) {
    lines.push(`比上周多读了 ${review.comparedToLast.deltaArticles} 篇，继续保持节奏。`);
  } else if (review.comparedToLast.deltaArticles < 0) {
    lines.push(`比上周少读了 ${Math.abs(review.comparedToLast.deltaArticles)} 篇，可以把每天的截止日期调早一些。`);
  } else {
    lines.push("本周和上周节奏一致。");
  }
  if (review.comparedToLast.newThemes.length > 0) {
    lines.push(`新接触的主题：${review.comparedToLast.newThemes.join("、")}。`);
  }
  if (review.themes[0]) {
    lines.push(`主修方向是「${review.themes[0].theme}」，下周可以围绕它做一次小总结。`);
  }
  return lines.join(" ");
}
