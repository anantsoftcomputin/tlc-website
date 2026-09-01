export const whatsappHref = (message: string) => {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "918948888873";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

export const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");
