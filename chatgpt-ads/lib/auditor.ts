// Real, deterministic ad-audit engine. No AI / LLM calls, no API keys required.
// Parses campaign performance data and computes spend at risk, winning ads,
// and an optimization action plan using pure math/heuristics.

import { MAX_METRIC_VALUE } from "./input-validation";

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

export interface AtRiskCampaign {
  name: string;
  spend: number;
  reason: string;
}

export interface SpendAtRisk {
  amount: number;
  campaigns: AtRiskCampaign[];
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
  spendAtRisk: SpendAtRisk;
  winningAds: WinningAd[];
  optimizationPlan: string[];
  summary: string;
  campaignCount: number;
}

const NUMERIC_KEY_ALIASES: Record<keyof Omit<CampaignRow, "name">, string[]> = {
  spend: ["spend", "cost", "amount spent", "ad spend", "total cost", "total spend", "total spent"],
  clicks: [
    "clicks",
    "click",
    "all clicks",
    "clicks (all)",
    "link clicks",
    "outbound clicks",
    "destination clicks",
    "clicks (destination)",
  ],
  impressions: ["impressions", "impression", "impr", "impr."],
  conversions: [
    "conversions",
    "conversion",
    "total conversions",
    "results",
    "purchases",
    "purchase",
    "website purchases",
  ],
  roas: [
    "roas",
    "total roas",
    "return on ad spend",
    "return on ad spend (roas)",
    "purchase roas (return on ad spend)",
    "website purchase roas",
  ],
  ctr: [
    "ctr",
    "ctr (%)",
    "ctr(%)",
    "ctr (all)",
    "ctr (destination)",
    "link ctr",
    "click through rate",
    "click-through rate",
    "click-through rate (ctr)",
    "ctr (link click-through rate)",
  ],
  cpc: [
    "cpc",
    "cpc ($)",
    "cpc (all)",
    "avg cpc",
    "avg. cpc",
    "average cpc",
    "cost per click",
    "average cost per click",
    "average cost-per-click",
    "cost per link click",
  ],
};

const NAME_KEY_ALIASES = [
  "name",
  "campaign",
  "campaign name",
  "campaign title",
  "ad",
  "ad name",
  "ad set",
  "ad set name",
  "ad group",
  "ad group name",
];

const REVENUE_KEY_ALIASES = [
  "revenue",
  "sales",
  "conversion value",
  "total conversion value",
  "all conversion value",
  "conv. value",
  "purchase conversion value",
  "website purchase conversion value",
];

export class MetricOutOfRangeError extends RangeError {
  constructor() {
    super("A campaign number is too large to process.");
    this.name = "MetricOutOfRangeError";
  }
}

function normalizeMetric(value: number): number {
  if (Number.isFinite(value) && value > MAX_METRIC_VALUE) {
    throw new MetricOutOfRangeError();
  }
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return normalizeMetric(value);
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[$,%\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return normalizeMetric(parsed);
}

function normalizeKey(key: string): string {
  return key
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedRow: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeKey(key);
    normalizedRow[normalizedKey] = row[key];

    // Currency suffixes vary by account locale (for example, "Amount spent
    // (USD)"). Retain the exact key and also expose its currency-neutral form.
    const withoutCurrency = normalizedKey.replace(/\s*\((?:usd|eur|gbp|cad|aud|\$)\)$/, "");
    if (withoutCurrency !== normalizedKey) normalizedRow[withoutCurrency] = row[key];
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
      const rawName = String(findValue(row, NAME_KEY_ALIASES) ?? "").trim();
      const name = rawName || `Campaign ${index + 1}`;
      const spend = toNumber(findValue(row, NUMERIC_KEY_ALIASES.spend));
      const clicks = toNumber(findValue(row, NUMERIC_KEY_ALIASES.clicks));
      const impressions = toNumber(findValue(row, NUMERIC_KEY_ALIASES.impressions));
      const conversions = toNumber(findValue(row, NUMERIC_KEY_ALIASES.conversions));

      let roas = toNumber(findValue(row, NUMERIC_KEY_ALIASES.roas));
      let ctr = toNumber(findValue(row, NUMERIC_KEY_ALIASES.ctr));
      let cpc = toNumber(findValue(row, NUMERIC_KEY_ALIASES.cpc));

      const revenue = toNumber(findValue(row, REVENUE_KEY_ALIASES));
      if (roas === 0 && spend > 0 && revenue > 0) {
        roas = revenue / spend;
      }
      if (ctr === 0 && impressions > 0) {
        ctr = (clicks / impressions) * 100;
      }
      if (cpc === 0 && clicks > 0) {
        cpc = spend / clicks;
      }

      return { name, spend, clicks, impressions, conversions, roas, ctr, cpc };
    })
    .filter((row) => row.spend > 0 || row.clicks > 0 || row.impressions > 0);
}

