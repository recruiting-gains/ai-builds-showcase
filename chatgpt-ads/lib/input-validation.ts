export const SUPPORTED_PLATFORMS = ["Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads"] as const;

// A CSV expands when each JSON row repeats its column names. Four MiB safely
// covers every accepted 512 KB / 500-row upload while keeping direct API
// requests tightly bounded.
export const MAX_AUDIT_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_CSV_FILE_BYTES = 512 * 1024;
export const MAX_CAMPAIGN_ROWS = 500;
export const MAX_COLUMNS_PER_ROW = 40;
export const MAX_CELL_CHARACTERS = 1_000;
export const MAX_PASTED_CHARACTERS = 250_000;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export class RequestTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestTooLargeError";
  }
}

type RowValidationResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string };

export function isSupportedPlatform(value: unknown): value is SupportedPlatform {
  return typeof value === "string" && SUPPORTED_PLATFORMS.includes(value as SupportedPlatform);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRawRows(value: unknown): RowValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Campaign data must be a table of rows." };
  }

  if (value.length === 0) {
    return { ok: false, error: "Add at least one campaign row." };
  }

  if (value.length > MAX_CAMPAIGN_ROWS) {
    return { ok: false, error: `Use ${MAX_CAMPAIGN_ROWS} campaign rows or fewer.` };
  }

  const rows: Record<string, unknown>[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return { ok: false, error: "Every campaign row must contain named columns." };
    }

    const entries = Object.entries(candidate);
    if (entries.length === 0 || entries.length > MAX_COLUMNS_PER_ROW) {
      return {
        ok: false,
        error: `Each row must contain between 1 and ${MAX_COLUMNS_PER_ROW} columns.`,
      };
    }

    const row: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      if (!key || key.length > 80 || key === "__proto__" || key === "constructor" || key === "prototype") {
        return { ok: false, error: "A campaign column name is invalid." };
      }

      if (
        rawValue !== null &&
        typeof rawValue !== "string" &&
        typeof rawValue !== "number" &&
        typeof rawValue !== "boolean"
      ) {
        return { ok: false, error: "Campaign cells must contain text or numbers." };
      }

      if (typeof rawValue === "string" && rawValue.length > MAX_CELL_CHARACTERS) {
        return {
          ok: false,
          error: `Campaign cells must be ${MAX_CELL_CHARACTERS.toLocaleString()} characters or fewer.`,
        };
      }

      if (typeof rawValue === "number" && !Number.isFinite(rawValue)) {
        return { ok: false, error: "Campaign numbers must be finite values." };
      }

      row[key] = rawValue;
    }
    rows.push(row);
  }

  return { ok: true, rows };
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readLimitedText(request: Request, maximumBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }

  return chunks.join("");
}
