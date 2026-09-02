import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: LucideIcon }) {
  return <article className="admin-metric"><div><span>{label}</span><strong>{value.toLocaleString("en-IN")}</strong><small>{note}</small></div><i><Icon/></i></article>;
}
