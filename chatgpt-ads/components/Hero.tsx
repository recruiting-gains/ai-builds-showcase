"use client";

export default function Hero() {
  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="mx-auto grid min-w-0 max-w-6xl grid-cols-1 items-center gap-12 overflow-hidden px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
      <div className="min-w-0">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-green-700">Transparent campaign analysis</p>
        <h1 className="break-words text-4xl font-black leading-tight text-dark-green sm:text-5xl">ChatGPT Ads</h1>
        <h2 className="mt-4 max-w-full break-words text-xl font-semibold leading-snug text-dark-green sm:text-2xl md:text-3xl">
          Turn an ad export into a{" "}
          <span className="relative block w-fit max-w-full sm:inline-block">
            clear action plan.
            <svg
              className="absolute -bottom-2 left-0 hidden w-full sm:block"
              viewBox="0 0 300 12"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M2 9 Q150 -2 298 9" stroke="#16A34A" strokeWidth="5" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </h2>

        <ul className="mt-8 space-y-3">
          {[
            "Checks ROAS, CTR, and CPC",
            "Flags campaign spend for review",
            "Finds strong campaigns without calling losers winners",
            "Builds a practical five-step checklist",
          ].map((item) => (
            <li key={item} className="flex min-w-0 items-start gap-3 text-base sm:text-lg">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-green-600 text-sm text-white">
                ✓
              </span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={scrollToDemo}
          className="mt-10 rounded-lg bg-dark-green px-8 py-4 text-lg font-bold text-beige transition hover:bg-green-800"
        >
          Check My Campaigns
        </button>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-dark-green/65">
          No account, API key, or AI model is required. This independent portfolio project is not affiliated with OpenAI.
        </p>
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-xl bg-[#0F172A] p-6 font-mono text-orange-400 shadow-2xl">
        <div className="mb-4 flex gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <pre className="max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed md:text-base" style={{ imageRendering: "pixelated" }}>
{`CAMPAIGN HEALTH CHECK
---------------------
Transparent rules. Clear next steps.`}
        </pre>
        <p className="mt-4 text-lg">
          <span className="animate-blink">&gt;_</span>
        </p>
      </div>
    </section>
  );
}
