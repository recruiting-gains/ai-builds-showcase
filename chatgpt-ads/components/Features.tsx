const FEATURES = [
  {
    title: "Auto Audit",
    description: "Automatically scans every campaign for performance issues in seconds.",
    icon: "🔍",
  },
  {
    title: "Wasted Spend Detector",
    description: "Flags campaigns with low ROAS, poor CTR, or high CPC that are burning budget.",
    icon: "💸",
  },
  {
    title: "Winning Ad Finder",
    description: "Surfaces your top 3 ads by ROAS so you know exactly what to scale.",
    icon: "🏆",
  },
  {
    title: "Optimization Plan",
    description: "Generates a concrete, prioritized action plan based on your real data.",
    icon: "🗺️",
  },
  {
    title: "Multi-Platform",
    description: "Works with Google, Meta, TikTok, and LinkedIn ad data.",
    icon: "🌐",
  },
  {
    title: "Instant Results",
    description: "No waiting, no API keys, no setup — get results the moment you submit data.",
    icon: "⚡",
  },
];

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-3xl font-black md:text-4xl">Everything you need to run winning ads</h2>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-dark-green/10 bg-white/60 p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="text-3xl">{feature.icon}</div>
            <h3 className="mt-4 text-xl font-bold">{feature.title}</h3>
            <p className="mt-2 text-dark-green/80">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
