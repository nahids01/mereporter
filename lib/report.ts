// Monthly report builder: uses ONLY stored/live rows supplied by the caller.
// Anything missing is reported as no-data and excluded from averages.
// Nothing here invents a rank, traffic figure, backlink, location or
// "connected" state. SERP and GBP are always kept separate.

export type KeywordRow = {
  id: string;
  project_id: string;
  kind: 'serp' | 'gbp';
  keyword: string;
  // A null rank means "no data" (check failed / never run), NOT "not ranking".
  rank: number | null;
  checked_at: string | null;
};

export type MetricImportRow = {
  id: string;
  project_id: string;
  source: 'gsc' | 'ga4' | 'bing' | 'csv';
  metric: string;
  value: number | null;
  imported_at: string | null;
};

export type ReportSection = {
  name: string;
  status: 'data' | 'no-data';
  rows: unknown[];
  note: string;
};

export type MonthlyReport = {
  projectId: string;
  month: string; // YYYY-MM
  sections: ReportSection[];
  averages: { serpAverageRank: number | null; gbpAverageRank: number | null };
  isPartial: boolean;
};

function averageRank(rows: KeywordRow[]): number | null {
  const ranks = rows.map((r) => r.rank).filter((r): r is number => r !== null);
  if (ranks.length === 0) return null;
  return ranks.reduce((a, b) => a + b, 0) / ranks.length;
}

export function buildMonthlyReport(
  projectId: string,
  month: string,
  keywords: KeywordRow[],
  metrics: MetricImportRow[],
): MonthlyReport {
  const serp = keywords.filter((k) => k.kind === 'serp');
  const gbp = keywords.filter((k) => k.kind === 'gbp');
  const sections: ReportSection[] = [
    {
      name: 'SERP rankings',
      status: serp.some((k) => k.rank !== null) ? 'data' : 'no-data',
      rows: serp,
      note: serp.some((k) => k.rank !== null)
        ? 'Ranks shown are only those actually recorded; null ranks are no-data and excluded from the average.'
        : 'No SERP rank data for this month. This section is intentionally empty — no rank was estimated.',
    },
    {
      name: 'GBP / Local grid',
      status: gbp.some((k) => k.rank !== null) ? 'data' : 'no-data',
      rows: gbp,
      note: gbp.some((k) => k.rank !== null)
        ? 'Grid ranks shown are only those actually recorded; null ranks are no-data and excluded from the average.'
        : 'No GBP grid data for this month. This section is intentionally empty — no grid rank was estimated.',
    },
    {
      name: 'Search / analytics imports (GSC, GA4, Bing, CSV)',
      status: metrics.length > 0 ? 'data' : 'no-data',
      rows: metrics,
      note: metrics.length > 0
        ? 'Imported rows only, with their source and import date. A source marked not-connected contributes no rows.'
        : 'No imported data for this month. Integrations that are not connected contribute no data and are not shown as connected.',
    },
  ];
  return {
    projectId,
    month,
    sections,
    averages: { serpAverageRank: averageRank(serp), gbpAverageRank: averageRank(gbp) },
    isPartial: sections.some((s) => s.status === 'no-data'),
  };
}
