const FEATURES = [
  {
    title: "Instant Health Check",
    description: "Checks each campaign for performance concerns in seconds.",
    icon: "🔍",
  },
  {
    title: "Spend-at-Risk Review",
    description: "Flags campaign spend connected to low ROAS, poor CTR, or high CPC for human review.",
    icon: "💸",
  },
  {
    title: "Winning Ad Finder",
    description: "Surfaces up to three campaigns that clear the performance rules and are not already flagged.",
    icon: "🏆",
  },
  {
    title: "Optimization Plan",
    description: "Creates a concrete review checklist based on the submitted numbers.",
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
      <h2 className="text-center text-3xl font-black md:text-4xl">A fast first pass before deeper analysis</h2>
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
