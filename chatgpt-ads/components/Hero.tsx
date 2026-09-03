"use client";

export default function Hero() {
  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
      <div>
        <h1 className="text-5xl font-black leading-tight text-dark-green">ChatGPT Ads</h1>
        <h2 className="mt-4 text-2xl font-semibold leading-snug text-dark-green md:text-3xl">
          Turn ChatGPT into a{" "}
          <span className="relative inline-block">
            complete marketing agency.
            <svg
              className="absolute -bottom-2 left-0 w-full"
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
            "Audits campaigns",
            "Finds wasted spend",
            "Suggests winning ads",
            "Creates optimization plans",
          ].map((item) => (
            <li key={item} className="flex items-center gap-3 text-lg">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-green-600 text-sm text-white">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={scrollToDemo}
          className="mt-10 rounded-lg bg-dark-green px-8 py-4 text-lg font-bold text-beige transition hover:bg-green-800"
        >
          Run Free Audit
        </button>
      </div>

      <div className="rounded-xl bg-[#0F172A] p-6 font-mono text-orange-400 shadow-2xl">
        <div className="mb-4 flex gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed md:text-base" style={{ imageRendering: "pixelated" }}>
{`CHATGPT ADS
-----------------
The Paid-Ads Operating System`}
        </pre>
        <p className="mt-4 text-lg">
          <span className="animate-blink">&gt;_</span>
        </p>
      </div>
    </section>
  );
}
