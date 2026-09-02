import type { Metadata } from "next";
import Image from "next/image";
import { Planner } from "@/components/planner";

export const metadata: Metadata = { title: "Plan my trip", description: "Four easy questions, then a TLC travel expert takes it from there. No payment, no pressure." };

export default function PlanPage() {
  return <div className="planner-page">
    <aside>
      <Image src="/images/destinations/alpine-lake.jpg" alt="" fill sizes="(max-width: 1000px) 100vw, 38vw"/>
      <p className="eyebrow light" data-reveal>Your trip, properly personal</p>
      <h2 data-reveal style={{ transitionDelay: "80ms" }}>Start with what you know. We’ll help with the rest.</h2>
      <p data-reveal style={{ transitionDelay: "160ms" }}>No payment, no pressure, and no need to have every detail decided.</p>
    </aside>
    <Planner/>
  </div>;
}
