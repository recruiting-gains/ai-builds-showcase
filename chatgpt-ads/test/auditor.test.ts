import { describe, expect, it } from "vitest";

import {
  auditCampaigns,
  parseCampaignRows,
  parsePastedText,
  type CampaignRow,
} from "../lib/auditor";

function campaign(overrides: Partial<CampaignRow>): CampaignRow {
  return {
    name: "Campaign",
    spend: 100,
    clicks: 50,
    impressions: 5_000,
    conversions: 5,
    roas: 2,
    ctr: 1,
    cpc: 2,
    ...overrides,
  };
}

describe("auditCampaigns", () => {
  it("never calls an at-risk or below-threshold campaign a winner", () => {
    const result = auditCampaigns("Meta Ads", [
      campaign({ name: "Low CTR", roas: 8, ctr: 0.4, cpc: 1 }),
      campaign({ name: "High CPC", roas: 7, ctr: 2, cpc: 5 }),
      campaign({ name: "Zero CTR", roas: 6, clicks: 0, impressions: 5_000, ctr: 0, cpc: 0 }),
      campaign({ name: "Low ROAS", spend: 500, roas: 1, ctr: 2, cpc: 1 }),
      campaign({ name: "Not Meaningful", spend: 50, roas: 1.99, ctr: 2, cpc: 1 }),
      campaign({ name: "Qualified Winner", roas: 3, ctr: 1.2, cpc: 2 }),
      campaign({ name: "Qualified Without Optional Metrics", roas: 2.5, clicks: 0, impressions: 0, ctr: 0, cpc: 0 }),
    ]);

    expect(result.spendAtRisk.campaigns.map(({ name }) => name)).toEqual([
      "Low CTR",
      "High CPC",
      "Zero CTR",
      "Low ROAS",
    ]);
    expect(result.winningAds.map(({ name }) => name)).toEqual([
      "Qualified Winner",
      "Qualified Without Optional Metrics",
    ]);
    expect(result.optimizationPlan.join(" ")).not.toContain("Low CTR");
    expect(result.optimizationPlan.join(" ")).not.toContain("High CPC");
    expect(result.optimizationPlan.join(" ")).not.toContain("Zero CTR");
    expect(result.optimizationPlan.join(" ")).not.toContain("Low ROAS");
    expect(result.optimizationPlan.join(" ")).not.toContain("Not Meaningful");
    expect(result.optimizationPlan.join(" ")).toContain("Qualified Winner");
  });

  it("computes ROAS by spend weight and CTR/CPC from totals", () => {
    const result = auditCampaigns("Google Ads", [
      campaign({ name: "Large", spend: 900, roas: 1, clicks: 40, impressions: 1_500 }),
      campaign({ name: "Small", spend: 100, roas: 9, clicks: 10, impressions: 500 }),
    ]);

    expect(result.totalSpend).toBe(1_000);
    expect(result.avgRoas).toBe(1.8);
    expect(result.avgCtr).toBe(2.5);
    expect(result.avgCpc).toBe(20);
  });

  it("does not produce a scaling action when every campaign is a loser", () => {
    const result = auditCampaigns("Meta Ads", [
      campaign({ name: "Weak return", spend: 400, roas: 0.9 }),
      campaign({ name: "Weak engagement", roas: 4, ctr: 0.2 }),
    ]);

    expect(result.winningAds).toEqual([]);
    expect(result.optimizationPlan.some((action) => /increase budget|scale/i.test(action))).toBe(false);
  });

  it("normalizes negative and non-finite metrics without contaminating totals", () => {
    const result = auditCampaigns("TikTok Ads", [
      campaign({
        name: "Invalid metrics",
        spend: -500,
        clicks: Number.NEGATIVE_INFINITY,
        impressions: Number.POSITIVE_INFINITY,
        conversions: Number.NaN,
        roas: -2,
        ctr: Number.NaN,
        cpc: Number.POSITIVE_INFINITY,
      }),
      campaign({ name: "Valid metrics", spend: 200, clicks: 100, impressions: 10_000, conversions: 4, roas: 3 }),
    ]);

    expect(result.totalSpend).toBe(200);
    expect(result.totalClicks).toBe(100);
    expect(result.totalImpressions).toBe(10_000);
    expect(result.totalConversions).toBe(4);
    expect(result.avgRoas).toBe(3);
    expect(result.avgCtr).toBe(1);
    expect(result.avgCpc).toBe(2);
    expect(Object.values(result).some((value) => typeof value === "number" && !Number.isFinite(value))).toBe(false);
  });

  it("returns a stable empty result using the spend-at-risk contract", () => {
    const result = auditCampaigns("Meta Ads", []);

    expect(result).toMatchObject({
      totalSpend: 0,
      avgRoas: 0,
      avgCtr: 0,
      avgCpc: 0,
      spendAtRisk: { amount: 0, campaigns: [] },
      winningAds: [],
      campaignCount: 0,
    });
    expect("wastedSpend" in result).toBe(false);
  });
});

