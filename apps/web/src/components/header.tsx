"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

const links = [
  ["Explore", "/destinations"], ["International", "/destinations?scope=international"],
  ["India", "/destinations?scope=india"], ["Holiday styles", "/holidays"],
  ["Journeys", "/trips"], ["Services", "/services"], ["About TLC", "/about"]
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 12); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
    <Logo />
    <nav className="desktop-nav" aria-label="Main navigation">
      {links.map(([label, href]) => <Link key={label} href={href} className={pathname === href ? "active" : ""}>{label}</Link>)}
    </nav>
    <div className="header-actions">
      <Link className="icon-link desktop-only" href="/destinations" aria-label="Search"><Search size={19}/></Link>
      <Link className="icon-link desktop-only" href="/saved" aria-label="Saved trips"><Heart size={19}/></Link>
      <Link className="button button-dark desktop-only" href="/plan-my-trip">Plan my trip</Link>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle menu">{open ? <X/> : <Menu/>}</button>
    </div>
    {open && <div className="mobile-menu">
      {links.map(([label, href], i) => <Link onClick={() => setOpen(false)} key={label} href={href} style={{ animationDelay: `${i * 45}ms` }}>{label}</Link>)}
      <Link className="button button-gold" href="/plan-my-trip">Plan my trip</Link>
    </div>}
  </header>;
}
