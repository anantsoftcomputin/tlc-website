"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { inquirySchema, type InquiryFormInput, type InquiryInput } from "@/lib/validation/inquiry";
import { whatsappHref } from "@/lib/utils";
import { analytics } from "@/lib/analytics";
import { Magnetic } from "@/components/motion/magnetic";

type InquiryFormProps = {
  source?: InquiryInput["source"];
  title?: string;
  description?: string;
  defaults?: Partial<InquiryInput>;
  compact?: boolean;
  onSuccess?: (inquiryId: string) => void;
};

export function InquiryForm({
  source = "contact",
  title = "Tell us what you're imagining.",
  description = "Share the essentials. A TLC travel expert can help shape everything else.",
  defaults,
  compact = false,
  onSuccess,
}: InquiryFormProps) {
  const [serverError, setServerError] = useState("");
  const [complete, setComplete] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<InquiryFormInput, unknown, InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: { source, preferredContact: "whatsapp", fullName: "", phone: "", email: "", website: "", ...defaults },
  });

  const submit = handleSubmit(async (values) => {
    setServerError("");
    const searchParams = new URLSearchParams(window.location.search);
    const utmHeaders: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) utmHeaders[`x-${key.replace("_", "-")}`] = value;
    });

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...utmHeaders },
        body: JSON.stringify({ ...values, source }),
      });
      const payload = await response.json() as { error?: string; inquiryId?: string };
      if (!response.ok) throw new Error(payload.error || "We couldn't save your request.");
      setComplete(true);
      void analytics.track("inquiry_submit", { source });
      onSuccess?.(payload.inquiryId || "");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "We couldn't save your request.");
    }
  });

  if (complete) {
    return <div className="inquiry-success planner-fade-in" role="status">
      <CheckCircle2/><p className="eyebrow">Request received</p><h2>We’ll take it from here.</h2>
      <p>A TLC travel expert can now review your requirements and contact you through your preferred channel.</p>
    </div>;
  }

  return <form className={`inquiry-form ${compact ? "inquiry-compact" : ""}`} onSubmit={submit} noValidate>
    <div className="form-heading"><p className="eyebrow">Plan with a person</p><h2>{title}</h2><p>{description}</p></div>
    <div className="form-grid">
      <label><span>Full name *</span><input autoComplete="name" {...register("fullName")} placeholder="Your name"/>{errors.fullName && <small>{errors.fullName.message}</small>}</label>
      <label><span>Phone / WhatsApp *</span><input inputMode="tel" autoComplete="tel" {...register("phone")} placeholder="+91 98765 43210"/>{errors.phone && <small>{errors.phone.message}</small>}</label>
      <label><span>Email</span><input type="email" autoComplete="email" {...register("email")} placeholder="you@example.com"/>{errors.email && <small>{errors.email.message}</small>}</label>
      <label><span>Contact me by</span><select {...register("preferredContact")}><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option></select></label>
      <label className="form-wide"><span>What would you like help with?</span><textarea rows={4} {...register("requirements")} placeholder="Destination, dates, travellers, budget—or simply the kind of break you need."/>{errors.requirements && <small>{errors.requirements.message}</small>}</label>
      <label className="honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" {...register("website")}/></label>
    </div>
    {serverError && <div className="form-error" role="alert"><p>{serverError}</p><a href={whatsappHref("Hi TLC Holidays, I'd like help planning a holiday.")}>Continue on WhatsApp</a></div>}
    <Magnetic strength={10}><button className="button button-gold" disabled={isSubmitting} type="submit">{isSubmitting ? <><LoaderCircle className="spin"/> Sending</> : <>Send my requirements <ArrowRight/></>}</button></Magnetic>
    <p className="form-note">By sending this request, you agree that TLC may contact you about this holiday enquiry.</p>
  </form>;
}
