"use client";

import { computeQuoteTotals, type CartItem } from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import { ArrowLeft, Calculator, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

const cartStorageKey = "tlc-quote-cart";
const kinds: CartItem["kind"][] = [
  "flight",
  "hotel",
  "transfer",
  "activity",
  "insurance",
  "visa",
  "other",
];

type LeadOption = { id: string; title: string; customerName: string };
type Revision = { id: string; version: number; items: CartItem[] };

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function blankItem(): CartItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `item-${Date.now()}`;
  return {
    id,
    kind: "other",
    supplierId: "manual",
    supplierRef: `manual-${id.slice(0, 8)}`,
    description: "",
    dates: { start: dateAfter(1), end: dateAfter(1) },
    pax: { adults: 2, children: 0, infants: 0 },
    costPrice: 0,
    sellPrice: 0,
    taxes: [],
    serviceFee: 0,
    discount: 0,
    commission: 0,
    currency: "INR",
    source: "manual",
    fetchedAt: new Date().toISOString(),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/i, "")
    : "The quote could not be saved.";
}

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function QuoteBuilder({
  leads,
  initialLeadId,
  revision,
}: {
  leads: LeadOption[];
  initialLeadId?: string;
  revision?: Revision;
}) {
  const router = useRouter();
  const [leadId, setLeadId] = useState(initialLeadId || "");
  const [items, setItems] = useState<CartItem[]>(revision?.items || []);
  const [validUntil, setValidUntil] = useState(dateAfter(7));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (revision || items.length) return;
    try {
      const stored = localStorage.getItem(cartStorageKey);
      const parsed = stored ? (JSON.parse(stored) as CartItem[]) : [];
      setItems(Array.isArray(parsed) && parsed.length ? parsed : [blankItem()]);
    } catch {
      setItems([blankItem()]);
    }
  }, [revision, items.length]);

  const totals = useMemo(() => {
    try {
      return computeQuoteTotals(items);
    } catch {
      return null;
    }
  }, [items]);

  function patchItem(index: number, patch: Partial<CartItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function patchNumber(
    index: number,
    key: "costPrice" | "sellPrice" | "serviceFee" | "discount" | "commission",
    value: string,
  ) {
    patchItem(index, { [key]: Math.max(0, Number(value) || 0) });
  }

  function patchTax(index: number, value: string) {
    const amount = Math.max(0, Number(value) || 0);
    patchItem(index, {
      taxes: amount ? [{ name: "Taxes", amount, included: false }] : [],
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (!leadId) return setError("Select a lead before saving the quote.");
    if (!items.length || items.some((item) => !item.description.trim()))
      return setError("Every cart item needs a description.");
    setSaving(true);
    try {
      const command = revision ? "reviseQuote" : "createQuote";
      const save = httpsCallable<Record<string, unknown>, { quoteId: string }>(
        getFirebaseFunctions(),
        command,
      );
      const result = await save({
        ...(revision ? { quoteId: revision.id } : {}),
        leadId,
        items,
        validUntil: new Date(`${validUntil}T18:29:59.000Z`).toISOString(),
      });
      localStorage.removeItem(cartStorageKey);
      router.push(`/admin/quotes/${result.data.quoteId}`);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="quote-builder" onSubmit={submit}>
      <Link
        className="admin-back"
        href={revision ? `/admin/quotes/${revision.id}` : "/admin/quotes"}
      >
        <ArrowLeft />
        Quotes
      </Link>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Versioned quote builder</p>
          <h1>
            {revision
              ? `Revise version ${revision.version}`
              : "Build a travel quote"}
          </h1>
          <p>
            Combine supplier inventory and manual services. Financial controls
            are applied on the server.
          </p>
        </div>
        <button className="button primary" disabled={saving || !leads.length}>
          <Save />
          {saving ? "Saving…" : revision ? "Create revision" : "Save draft"}
        </button>
      </header>

      {error && <p className="inventory-message error">{error}</p>}
      {!leads.length && (
        <p className="inventory-message error">
          No accessible leads are available. Create or assign a lead before
          building a quote.
        </p>
      )}

      <section className="quote-builder-context">
        <label>
          <span>Lead and traveller</span>
          <select
            value={leadId}
            onChange={(event) => setLeadId(event.target.value)}
            required
          >
            <option value="">Select a lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.title} — {lead.customerName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Valid through</span>
          <input
            type="date"
            min={dateAfter(1)}
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            required
          />
        </label>
      </section>

      <div className="quote-builder-layout">
        <main className="quote-builder-items">
          <header>
            <div>
              <h2>Itinerary cart</h2>
              <p>
                {items.length} service{items.length === 1 ? "" : "s"} in this
                revision
              </p>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={() => setItems((current) => [...current, blankItem()])}
            >
              <Plus />
              Add service
            </button>
          </header>
          {items.map((item, index) => (
            <article className="quote-item-editor" key={item.id}>
              <header>
                <span>{index + 1}</span>
                <select
                  aria-label="Service type"
                  value={item.kind}
                  onChange={(event) =>
                    patchItem(index, {
                      kind: event.target.value as CartItem["kind"],
                    })
                  }
                >
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind[0].toUpperCase() + kind.slice(1)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Remove service"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </button>
              </header>
              <label className="quote-wide">
                <span>Description</span>
                <textarea
                  rows={2}
                  value={item.description}
                  onChange={(event) =>
                    patchItem(index, { description: event.target.value })
                  }
                  placeholder="Flight, hotel room, transfer or activity details"
                  required
                />
              </label>
              <div className="quote-fields dates">
                <label>
                  <span>Start</span>
                  <input
                    type="date"
                    value={item.dates.start}
                    onChange={(event) =>
                      patchItem(index, {
                        dates: { ...item.dates, start: event.target.value },
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    type="date"
                    min={item.dates.start}
                    value={item.dates.end}
                    onChange={(event) =>
                      patchItem(index, {
                        dates: { ...item.dates, end: event.target.value },
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>Adults</span>
                  <input
                    type="number"
                    min="0"
                    value={item.pax.adults}
                    onChange={(event) =>
                      patchItem(index, {
                        pax: {
                          ...item.pax,
                          adults: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Children</span>
                  <input
                    type="number"
                    min="0"
                    value={item.pax.children}
                    onChange={(event) =>
                      patchItem(index, {
                        pax: {
                          ...item.pax,
                          children: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className="quote-fields financial">
                <label>
                  <span>Supplier cost</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.costPrice}
                    onChange={(event) =>
                      patchNumber(index, "costPrice", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Sell price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.sellPrice}
                    onChange={(event) =>
                      patchNumber(index, "sellPrice", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Taxes</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.taxes.reduce((sum, tax) => sum + tax.amount, 0)}
                    onChange={(event) => patchTax(index, event.target.value)}
                  />
                </label>
                <label>
                  <span>Service fee</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.serviceFee}
                    onChange={(event) =>
                      patchNumber(index, "serviceFee", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Discount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.discount}
                    onChange={(event) =>
                      patchNumber(index, "discount", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Commission</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.commission}
                    onChange={(event) =>
                      patchNumber(index, "commission", event.target.value)
                    }
                  />
                </label>
              </div>
              <footer>
                <span>
                  Source: <b>{item.source}</b>
                </span>
                <span>
                  Reference: <b>{item.supplierRef}</b>
                </span>
              </footer>
            </article>
          ))}
        </main>

        <aside className="quote-builder-summary">
          <h2>
            <Calculator />
            Live financial preview
          </h2>
          {totals ? (
            <dl>
              <div>
                <dt>Supplier cost</dt>
                <dd>{money(totals.cost, totals.currency)}</dd>
              </div>
              <div>
                <dt>Taxes</dt>
                <dd>{money(totals.tax, totals.currency)}</dd>
              </div>
              <div>
                <dt>Fees</dt>
                <dd>{money(totals.fees, totals.currency)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>− {money(totals.discount, totals.currency)}</dd>
              </div>
              <div className="total">
                <dt>Customer total</dt>
                <dd>{money(totals.sell, totals.currency)}</dd>
              </div>
              <div>
                <dt>Gross profit</dt>
                <dd>{money(totals.gp, totals.currency)}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{totals.marginPct.toFixed(1)}%</dd>
              </div>
            </dl>
          ) : (
            <p>Add a valid service to calculate totals.</p>
          )}
          <small>
            The server recomputes every total and requests approval when
            discount or margin thresholds are breached.
          </small>
        </aside>
      </div>
    </form>
  );
}
