"use client";

import { useState } from "react";
import type { AuditResult } from "@/lib/auditor";
import Results from "./Results";

const PLATFORMS = ["Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads"];

export default function AuditTool() {
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [pastedData, setPastedData] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let payloadData: unknown = pastedData;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Failed to parse uploaded CSV.");
        const uploadJson = await uploadRes.json();
        payloadData = uploadJson.rows;
      }

      const auditRes = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, data: payloadData }),
      });

      if (!auditRes.ok) throw new Error("Failed to run audit.");
      const auditJson: AuditResult = await auditRes.json();
      setResult(auditJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="demo" className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="text-center text-3xl font-black md:text-4xl">Try It Live</h2>
      <p className="mt-3 text-center text-dark-green/80">
        Upload a CSV or paste your campaign data below and run a real, instant audit.
      </p>

      <div className="mt-10 space-y-6 rounded-xl border border-dark-green/10 bg-white/70 p-6 md:p-8">
        <div>
          <label htmlFor="platform" className="mb-2 block font-semibold">
            Platform
          </label>
          <select
            id="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-dark-green"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="file" className="mb-2 block font-semibold">
            Upload CSV
          </label>
          <input
            id="file"
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3"
          />
        </div>

        <div>
          <label htmlFor="paste" className="mb-2 block font-semibold">
            Paste campaign data
          </label>
          <textarea
            id="paste"
            rows={6}
            placeholder={"campaign,spend,clicks,impressions,conversions,roas,ctr,cpc\nSummer Sale,450,120,15000,8,0.9,0.8,3.75"}
            value={pastedData}
            onChange={(e) => setPastedData(e.target.value)}
            className="w-full rounded-lg border border-dark-green/20 bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-dark-green"
          />
        </div>

        <button
          onClick={runAudit}
          disabled={loading}
          className="w-full rounded-lg bg-dark-green px-8 py-4 text-lg font-bold text-beige transition hover:bg-green-800 disabled:opacity-60"
        >
          {loading ? "ChatGPT is auditing..." : "Run Audit"}
        </button>

        {error && <p className="text-center text-red-600">{error}</p>}
      </div>

      {result && <Results result={result} />}
    </section>
  );
}
