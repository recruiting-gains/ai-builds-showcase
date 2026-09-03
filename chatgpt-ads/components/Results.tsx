import type { AuditResult } from "@/lib/auditor";

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function Results({ result }: { result: AuditResult }) {
  return (
    <div className="mt-10 space-y-8 rounded-xl border border-dark-green/10 bg-white/70 p-6 md:p-8">
      <div>
        <p className="text-dark-green/80">{result.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Spend" value={formatCurrency(result.totalSpend)} />
        <Stat label="Avg ROAS" value={`${result.avgRoas}x`} />
        <Stat label="Avg CTR" value={`${result.avgCtr}%`} />
        <Stat label="Avg CPC" value={formatCurrency(result.avgCpc)} />
      </div>

      <div>
        <h3 className="text-xl font-bold text-red-700">Wasted Spend: {formatCurrency(result.wastedSpend.amount)}</h3>
        <p className="mt-1 text-sm text-dark-green/70">{result.wastedSpend.reason}</p>
        {result.wastedSpend.campaigns.length > 0 && (
          <ul className="mt-3 space-y-2">
            {result.wastedSpend.campaigns.map((c) => (
              <li key={c.name} className="rounded-lg bg-red-50 p-3 text-sm">
                <span className="font-semibold">{c.name}</span> — {formatCurrency(c.spend)}: {c.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold text-green-700">Winning Ads</h3>
        <ul className="mt-3 space-y-2">
          {result.winningAds.map((ad) => (
            <li key={ad.name} className="rounded-lg bg-green-50 p-3 text-sm">
              <span className="font-semibold">{ad.name}</span> — {ad.roas}x ROAS: {ad.reason}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xl font-bold">Optimization Plan</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {result.optimizationPlan.map((action, i) => (
            <li key={i}>{action}</li>
          ))}
        </ol>
      </div>
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
