import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import {
  MAX_AUDIT_BODY_BYTES,
  MAX_CSV_FILE_BYTES,
  utf8ByteLength,
  validateRawRows,
} from "@/lib/input-validation";

const CSV_CONTENT_TYPES = new Set(["", "application/csv", "application/vnd.ms-excel", "text/csv", "text/plain"]);

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
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      return json({ error: "Upload the campaign export as a CSV file." }, 415);
    }

    const lengthHeader = request.headers.get("content-length");
    if (!lengthHeader) {
      return json({ error: "The upload size could not be verified." }, 411);
    }

    const declaredLength = Number(lengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
      return json({ error: "The upload size could not be verified." }, 411);
    }

    if (declaredLength > MAX_AUDIT_BODY_BYTES + 64 * 1024) {
      return json({ error: "The CSV upload is too large." }, 413);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return json({ error: "Choose a CSV file first." }, 400);
    }

    if (!file.name.toLowerCase().endsWith(".csv") || !CSV_CONTENT_TYPES.has(file.type.toLowerCase())) {
      return json({ error: "Only CSV campaign exports are accepted." }, 415);
    }

    if (file.size === 0) {
      return json({ error: "The selected CSV file is empty." }, 400);
    }

    if (file.size > MAX_CSV_FILE_BYTES) {
      return json({ error: "Use a CSV file smaller than 512 KB." }, 413);
    }

    const text = await file.text();
    if (utf8ByteLength(text) > MAX_CSV_FILE_BYTES) {
      return json({ error: "Use a CSV file smaller than 512 KB." }, 413);
    }

    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 10 || !parsed.data || parsed.data.length === 0) {
      return json({ error: "The CSV could not be read. Check its header row and formatting." }, 400);
    }

    const validation = validateRawRows(parsed.data);
    if (!validation.ok) {
      const status = validation.error.includes("500 campaign rows") ? 413 : 400;
      return json({ error: validation.error }, status);
    }

    return json({ rows: validation.rows });
  } catch {
    console.warn('{"event":"csv_upload_rejected","reason":"invalid_or_unexpected_input"}');
    return json({ error: "Unable to process this CSV file." }, 400);
  }
}
