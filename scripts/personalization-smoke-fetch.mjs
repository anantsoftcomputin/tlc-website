// Transport fixture only; never import this module into application source.
if (
  process.env.GCLOUD_PROJECT !== "demo-tlc-holidays" ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.TLC_PERSONALIZATION_SMOKE !== "1"
)
  throw new Error(
    "Personalisation transport fixtures require an explicit demo emulator run.",
  );
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  if (url.startsWith("https://supplier.personalization.test/")) {
    if (!url.endsWith("/Search"))
      throw new Error(`Unexpected supplier fixture request: ${url}`);
    return new Response(
      JSON.stringify({
        Status: { Code: 200 },
        HotelResult: [
          {
            HotelCode: "123",
            Currency: "INR",
            Rooms: [
              {
                Name: ["Family suite"],
                BookingCode: "123!TB!fixture",
                TotalFare: 20000,
                TotalTax: 2000,
                IsRefundable: true,
                MealType: "BreakFast",
                Supplements: [],
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (
    /tektravels|tbotechnology|tboholidays|api\.resend\.com|graph\.facebook\.com|api\.openai\.com/i.test(
      url,
    )
  )
    throw new Error(
      "Live supplier, messaging and model requests are forbidden in this smoke test.",
    );
  return original(input, init);
};
