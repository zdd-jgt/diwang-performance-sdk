import type { DashboardSlowPage } from "@diwang/contracts";

interface SlowPageRankingProps {
  pages: DashboardSlowPage[];
}

const RATING_LABELS = {
  good: "良好",
  "needs-improvement": "待改进",
  poor: "较差"
} as const;

export function rankSlowPages(
  pages: DashboardSlowPage[]
): DashboardSlowPage[] {
  return [...pages]
    .sort((left, right) => right.lcpP95 - left.lcpP95)
    .slice(0, 10);
}

function displayPath(value: string): { host: string; path: string } {
  try {
    const url = new URL(value);
    return {
      host: url.host,
      path: `${url.pathname}${url.search}`
    };
  } catch {
    return { host: "invalid-url", path: value };
  }
}

export function SlowPageRanking({ pages }: SlowPageRankingProps) {
  const rankedPages = rankSlowPages(pages);
  const maximum = rankedPages[0]?.lcpP95 ?? 1;

  return (
    <div className="slow-pages">
      <div className="slow-pages__summary">
        <div>
          <span>排名依据</span>
          <strong>LCP P95 / 前 10 名</strong>
        </div>
        <b>{rankedPages.length.toString().padStart(2, "0")}</b>
      </div>

      <ol className="slow-pages__list">
        {rankedPages.map((page, index) => {
          const location = displayPath(page.pageUrl);
          return (
            <li key={page.pageUrl}>
              <div className="slow-page__rank">
                {(index + 1).toString().padStart(2, "0")}
              </div>
              <div className="slow-page__identity">
                <strong title={location.path}>{location.path}</strong>
                <span>{location.host}</span>
                <div aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(8, (page.lcpP95 / maximum) * 100)}%`
                    }}
                  />
                </div>
              </div>
              <div className="slow-page__visits">
                <span>访问量</span>
                <strong>{page.visits.toLocaleString("zh-CN")}</strong>
              </div>
              <div className={`slow-page__metric rating--${page.rating}`}>
                <span>{RATING_LABELS[page.rating]}</span>
                <strong>{(page.lcpP95 / 1_000).toFixed(2)}s</strong>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
