// Real, deterministic ad-audit engine. No AI / LLM calls, no API keys required.
// Parses campaign performance data and computes wasted spend, winning ads,
// and an optimization action plan using pure math/heuristics.

export interface CampaignRow {
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number;
  ctr: number;
  cpc: number;
}

export interface WastedCampaign {
  name: string;
  spend: number;
  reason: string;
}

export interface WastedSpend {
  amount: number;
  campaigns: WastedCampaign[];
  reason: string;
}

export interface WinningAd {
  name: string;
  roas: number;
  reason: string;
}

export interface AuditResult {
  platform: string;
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  avgRoas: number;
  avgCtr: number;
  avgCpc: number;
  wastedSpend: WastedSpend;
  winningAds: WinningAd[];
  optimizationPlan: string[];
  summary: string;
  campaignCount: number;
}

const NUMERIC_KEY_ALIASES: Record<keyof Omit<CampaignRow, "name">, string[]> = {
  spend: ["spend", "cost", "amount spent", "ad spend"],
  clicks: ["clicks", "click"],
  impressions: ["impressions", "impr", "impr."],
  conversions: ["conversions", "conversion", "results", "purchases"],
  roas: ["roas", "return on ad spend"],
  ctr: ["ctr", "click through rate", "click-through rate", "ctr (%)", "ctr(%)"],
  cpc: ["cpc", "cost per click", "cpc ($)", "avg cpc"],
};

const NAME_KEY_ALIASES = ["name", "campaign", "campaign name", "ad", "ad name", "ad set", "ad set name"];

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[$,%\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function findValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedRow: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    normalizedRow[normalizeKey(key)] = row[key];
  }
  for (const alias of aliases) {
    if (alias in normalizedRow) return normalizedRow[alias];
  }
  return undefined;
}

/**
 * Normalizes an arbitrary array of row objects (from CSV or pasted data)
 * into structured CampaignRow entries, deriving missing metrics where possible.
 */
export function parseCampaignRows(rows: Record<string, unknown>[]): CampaignRow[] {
  return rows
    .map((row, index) => {
      const name = String(findValue(row, NAME_KEY_ALIASES) ?? `Campaign ${index + 1}`).trim();
      const spend = toNumber(findValue(row, NUMERIC_KEY_ALIASES.spend));
      const clicks = toNumber(findValue(row, NUMERIC_KEY_ALIASES.clicks));
      const impressions = toNumber(findValue(row, NUMERIC_KEY_ALIASES.impressions));
      const conversions = toNumber(findValue(row, NUMERIC_KEY_ALIASES.conversions));

      let roas = toNumber(findValue(row, NUMERIC_KEY_ALIASES.roas));
      let ctr = toNumber(findValue(row, NUMERIC_KEY_ALIASES.ctr));
      let cpc = toNumber(findValue(row, NUMERIC_KEY_ALIASES.cpc));

      const revenue = toNumber(findValue(row, ["revenue", "conversion value", "sales"]));
      if (!roas && spend > 0 && revenue > 0) {
        roas = revenue / spend;
      }
      if (!ctr && impressions > 0) {
        ctr = (clicks / impressions) * 100;
      }
      if (!cpc && clicks > 0) {
        cpc = spend / clicks;
      }

      return { name, spend, clicks, impressions, conversions, roas, ctr, cpc };
    })
    .filter((row) => row.name && (row.spend > 0 || row.clicks > 0 || row.impressions > 0));
}

/**
 * Parses simple pasted text data (CSV-like or whitespace separated) into rows.
 */
export function parsePastedText(text: string): Record<string, unknown>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : /\s{2,}/;
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((v) => v.trim());
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Core audit engine. Computes wasted spend, winning ads and an optimization
 * plan purely from campaign metrics — no external AI calls involved.
 */
