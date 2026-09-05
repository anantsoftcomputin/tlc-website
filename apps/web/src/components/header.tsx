"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, MessageCircle, Phone, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

const links = [
  ["Destinations", "/destinations"],
  ["Tours", "/trips"],
  ["Holiday styles", "/holidays"],
  ["Travel services", "/services"],
  ["About TLC", "/about"],
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  return <>
    <div className="market-announcement">
      <span>Tailor-made holidays with expert support from Kanpur</span>
      <a href="tel:+918948888873"><Phone /> 89488 88873</a>
      <a href="https://wa.me/918948888873"><MessageCircle /> WhatsApp us</a>
    </div>
    <header className={`site-header market-header ${scrolled ? "is-scrolled" : ""}`}>
      <Logo />
      <nav className="desktop-nav market-nav" aria-label="Main navigation">
        {links.map(([label, href], index) => <Link key={label} href={href} className={pathname.startsWith(href) ? "active" : ""}>
          {label}{index === 0 || index === 2 ? <ChevronDown /> : null}
        </Link>)}
      </nav>
      <div className="header-actions">
        <Link className="market-search-link desktop-only" href="/trips"><Search /> Search</Link>
        <Link className="icon-link desktop-only" href="/saved" aria-label="Saved trips"><Heart /></Link>
        <Link className="button market-plan-button desktop-only" href="/plan-my-trip">Plan my trip</Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && <div className="mobile-menu market-mobile-menu">
        <p>Explore TLC Holidays</p>
        {links.map(([label, href], index) => <Link key={label} href={href} style={{ animationDelay: `${index * 40}ms` }}>{label}</Link>)}
        <div><Link href="/saved"><Heart /> Saved trips</Link><a href="tel:+918948888873"><Phone /> Call an expert</a></div>
        <Link className="button button-gold" href="/plan-my-trip">Plan my trip</Link>
      </div>}
    </header>
  </>;
}
