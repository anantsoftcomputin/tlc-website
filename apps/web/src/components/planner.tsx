"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { InquiryForm } from "./inquiry-form";
import { Magnetic } from "./motion/magnetic";
import { analytics } from "@/lib/analytics";

const steps = [
  { key: "destination", title: "Where are you thinking?", subtitle: "Choose a direction, or leave room for a surprise.", options: ["International", "India", "I have a place in mind", "Surprise me"] },
  { key: "when", title: "When would you like to go?", subtitle: "An approximate month is completely fine.", options: ["October–December", "January–March", "April–June", "Flexible"] },
  { key: "who", title: "Who is travelling?", subtitle: "This helps us shape the pace and kind of stays.", options: ["Solo", "Couple", "Family", "Friends", "Group"] },
  { key: "style", title: "What should it feel like?", subtitle: "Pick the thought that matters most.", options: ["Restful", "Romantic", "Adventurous", "Cultural", "Luxurious", "Great value"] }
];

export function Planner() {
  const [step, setStep] = useState(0); const [answers, setAnswers] = useState<Record<string,string>>({});
  const [review, setReview] = useState(false); const [sent, setSent] = useState(false);
  if (sent) return <div className="planner-success planner-fade-in"><span><Check/></span><p className="eyebrow">Your brief is ready</p><h2>A TLC travel expert can take it from here.</h2><p>Call us on <a href="tel:+918948888873">89488 88873</a> or send your plan on WhatsApp.</p><Magnetic><a className="button button-gold" href={`https://wa.me/918948888873?text=${encodeURIComponent(`Hi TLC Holidays, I'd like help planning a ${answers.style || "personal"} ${answers.destination || "holiday"} for a ${answers.who || "traveller"}, around ${answers.when || "flexible dates"}.`)}`}>Send my plan on WhatsApp</a></Magnetic></div>;
  if (review) return <div className="planner-contact planner-fade-in"><button className="planner-back" onClick={() => setReview(false)}><ArrowLeft/> Change my choices</button><InquiryForm source="plan_my_trip" title="Where should we send your travel plan?" description="Add your details and a TLC expert can continue from this brief." defaults={{ travelMonth: answers.when, travellerType: answers.who, interests: answers.style ? [answers.style] : [], destinationIds: answers.destination ? [answers.destination] : [], requirements: `Holiday direction: ${answers.destination}. Timing: ${answers.when}. Travellers: ${answers.who}. Desired style: ${answers.style}.` }} compact onSuccess={() => { setSent(true); void analytics.track("plan_trip_complete", { destination: answers.destination, traveller_type: answers.who }); }}/></div>;
  const item = steps[step];
  return <div className="planner-card">
    <div className="planner-progress"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div>
    <div key={step} className="planner-step">
      <p className="eyebrow">Step {step + 1} of {steps.length}</p><h1>{item.title}</h1><p className="planner-subtitle">{item.subtitle}</p>
      <div className="option-grid">{item.options.map((option, i) => <button key={option} style={{ animationDelay: `${i * 40}ms` }} className={answers[item.key] === option ? "selected" : ""} onClick={() => setAnswers({...answers, [item.key]: option})}>{option}<span>{answers[item.key] === option && <Check size={17}/>}</span></button>)}</div>
    </div>
    <div className="planner-actions"><button disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft/> Back</button><Magnetic strength={10}><button className="button button-dark" disabled={!answers[item.key]} onClick={() => step === steps.length - 1 ? setReview(true) : setStep(step + 1)}>{step === steps.length - 1 ? "Add my contact details" : "Continue"} <ArrowRight/></button></Magnetic></div>
  </div>;
}
