import type { AuditResult } from "@/lib/auditor";

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function Results({ result }: { result: AuditResult }) {
  return (
    <div className="mt-10 space-y-8 rounded-xl border border-dark-green/10 bg-white/70 p-6 md:p-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-green-700">Campaign health-check result</p>
        <h2 className="mt-2 text-2xl font-black">What the submitted numbers show</h2>
        <p className="text-dark-green/80">{result.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Spend" value={formatCurrency(result.totalSpend)} />
        <Stat label="Avg ROAS" value={`${result.avgRoas}x`} />
        <Stat label="Avg CTR" value={`${result.avgCtr}%`} />
        <Stat label="Avg CPC" value={formatCurrency(result.avgCpc)} />
      </div>

      <div>
        <h3 className="text-xl font-bold text-amber-800">
          Spend to Review: {formatCurrency(result.spendAtRisk.amount)}
        </h3>
        <p className="mt-1 text-sm text-dark-green/70">{result.spendAtRisk.reason}</p>
        {result.spendAtRisk.campaigns.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {result.spendAtRisk.campaigns.map((campaign) => (
              <li key={campaign.name} className="rounded-lg bg-amber-50 p-3 text-sm">
                <span className="font-semibold">{campaign.name}</span> — {formatCurrency(campaign.spend)}: {campaign.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm">No campaign crossed the spend-at-risk rules.</p>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold text-green-700">Campaigns Meeting the Winner Rules</h3>
        {result.winningAds.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {result.winningAds.map((ad) => (
              <li key={ad.name} className="rounded-lg bg-green-50 p-3 text-sm">
                <span className="font-semibold">{ad.name}</span> — {ad.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg bg-beige p-3 text-sm">
            No campaign met every winner rule. That is useful information—review the checklist before scaling anything.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold">Optimization Plan</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {result.optimizationPlan.map((action, i) => (
            <li key={i}>{action}</li>
          ))}
        </ol>
      </div>

      <p className="border-t border-dark-green/10 pt-5 text-sm leading-relaxed text-dark-green/65">
        This educational result uses fixed thresholds and the submitted numbers only. Review attribution, margins, goals,
        and platform context before changing campaign spend.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-beige p-4 text-center">
      <p className="text-2xl font-black text-dark-green">{value}</p>
      <p className="text-xs uppercase tracking-wide text-dark-green/70">{label}</p>
    </div>
  );
}
