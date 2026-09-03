const STEPS = [
  {
    number: 1,
    title: "Upload CSV or Paste Data",
    description: "Bring your campaign export from Google, Meta, TikTok, or LinkedIn — no formatting required.",
  },
  {
    number: 2,
    title: "AI Audit Engine analyzes ROAS, CTR, CPC",
    description: "Our engine crunches every metric across every campaign in seconds.",
  },
  {
    number: 3,
    title: "Get Wasted Spend + Winners + Action Plan",
    description: "Walk away with a clear picture of what to cut, what to scale, and what to do next.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-3xl font-black md:text-4xl">How it Works</h2>
      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.number} className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dark-green text-2xl font-black text-beige">
              {step.number}
            </div>
            <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
            <p className="mt-2 text-dark-green/80">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
