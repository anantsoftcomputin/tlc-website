import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { getAdminUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Team sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAdminUser()) redirect("/admin");
  return <div className="admin-login-page"><aside><Image src="/images/destinations/rajasthan-amber.jpg" alt="Amber Fort courtyard in Rajasthan" fill sizes="45vw"/><div/><section><p className="eyebrow light">TLC Operations</p><h2>Every great journey starts with a well-managed promise.</h2></section></aside><AdminLoginForm/></div>;
}
