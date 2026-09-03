"use client";

const FAQS = [
  {
    question: "What data do I need?",
    answer:
      "A CSV export or pasted table with columns like campaign name, spend, clicks, impressions, conversions, ROAS, CTR, and CPC. We'll derive any missing metrics automatically.",
  },
  {
    question: "Does it work with all platforms?",
    answer: "Yes — Google Ads, Meta Ads, TikTok Ads, and LinkedIn Ads exports are all supported.",
  },
  {
    question: "Is my data safe?",
    answer:
      "Your data is processed entirely to generate your audit results and is never sold or shared with third parties. No API keys or accounts are required.",
  },
  {
    question: "How accurate is it?",
    answer:
      "The engine uses proven media-buying heuristics (ROAS, CTR, and CPC thresholds) to calculate results directly from your numbers — no guesswork, no AI hallucinations.",
  },
];

export default function FAQ() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="text-center text-3xl font-black md:text-4xl">Frequently Asked Questions</h2>
      <div className="mt-10 space-y-4">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group rounded-lg border border-dark-green/10 bg-white/60 p-5">
            <summary className="cursor-pointer list-none font-semibold marker:content-none">
              <span className="flex items-center justify-between">
                {faq.question}
                <span className="ml-4 text-dark-green/50 transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 text-dark-green/80">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
