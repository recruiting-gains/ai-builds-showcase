import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import AuditTool from "@/components/AuditTool";
import FAQ from "@/components/FAQ";
import { auditCampaigns, parseCampaignRows } from "@/lib/auditor";

const SAMPLE_ROWS = [
  { name: "Brand Search", spend: 2400, clicks: 1800, impressions: 42000, conversions: 96, roas: 4.8, ctr: 4.3, cpc: 1.33 },
  { name: "Retargeting", spend: 1600, clicks: 950, impressions: 38000, conversions: 41, roas: 3.1, ctr: 2.5, cpc: 1.68 },
  { name: "Summer Sale Prospecting", spend: 850, clicks: 210, impressions: 55000, conversions: 4, roas: 0.7, ctr: 0.38, cpc: 4.05 },
  { name: "Cold Interest Test", spend: 320, clicks: 90, impressions: 21000, conversions: 2, roas: 0.9, ctr: 0.43, cpc: 3.56 },
  { name: "Lookalike 1%", spend: 1100, clicks: 640, impressions: 26000, conversions: 33, roas: 3.9, ctr: 2.46, cpc: 1.72 },
];

const EXAMPLE_RESULT = auditCampaigns("Meta Ads", parseCampaignRows(SAMPLE_ROWS));

export default function Home() {
  return (
    <main className="min-h-screen bg-beige text-dark-green">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-dark-green/10 bg-beige/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className="shrink-0 text-lg font-black sm:text-xl">ChatGPT Ads</span>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="font-medium hover:text-green-700">
              Features
            </a>
            <a href="#how-it-works" className="font-medium hover:text-green-700">
              How it Works
            </a>
            <a href="#demo" className="font-medium hover:text-green-700">
              Demo
            </a>
          </div>
          <a
            href="#demo"
            className="shrink-0 rounded-lg bg-dark-green px-3 py-2.5 text-sm font-bold text-beige transition hover:bg-green-800 sm:px-5 sm:text-base"
          >
            Try Audit
          </a>
        </nav>
      </header>

      <Hero />

      {/* Trust strip */}
      <section className="border-y border-dark-green/10 bg-white/40 py-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 text-center text-sm font-bold text-dark-green/75">
          <span>✓ No account</span>
          <span>✓ No API key</span>
          <span>✓ No saved campaign contents</span>
          <span>✓ No AI provider receives the data</span>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-black md:text-4xl">Sound familiar?</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { title: "Too many campaign rows?", copy: "A long export makes it hard to see where attention is needed first." },
            { title: "Unsure what looks healthy?", copy: "ROAS, CTR, and CPC tell different parts of the story." },
            { title: "Need a starting point?", copy: "A transparent checklist can guide a deeper, human review." },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-dark-green/10 bg-white/60 p-6 text-center shadow-sm">
              <h3 className="text-xl font-bold">{card.title}</h3>
              <p className="mt-2 text-dark-green/80">{card.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solution */}
      <section className="bg-dark-green px-6 py-16 text-beige">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black md:text-4xl">A plain-English campaign health check</h2>
          <p className="mt-4 text-lg text-beige/90">
            It turns a campaign table into totals, spend that needs review, qualified winners, and a five-step checklist.
            Every result comes from visible rules—not a hidden AI judgment.
          </p>
        </div>
      </section>

      <HowItWorks />
      <Features />
      <AuditTool />

      {/* Example Results */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-black md:text-4xl">Example Results</h2>
        <p className="mt-3 text-center text-dark-green/80">
          This fictional demo data shows the type of result the tool creates. It does not represent a real advertiser.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ExampleStat label="Total Spend" value={`$${EXAMPLE_RESULT.totalSpend.toLocaleString()}`} />
          <ExampleStat label="Avg ROAS" value={`${EXAMPLE_RESULT.avgRoas}x`} />
          <ExampleStat label="Spend to Review" value={`$${EXAMPLE_RESULT.spendAtRisk.amount.toLocaleString()}`} />
          <ExampleStat label="Winning Ads Found" value={`${EXAMPLE_RESULT.winningAds.length}`} />
        </div>
      </section>

      <FAQ />

      <section id="privacy" className="border-y border-dark-green/10 bg-white/45 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">Data &amp; privacy</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Your campaign contents are not saved by this app.</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-dark-green/80">
            <p>
              When you run a check, the CSV or pasted table travels to this site&apos;s Cloudflare Worker. It is processed in
              memory to calculate the response and is not written to an application database or sent to ChatGPT or another
              AI provider.
            </p>
            <p>
              The site does not require an account, advertising-platform login, tracking pixel, or API key. Avoid submitting
              personal information or secrets. Standard hosting security and operational metadata may still be handled by
              Cloudflare as the infrastructure provider.
            </p>
            <p className="font-semibold text-dark-green">
              The results are an educational starting point—not financial advice or a replacement for campaign context,
              attribution analysis, or professional judgment.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-dark-green px-6 py-20 text-center text-beige">
        <h2 className="text-3xl font-black md:text-4xl">Ready to see what needs attention?</h2>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-lg bg-beige px-8 py-4 text-lg font-bold text-dark-green transition hover:bg-white"
        >
          Run a Campaign Check
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-green/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <span className="text-lg font-black">ChatGPT Ads</span>
          <div className="flex gap-6 text-sm">
            <a href="#features" className="hover:text-green-700">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-green-700">
              How it Works
            </a>
            <a href="#demo" className="hover:text-green-700">
              Demo
            </a>
            <a href="#privacy" className="hover:text-green-700">
              Privacy
            </a>
          </div>
          <span className="text-sm text-dark-green/60">© {new Date().getFullYear()} ChatGPT Ads</span>
        </div>
        <p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-relaxed text-dark-green/55">
          Independent portfolio project. Not affiliated with or endorsed by OpenAI, Google, Meta, TikTok, or LinkedIn.
        </p>
      </footer>
    </main>
  );
}

function ExampleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dark-green/10 bg-white/60 p-6 text-center shadow-sm">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm uppercase tracking-wide text-dark-green/70">{label}</p>
    </div>
  );
}
