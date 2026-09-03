import Link from "next/link";
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
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-black">ChatGPT Ads</span>
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
            className="rounded-lg bg-dark-green px-5 py-2.5 font-bold text-beige transition hover:bg-green-800"
          >
            Try Audit
          </a>
        </nav>
      </header>

      <Hero />

      {/* Social proof */}
      <section className="border-y border-dark-green/10 bg-white/40 py-10">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-dark-green/60">
          Trusted by media buyers at
        </p>
        <div className="mx-auto mt-6 flex max-w-4xl items-center justify-center gap-12">
          {["Agency One", "Growth Labs", "AdScale"].map((name) => (
            <div
              key={name}
              className="flex h-12 w-40 items-center justify-center rounded-md bg-dark-green/10 text-sm font-semibold text-dark-green/50"
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-black md:text-4xl">Sound familiar?</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { title: "Wasting ad spend?", copy: "Budget bleeding into campaigns that never convert." },
            { title: "Guessing which ads work?", copy: "No clear signal on what to scale versus kill." },
            { title: "No optimization plan?", copy: "Data without a next step is just noise." },
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
          <h2 className="text-3xl font-black md:text-4xl">The Paid-Ads OS</h2>
          <p className="mt-4 text-lg text-beige/90">
            That audits your campaigns, finds your winners, and builds your optimization plan — automatically.
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
          Here&apos;s a sample audit output from real campaign data — see the kind of insight you&apos;ll get.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ExampleStat label="Total Spend" value={`$${EXAMPLE_RESULT.totalSpend.toLocaleString()}`} />
          <ExampleStat label="Avg ROAS" value={`${EXAMPLE_RESULT.avgRoas}x`} />
          <ExampleStat label="Wasted Spend" value={`$${EXAMPLE_RESULT.wastedSpend.amount.toLocaleString()}`} />
          <ExampleStat label="Winning Ads Found" value={`${EXAMPLE_RESULT.winningAds.length}`} />
        </div>
      </section>

      <FAQ />

      {/* Final CTA */}
      <section className="bg-dark-green px-6 py-20 text-center text-beige">
        <h2 className="text-3xl font-black md:text-4xl">Ready to turn ChatGPT into your agency?</h2>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-lg bg-beige px-8 py-4 text-lg font-bold text-dark-green transition hover:bg-white"
        >
          Run Your Audit
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
            <Link href="/" className="hover:text-green-700">
              Privacy
            </Link>
          </div>
          <span className="text-sm text-dark-green/60">© {new Date().getFullYear()} ChatGPT Ads</span>
        </div>
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
