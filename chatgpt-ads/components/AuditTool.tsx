"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AuditResult } from "@/lib/auditor";
import { SUPPORTED_PLATFORMS } from "@/lib/input-validation";
import Results from "./Results";

const SAMPLE_DATA = `campaign,spend,clicks,impressions,conversions,roas,ctr,cpc
Brand Search,2400,1800,42000,96,4.8,4.3,1.33
Retargeting,1600,950,38000,41,3.1,2.5,1.68
Summer Sale Prospecting,850,210,55000,4,0.7,0.38,4.05
Cold Interest Test,320,90,21000,2,0.9,0.43,3.56
Lookalike 1%,1100,640,26000,33,3.9,2.46,1.72`;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // A short fallback is clearer than exposing a server-generated error page.
  }
  return fallback;
}

export default function AuditTool() {
  const [platform, setPlatform] = useState<(typeof SUPPORTED_PLATFORMS)[number]>(SUPPORTED_PLATFORMS[0]);
  const [pastedData, setPastedData] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const runAudit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file && !pastedData.trim()) {
      setError("Upload a CSV or paste campaign data first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let payloadData: unknown = pastedData;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadResponse.ok) {
          throw new Error(await readError(uploadResponse, "The CSV could not be read."));
        }
        const uploadBody: { rows: unknown } = await uploadResponse.json();
        payloadData = uploadBody.rows;
      }

      const auditResponse = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, data: payloadData }),
      });

      if (!auditResponse.ok) {
        throw new Error(await readError(auditResponse, "The campaign check could not be completed."));
      }

      const auditResult: AuditResult = await auditResponse.json();
      setResult(auditResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The campaign check could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="demo" className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="text-center text-3xl font-black md:text-4xl">Try It Live</h2>
      <p className="mt-3 text-center text-dark-green/80">
        Upload a CSV or paste campaign data for an instant, rule-based health check.
      </p>

      <form
        className="mt-10 space-y-6 rounded-xl border border-dark-green/10 bg-white/70 p-6 md:p-8"
        onSubmit={runAudit}
        aria-busy={loading}
      >
        <div>
          <label htmlFor="platform" className="mb-2 block font-semibold">
            Platform
          </label>
          <select
            id="platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as (typeof SUPPORTED_PLATFORMS)[number])}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-dark-green"
          >
            {SUPPORTED_PLATFORMS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="file" className="mb-2 block font-semibold">
            Upload CSV
          </label>
          <p id="file-help" className="mb-2 text-sm text-dark-green/70">
            Up to 500 campaign rows and 512 KB. The file is processed for this result and is not saved by the app.
          </p>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="file-help"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3"
          />
        </div>

        <div>
          <label htmlFor="paste" className="mb-2 block font-semibold">
            Paste campaign data
          </label>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p id="paste-help" className="text-sm text-dark-green/70">
              Use a header row followed by one campaign per line.
            </p>
            <button
              type="button"
              className="rounded-md border border-dark-green/25 px-3 py-2 text-sm font-bold hover:bg-dark-green/5"
              onClick={() => {
                setFile(null);
                setPastedData(SAMPLE_DATA);
                setError(null);
                setResult(null);
              }}
            >
              Use fictional sample data
            </button>
          </div>
          <textarea
            id="paste"
            rows={6}
            aria-describedby="paste-help"
            placeholder={"campaign,spend,clicks,impressions,conversions,roas,ctr,cpc\nSummer Sale,450,120,15000,8,0.9,0.8,3.75"}
            value={pastedData}
            onChange={(event) => {
              setPastedData(event.target.value);
              setError(null);
            }}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-dark-green"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-dark-green px-8 py-4 text-lg font-bold text-beige transition hover:bg-green-800 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Checking campaign data…" : "Run Campaign Check"}
        </button>

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <p className="text-center font-semibold text-red-700" role="alert">
              {error}
            </p>
          )}
          {loading && <p className="text-center text-dark-green/75">Calculating the results from your numbers…</p>}
        </div>
      </form>

      {result && (
        <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 outline-none">
          <Results result={result} />
        </div>
      )}
    </section>
  );
}
