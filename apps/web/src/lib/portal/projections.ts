type Data = Record<string, unknown>;
export function safeExternalUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
export function clientQuote(id: string, data: Data) {
  const totals = (data.totals || {}) as Data;
  return {
    id,
    number: String(data.quoteNumber || "Your itinerary"),
    status: String(data.status),
    total: Number(totals.sell || 0),
    currency: String(totals.currency || "INR"),
    validUntil: String(data.validUntil || ""),
    href: `/i/${encodeURIComponent(String(data.shareToken))}`,
  };
}
export function clientBooking(id: string, data: Data) {
  const totals = (data.totals || {}) as Data;
  return {
    id,
    number: String(data.bookingNumber || "Your booking"),
    status: String(data.status),
    paymentStatus: String(data.paymentStatus),
    total: Number(totals.sell || 0),
    currency: String(totals.currency || "INR"),
    items: (Array.isArray(data.items) ? data.items : []).map((item: Data) => ({
      description: String(item.description || "Travel service"),
      status: String(item.itemStatus || "pending"),
      start: String((item.dates as Data)?.start || ""),
      end: String((item.dates as Data)?.end || ""),
    })),
    documents: (Array.isArray(data.documents) ? data.documents : []).map(
      (item: Data) => ({
        label: String(item.label),
        status: String(item.status),
      }),
    ),
  };
}
export function clientPayment(id: string, data: Data) {
  return {
    id,
    bookingId: String(data.bookingId),
    amount: Number(data.amount || 0),
    currency: String(data.currency || "INR"),
    status: String(data.status),
    dueAt: String(data.dueAt || ""),
    url:
      data.status === "pending" || data.status === "created"
        ? safeExternalUrl(data.linkUrl)
        : null,
  };
}
