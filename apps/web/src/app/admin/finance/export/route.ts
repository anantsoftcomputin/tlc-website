import { toCsv } from "@tlc/shared";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { FirestoreFinanceRepository } from "@/repositories/firebase/firestore-finance-repository";

export async function GET(request: Request) {
  const user = await getAdminUser();
  if (!user || !hasPermission(user.role, "finance:read"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspace = await new FirestoreFinanceRepository(
    user.orgId || "",
  ).workspace(1000);
  const report = new URL(request.url).searchParams.get("report") || "ledger";
  let rows: Record<string, unknown>[];
  if (report === "profitability")
    rows = workspace.profitability.map((item) => ({
      booking: item.bookingNumber,
      currency: item.currency,
      revenue: item.netRevenue,
      plannedCost: item.plannedCost,
      actualCost: item.actualCost,
      grossProfit: item.actualGp,
      marginPct: item.actualMarginPct,
      collected: item.collected,
      receivableOutstanding: item.receivableOutstanding,
      payableOutstanding: item.payableOutstanding,
    }));
  else if (report === "gst")
    rows = workspace.documents.map((item) => ({
      number: item.number,
      type: item.type,
      date: item.issueDate,
      customer: item.customer.name,
      gstin: item.customer.gstin || "",
      taxableValue: item.taxableValue,
      gstRatePct: item.gstRatePct,
      cgst: item.cgst,
      sgst: item.sgst,
      igst: item.igst,
      total: item.total,
    }));
  else
    rows = workspace.ledger.map((item) => ({
      id: item.id,
      bookingId: item.bookingId,
      type: item.type,
      party: item.party.name,
      dueDate: item.dueDate,
      currency: item.currency,
      amount: item.amount,
      settled: item.settledAmount,
      reserved: item.pendingSettlementAmount,
      outstanding:
        item.amount - item.settledAmount - item.pendingSettlementAmount,
      status: item.status,
    }));
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tlc-${report}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