export function auditCampaigns(platform: string, rows: CampaignRow[]): AuditResult {
  if (rows.length === 0) {
    return {
      platform,
      totalSpend: 0,
      totalClicks: 0,
      totalImpressions: 0,
      totalConversions: 0,
      avgRoas: 0,
      avgCtr: 0,
      avgCpc: 0,
      wastedSpend: { amount: 0, campaigns: [], reason: "No campaign data provided." },
      winningAds: [],
      optimizationPlan: [
        "Upload a CSV or paste campaign data with columns like spend, clicks, impressions, conversions, roas, ctr, and cpc to get a real audit.",
      ],
      summary: "No data to audit yet. Add campaign data to get started.",
      campaignCount: 0,
    };
  }

  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const totalConversions = rows.reduce((sum, r) => sum + r.conversions, 0);
  const avgRoas = rows.reduce((sum, r) => sum + r.roas, 0) / rows.length;
  const avgCtr = rows.reduce((sum, r) => sum + r.ctr, 0) / rows.length;
  const avgCpc = rows.reduce((sum, r) => sum + r.cpc, 0) / rows.length;

  // Wasted spend rule: low ROAS with meaningful spend, low CTR, or high CPC.
  const wastedCampaigns: WastedCampaign[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    if (row.roas < 1.2 && row.spend > 100) reasons.push(`ROAS of ${round(row.roas)}x on $${round(row.spend)} spend`);
    if (row.ctr > 0 && row.ctr < 0.8) reasons.push(`low CTR of ${round(row.ctr)}%`);
    if (row.cpc > 3) reasons.push(`high CPC of $${round(row.cpc)}`);

    if (reasons.length > 0) {
      wastedCampaigns.push({ name: row.name, spend: round(row.spend), reason: reasons.join("; ") });
    }
  }
  const wastedAmount = wastedCampaigns.reduce((sum, c) => sum + c.spend, 0);

  // Winning ads: top 3 by ROAS descending.
  const winningAds: WinningAd[] = [...rows]
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 3)
    .map((row) => ({
      name: row.name,
      roas: round(row.roas),
      reason: `Delivers ${round(row.roas)}x ROAS with ${round(row.ctr)}% CTR and $${round(row.cpc)} CPC — scale this ad.`,
    }));

  // Optimization plan: generate up to 5 concrete actions based on the data.
  const optimizationPlan: string[] = [];
  if (wastedCampaigns.length > 0) {
    optimizationPlan.push(
      `Pause or rework ${wastedCampaigns.length} underperforming campaign${wastedCampaigns.length > 1 ? "s" : ""} wasting $${round(wastedAmount)} in spend.`
    );
  }
  if (winningAds.length > 0) {
    optimizationPlan.push(`Increase budget on top performer "${winningAds[0].name}" (${winningAds[0].roas}x ROAS) by 20-30%.`);
  }
  if (avgCtr < 1) {
    optimizationPlan.push(`Refresh ad creative and copy — average CTR is ${round(avgCtr)}%, below the 1% healthy benchmark.`);
  }
  if (avgCpc > 2) {
    optimizationPlan.push(`Tighten audience targeting to reduce average CPC from $${round(avgCpc)} toward $2 or lower.`);
  }
  if (avgRoas < 2) {
    optimizationPlan.push(`Test new offers or landing pages to lift average ROAS above 2x (currently ${round(avgRoas)}x).`);
  }
  optimizationPlan.push("Re-run this audit weekly to track spend efficiency trends over time.");
  while (optimizationPlan.length < 5) {
    optimizationPlan.push("Review audience overlap and consolidate duplicate ad sets to cut wasted impressions.");
  }

  const summary = `Audited ${rows.length} ${platform} campaign${rows.length > 1 ? "s" : ""} totaling $${round(
    totalSpend
  )} in spend. Found $${round(wastedAmount)} in wasted spend across ${wastedCampaigns.length} campaign${
    wastedCampaigns.length === 1 ? "" : "s"
  }, and identified ${winningAds.length} winning ad${winningAds.length === 1 ? "" : "s"} to scale.`;

  return {
    platform,
    totalSpend: round(totalSpend),
    totalClicks,
    totalImpressions,
    totalConversions,
    avgRoas: round(avgRoas),
    avgCtr: round(avgCtr),
    avgCpc: round(avgCpc),
    wastedSpend: {
      amount: round(wastedAmount),
      campaigns: wastedCampaigns,
      reason: "Campaigns with ROAS below 1.2x and spend over $100, CTR under 0.8%, or CPC above $3.",
    },
    winningAds,
    optimizationPlan: optimizationPlan.slice(0, 5),
    summary,
    campaignCount: rows.length,
  };
}