function splitDelimitedLine(line: string, delimiter: string | RegExp): string[] {
  if (delimiter instanceof RegExp) {
    return line.split(delimiter).map((value) => value.trim());
  }
  if (delimiter === "\t") {
    return line.split(delimiter).map((value) => value.trim());
  }

  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

/**
 * Parses simple pasted text data (CSV-like or whitespace separated) into rows.
 * Quoted CSV fields are supported, including escaped double quotes.
 */
export function parsePastedText(text: string): Record<string, unknown>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : /\s{2,}/;
  const headers = splitDelimitedLine(lines[0], delimiter);
  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeCampaignRow(row: CampaignRow, index: number): CampaignRow {
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : `Campaign ${index + 1}`;
  const spend = normalizeMetric(row.spend);
  const clicks = normalizeMetric(row.clicks);
  const impressions = normalizeMetric(row.impressions);
  let ctr = normalizeMetric(row.ctr);
  let cpc = normalizeMetric(row.cpc);

  if (ctr === 0 && impressions > 0) ctr = normalizeMetric((clicks / impressions) * 100);
  if (cpc === 0 && clicks > 0) cpc = normalizeMetric(spend / clicks);

  return {
    name,
    spend,
    clicks,
    impressions,
    conversions: normalizeMetric(row.conversions),
    roas: normalizeMetric(row.roas),
    ctr,
    cpc,
  };
}

function hasCtr(row: CampaignRow): boolean {
  return row.ctr > 0 || row.impressions > 0;
}

function hasCpc(row: CampaignRow): boolean {
  return row.cpc > 0 || row.clicks > 0;
}

function atRiskReasons(row: CampaignRow): string[] {
  const reasons: string[] = [];
  if (row.roas === 0 && row.spend > 100) {
    reasons.push(`ROAS was not supplied or could not be derived on $${round(row.spend)} spend`);
  } else if (row.roas < 1.2 && row.spend > 100) {
    reasons.push(`ROAS of ${round(row.roas)}x on $${round(row.spend)} spend`);
  }
  if (hasCtr(row) && row.ctr < 0.8) reasons.push(`low CTR of ${round(row.ctr)}%`);
  if (row.cpc > 3) reasons.push(`high CPC of $${round(row.cpc)}`);
  return reasons;
}

function winnerReason(row: CampaignRow): string {
  const details = [`${round(row.roas)}x ROAS`];
  details.push(row.ctr > 0 ? `${round(row.ctr)}% CTR` : "CTR not supplied");
  details.push(row.cpc > 0 ? `$${round(row.cpc)} CPC` : "CPC not supplied");
  return `${details.join(", ")} — meets the scaling guardrails.`;
}

/**
 * Core audit engine. Computes spend at risk, winning ads and an optimization
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
      spendAtRisk: { amount: 0, campaigns: [], reason: "No campaign data provided." },
      winningAds: [],
      optimizationPlan: [
        "Upload a CSV or paste campaign data with columns like spend, clicks, impressions, conversions, roas, ctr, and cpc to get a real audit.",
      ],
      summary: "No data to audit yet. Add campaign data to get started.",
      campaignCount: 0,
    };
  }

  const normalizedRows = rows.map(normalizeCampaignRow);
  const totalSpend = normalizedRows.reduce((sum, row) => sum + row.spend, 0);
  const totalClicks = normalizedRows.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = normalizedRows.reduce((sum, row) => sum + row.impressions, 0);
  const totalConversions = normalizedRows.reduce((sum, row) => sum + row.conversions, 0);
  const avgRoas = totalSpend > 0
    ? normalizedRows.reduce((sum, row) => sum + row.roas * row.spend, 0) / totalSpend
    : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const evaluatedRows = normalizedRows.map((row) => ({ row, reasons: atRiskReasons(row) }));
  const atRiskCampaigns: AtRiskCampaign[] = evaluatedRows
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ row, reasons }) => ({
      name: row.name,
      spend: round(row.spend),
      reason: reasons.join("; "),
    }));
  const spendAtRiskAmount = atRiskCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);

  // A winner must clear every supplied quality threshold and cannot also be at risk.
  const winningAds: WinningAd[] = evaluatedRows
    .filter(({ row, reasons }) =>
      reasons.length === 0
      && row.roas >= 2
      && (!hasCtr(row) || row.ctr >= 0.8)
      && (!hasCpc(row) || row.cpc <= 3)
    )
    .sort((a, b) => b.row.roas - a.row.roas)
    .slice(0, 3)
    .map(({ row }) => ({
      name: row.name,
      roas: round(row.roas),
      reason: winnerReason(row),
    }));

  const optimizationPlan: string[] = [];
  if (atRiskCampaigns.length > 0) {
    optimizationPlan.push(
      `Review or rework ${atRiskCampaigns.length} underperforming campaign${atRiskCampaigns.length > 1 ? "s" : ""} putting $${round(spendAtRiskAmount)} in spend at risk.`
    );
  }
  if (winningAds.length > 0) {
    optimizationPlan.push(
      `Review whether qualified top performer "${winningAds[0].name}" (${winningAds[0].roas}x ROAS) is ready for a controlled scaling test.`
    );
  }
  if (avgCtr < 1) {
    optimizationPlan.push(`Review creative and copy — overall CTR is ${round(avgCtr)}%, below this demo's 1% review point.`);
  }
  if (avgCpc > 2) {
    optimizationPlan.push(`Review audience targeting and bids — overall CPC is $${round(avgCpc)}, above this demo's $2 review point.`);
  }
  if (avgRoas < 2) {
    optimizationPlan.push(`Review offers and landing pages — spend-weighted ROAS is ${round(avgRoas)}x, below this demo's 2x review point.`);
  }
  optimizationPlan.push("Re-run this audit weekly to track spend efficiency trends over time.");

  const supportingChecks = [
    "Confirm conversion tracking and attribution settings before acting on the totals.",
    "Compare each campaign against its own goal, margin, audience, and funnel stage.",
    "Review audience overlap and duplicate ad sets that may be competing for the same impressions.",
  ];
  for (const check of supportingChecks) {
    if (optimizationPlan.length >= 5) break;
    optimizationPlan.push(check);
  }

  const summary = `Audited ${normalizedRows.length} ${platform} campaign${normalizedRows.length > 1 ? "s" : ""} totaling $${round(
    totalSpend
  )} in spend. Found $${round(spendAtRiskAmount)} in spend at risk across ${atRiskCampaigns.length} campaign${
    atRiskCampaigns.length === 1 ? "" : "s"
  }, and found ${winningAds.length} campaign${winningAds.length === 1 ? "" : "s"} that met every winner guardrail.`;

  return {
    platform,
    totalSpend: round(totalSpend),
    totalClicks: round(totalClicks),
    totalImpressions: round(totalImpressions),
    totalConversions: round(totalConversions),
    avgRoas: round(avgRoas),
    avgCtr: round(avgCtr),
    avgCpc: round(avgCpc),
    spendAtRisk: {
      amount: round(spendAtRiskAmount),
      campaigns: atRiskCampaigns,
      reason:
        "Campaign spend is marked for review when ROAS is missing or below 1.2x on more than $100, CTR is under 0.8%, or CPC is above $3. It is not a claim that every flagged dollar was lost.",
    },
    winningAds,
    optimizationPlan: optimizationPlan.slice(0, 5),
    summary,
    campaignCount: normalizedRows.length,
  };
}
