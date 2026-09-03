"use client";

const FAQS = [
  {
    question: "What data do I need?",
    answer:
      "A CSV export or pasted table with columns like campaign name, spend, clicks, impressions, conversions, ROAS, CTR, and CPC. We'll derive any missing metrics automatically.",
  },
  {
    question: "Does it work with all platforms?",
    answer:
      "It recognizes common campaign columns from Google Ads, Meta Ads, TikTok Ads, and LinkedIn Ads. Export labels can vary, so if a column is not recognized, rename it to the template labels: campaign, spend, clicks, impressions, conversions, ROAS, CTR, and CPC.",
  },
  {
    question: "Is my data safe?",
    answer:
      "The submitted table is sent to this site's Cloudflare Worker, processed in memory, and returned as a result. The app does not save campaign contents, create an account, or send the data to an AI provider.",
  },
  {
    question: "Is ChatGPT or another AI model reading my data?",
    answer:
      "No. ChatGPT Ads is the project name, but this version uses visible, deterministic rules and ordinary calculations. No AI API is called.",
  },
  {
    question: "How should I use the results?",
    answer:
      "Treat them as an educational first pass, not financial advice. Platform goals, margins, attribution, and campaign context vary, so review the source data before changing a budget.",
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
