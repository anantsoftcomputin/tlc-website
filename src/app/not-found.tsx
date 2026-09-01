import Link from "next/link";
import { Magnetic } from "@/components/motion/magnetic";

export default function NotFound() {
  return <div className="not-found">
    <p className="eyebrow" data-reveal>404 · A small detour</p>
    <h1 data-reveal style={{ transitionDelay: "70ms" }}>This route isn’t<br/>on the <em>itinerary.</em></h1>
    <p data-reveal style={{ transitionDelay: "140ms" }}>Let’s get you back to somewhere worth exploring.</p>
    <Magnetic><Link className="button button-dark" href="/">Return home</Link></Magnetic>
  </div>;
}
