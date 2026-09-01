import Link from "next/link";
import Image from "next/image";

export function Logo({ light = false }: { light?: boolean }) {
  return <Link className={`logo ${light ? "logo-light" : ""}`} href="/" aria-label="TLC Holidays home">
    <Image src="/images/logo.png" width={2053} height={634} sizes="(max-width: 700px) 132px, 164px" alt="TLC — Travel Living Comfort" priority/>
  </Link>;
}