describe("campaign parsing", () => {
  it("parses quoted CSV fields and derives missing metrics from totals", () => {
    const pasted = parsePastedText([
      "Campaign Name,Amount Spent,Clicks,Impressions,Conversions,Revenue",
      '"Brand, Search","$1,200",120,6000,12,"$3,600"',
    ].join("\n"));
    const parsed = parseCampaignRows(pasted);

    expect(parsed).toEqual([
      {
        name: "Brand, Search",
        spend: 1_200,
        clicks: 120,
        impressions: 6_000,
        conversions: 12,
        roas: 3,
        ctr: 2,
        cpc: 10,
      },
    ]);
  });

  it("accepts common aliases, percentages and currency while clamping negatives", () => {
    const parsed = parseCampaignRows([
      {
        "Ad set name": "Retargeting",
        Cost: "$250.50",
        Click: "50",
        Impr: "5,000",
        Purchases: "-4",
        "Return on ad spend": "2.4x",
        "CTR (%)": "1%",
        "Avg CPC": "$5.01",
      },
    ]);

    expect(parsed[0]).toMatchObject({
      name: "Retargeting",
      spend: 250.5,
      clicks: 50,
      impressions: 5_000,
      conversions: 0,
      roas: 2.4,
      ctr: 1,
      cpc: 5.01,
    });
  });

  it("recognizes representative Google, Meta, TikTok, and LinkedIn export headings", () => {
    const [google, meta, tiktok, linkedin] = parseCampaignRows([
      {
        Campaign: "Google Search",
        "Cost (USD)": "$100",
        Clicks: 50,
        Impressions: 1_000,
        Conversions: 5,
        "Conv. value": "$300",
        CTR: "5%",
        "Avg. CPC": "$2",
      },
      {
        "Campaign name": "Meta Retargeting",
        "Amount spent (USD)": "$200",
        "Link clicks": 80,
        Impressions: 4_000,
        Results: 8,
        "Purchase ROAS (return on ad spend)": "2.8x",
        "CTR (all)": "2%",
        "CPC (all)": "$2.50",
      },
      {
        Campaign_Name: "TikTok Prospecting",
        "Total cost": "$300",
        "Clicks (destination)": 120,
        Impressions: 8_000,
        Purchases: 12,
        "Total ROAS": "2.4x",
        "CTR (destination)": "1.5%",
        "Average CPC": "$2.50",
      },
      {
        "Campaign Name": "LinkedIn Leads",
        "Total Spent": "$400",
        Clicks: 100,
        Impressions: 5_000,
        "Total Conversions": 10,
        "Return on Ad Spend (ROAS)": "2.2x",
        "Click-Through Rate (CTR)": "2%",
        "Average Cost Per Click": "$4",
      },
    ]);

    expect(google).toMatchObject({ name: "Google Search", spend: 100, clicks: 50, roas: 3, ctr: 5, cpc: 2 });
    expect(meta).toMatchObject({ name: "Meta Retargeting", spend: 200, clicks: 80, roas: 2.8, ctr: 2, cpc: 2.5 });
    expect(tiktok).toMatchObject({ name: "TikTok Prospecting", spend: 300, clicks: 120, roas: 2.4, ctr: 1.5, cpc: 2.5 });
    expect(linkedin).toMatchObject({ name: "LinkedIn Leads", spend: 400, clicks: 100, roas: 2.2, ctr: 2, cpc: 4 });
  });

  it("drops rows that contain no usable activity", () => {
    expect(parseCampaignRows([
      { Campaign: "Empty", Spend: -10, Clicks: "NaN", Impressions: Number.POSITIVE_INFINITY },
    ])).toEqual([]);
  });
});
