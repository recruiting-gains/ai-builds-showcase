import { NextRequest, NextResponse } from "next/server";
import { auditCampaigns, parseCampaignRows, parsePastedText } from "@/lib/auditor";

// Edge runtime keeps this route compatible with Cloudflare Pages (via
// @cloudflare/next-on-pages) as well as Vercel's Edge/Node runtimes.
export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const platform: string = typeof body?.platform === "string" && body.platform ? body.platform : "Google Ads";
    const data = body?.data;

    let rawRows: Record<string, unknown>[] = [];

    if (Array.isArray(data)) {
      rawRows = data as Record<string, unknown>[];
    } else if (typeof data === "string") {
      rawRows = parsePastedText(data);
    }

    const campaigns = parseCampaignRows(rawRows);
    const result = auditCampaigns(platform, campaigns);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Audit error:", error);
    return NextResponse.json({ error: "Unable to process audit request." }, { status: 400 });
  }
}
