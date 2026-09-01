import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { ScrollProgress } from "@/components/motion/scroll-progress";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT", "WONK"], style: ["normal", "italic"] });
const body = Manrope({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tlcholidays.in"),
  title: { default: "TLC Holidays — Personal holidays, beautifully planned", template: "%s | TLC Holidays" },
  description: "Discover international and Indian holidays shaped around your dates, interests and budget with TLC Holidays, Kanpur.",
  openGraph: { title: "TLC Holidays", description: "Your personal gateway to the world.", images: ["/images/hero-braies.jpg"] }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body><ScrollProgress/><FirebaseAnalytics/><Header/><main>{children}</main><Footer/><MobileBottomNav/><ScrollReveal/></body></html>;
}
