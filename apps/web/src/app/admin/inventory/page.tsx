import type { Metadata } from "next";
import { InventorySearch } from "@/components/admin/inventory-search";
import { requireAdminUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Live inventory" };

export default async function InventoryPage() {
  await requireAdminUser("quotes:write");
  return <InventorySearch />;
}
