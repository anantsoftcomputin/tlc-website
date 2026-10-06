import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import type { FinanceDocument } from "@tlc/shared";
import { notFound } from "next/navigation";
import { requireClientUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default async function FinanceDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireClientUser();
  const customers = await clientCustomers(user);
  const { id } = await params;
  const snapshot = await getAdminFirestore()
    .collection("financeDocuments")
    .doc(id)
    .get();
  if (
    !snapshot.exists ||
    snapshot.data()?.orgId !== user.orgId ||
    !customers.some((customer) => customer.id === snapshot.data()?.customer?.id)
  )
    notFound();
  const document = snapshot.data() as FinanceDocument;
  return (
    <article className="finance-print-document">
      <header>
        <div>
          <p className="eyebrow">{document.type}</p>
          <h1>{document.number}</h1>
          <span>Issued {document.issueDate}</span>
        </div>
        <div className="finance-print-brand">
          <b>{document.seller.legalName}</b>
          <span>{document.seller.address}</span>
          <span>GSTIN {document.seller.gstin}</span>
        </div>
      </header>
      <section>
        <div>
          <span>Bill to</span>
          <b>{document.customer.name}</b>
          {document.customer.gstin && (
            <small>GSTIN {document.customer.gstin}</small>
          )}
        </div>
        <div>
          <span>Place of supply</span>
          <b>{document.placeOfSupply}</b>
          <small>SAC {document.sac}</small>
        </div>
      </section>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Taxable value</th>
            <th>GST rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Travel planning and reservation services</td>
            <td>{money(document.taxableValue, document.currency)}</td>
            <td>{document.gstRatePct}%</td>
            <td>{money(document.total, document.currency)}</td>
          </tr>
        </tbody>
      </table>
      <div className="finance-tax-totals">
        <span>
          CGST <b>{money(document.cgst, document.currency)}</b>
        </span>
        <span>
          SGST <b>{money(document.sgst, document.currency)}</b>
        </span>
        <span>
          IGST <b>{money(document.igst, document.currency)}</b>
        </span>
        <span>
          Total <b>{money(document.total, document.currency)}</b>
        </span>
      </div>
      <footer>
        Issued by TLC. Please contact your travel consultant if you need help
        with this document.
      </footer>
    </article>
  );
}
