import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Travel stories", description: "Practical planning notes and inspiration from TLC. Full editorial guides are being prepared." };

const stories = [
  ["Best time to visit Thailand", "When the Andaman is calm, when the crowds thin, and when to book."],
  ["Switzerland in summer or winter?", "Two completely different holidays in the same valleys — how to choose."],
  ["A gentler family guide to Dubai", "Pacing the city with children: what to book ahead and what to skip."],
];

export default function Stories() {
  return <div className="page-shell section">
    <p className="eyebrow" data-reveal>Notes for better journeys</p>
    <h1 data-reveal>Travel <em>stories.</em></h1>
    <p className="page-lede" data-reveal style={{ transitionDelay: "80ms" }}>Practical inspiration from TLC. Full editorial guides are being prepared.</p>
    <div className="story-list">
      {stories.map(([title, note], i) => <article key={title} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
        <span>{String(i + 1).padStart(2, "0")}</span>
        <div>
          <p>Planning guide · Coming soon</p>
          <h2>{title}</h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{note}</span>
        </div>
        <Link href="/contact">Ask TLC →</Link>
      </article>)}
    </div>
  </div>;
}
