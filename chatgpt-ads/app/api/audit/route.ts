import { NextRequest, NextResponse } from "next/server";
import { auditCampaigns, parseCampaignRows, parsePastedText } from "@/lib/auditor";
import {
  isRecord,
  isSupportedPlatform,
  MAX_AUDIT_BODY_BYTES,
  MAX_PASTED_CHARACTERS,
  readLimitedText,
  RequestTooLargeError,
  validateRawRows,
} from "@/lib/input-validation";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "Send campaign data as JSON." }, 415);
    }

    const rawBody = await readLimitedText(request, MAX_AUDIT_BODY_BYTES);

    const body: unknown = JSON.parse(rawBody);
    if (!isRecord(body)) {
      return json({ error: "The campaign request is not valid." }, 400);
    }

    if (!isSupportedPlatform(body.platform)) {
      return json({ error: "Choose one of the supported ad platforms." }, 400);
    }

    const data = body.data;

    let rawRows: Record<string, unknown>[] = [];

    if (Array.isArray(data)) {
      const validation = validateRawRows(data);
      if (!validation.ok) return json({ error: validation.error }, 400);
      rawRows = validation.rows;
    } else if (typeof data === "string") {
      if (data.length > MAX_PASTED_CHARACTERS) {
        return json({ error: "The pasted campaign data is too large." }, 413);
      }
      rawRows = parsePastedText(data);
      const validation = validateRawRows(rawRows);
      if (!validation.ok) return json({ error: validation.error }, 400);
      rawRows = validation.rows;
    } else {
      return json({ error: "Upload a CSV or paste campaign data first." }, 400);
    }

    const campaigns = parseCampaignRows(rawRows);
    if (campaigns.length === 0) {
      return json({ error: "No usable campaign rows were found." }, 400);
    }

    const result = auditCampaigns(body.platform, campaigns);

    return json(result);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return json({ error: "The campaign request is too large." }, 413);
    }
    console.warn('{"event":"audit_request_rejected","reason":"invalid_or_unexpected_input"}');
    return json({ error: "Unable to process this audit request." }, 400);
  }
}
