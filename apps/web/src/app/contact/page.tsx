import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { InquiryForm } from "@/components/inquiry-form";

export const metadata: Metadata = { title: "Contact", description: "Call, WhatsApp, email or visit TLC Holidays in Kanpur — come with a full plan, a loose idea, or just the need for a break." };

export default function Contact() {
  return <>
    <div className="contact-page section">
      <div data-reveal>
        <p className="eyebrow">Contact TLC</p>
        <h1>Let’s talk about<br/><em>where next.</em></h1>
        <p>Come with a full plan, a loose idea, or just the need for a break.</p>
      </div>
      <div className="contact-card" data-reveal style={{ transitionDelay: "120ms" }}>
        <a href="tel:+915122550055"><Phone/> <span><small>Call</small>0512 2550055</span></a>
        <a href="tel:+918948888873"><Phone/><span><small>Mobile / WhatsApp</small>89488 88873–75</span></a>
        <a href="mailto:info@tlcholidays.in"><Mail/><span><small>Email</small>info@tlcholidays.in</span></a>
        <address><MapPin/><span><small>Office</small>11/26, 1-B, Ground Floor, Karmin Apartments, Suter Ganj, Kanpur</span></address>
      </div>
    </div>
    <section className="contact-form-section section" data-reveal><InquiryForm/></section>
  </>;
}
