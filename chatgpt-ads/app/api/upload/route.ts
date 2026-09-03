import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

// Edge runtime keeps this route compatible with Cloudflare Pages (via
// @cloudflare/next-on-pages) as well as Vercel's Edge/Node runtimes.
export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      return NextResponse.json({ error: "Unable to parse CSV file." }, { status: 400 });
    }

    return NextResponse.json({ rows: parsed.data });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Unable to process uploaded file." }, { status: 400 });
  }
}
