// Read-only supplier export. No travellers, booking tokens, credentials or rates are exported.
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CommerceProviderRegistry } from "../packages/integrations/dist/index.js";

const { values } = parseArgs({
  options: {
    city: { type: "string" },
    limit: { type: "string", default: "60" },
    output: { type: "string", default: ".local-ai/source/tbo-hotels.jsonl" },
  },
});
const limit = Number(values.limit);
if (
  !/^\d{1,12}$/.test(values.city || "") ||
  !Number.isInteger(limit) ||
  limit < 12 ||
  limit > 200
)
  throw new Error(
    "Supply --city <TBO city code> and --limit between 12 and 200.",
  );
const provider = new CommerceProviderRegistry({
  tboRequestTimeoutMs: 25000,
}).tboStaticContent();
const summaries = (await provider.hotels(values.city))
  .filter((hotel) => hotel.starRating >= 3 && hotel.starRating <= 5)
  .sort((a, b) => a.hotelCode.localeCompare(b.hotelCode));
// Sample across ratings rather than taking only luxury properties.
const selected = [];
const groups = [3, 4, 5].map((stars) =>
  summaries.filter((hotel) => Math.round(hotel.starRating) === stars),
);
while (selected.length < limit && groups.some((group) => group.length))
  for (const group of groups)
    if (group.length && selected.length < limit) selected.push(group.shift());
const details = await provider.hotelDetails(
  selected.map((hotel) => hotel.hotelCode),
);
const retrievedAt = new Date().toISOString();
const records = details
  .filter(
    (hotel) =>
      hotel.name &&
      hotel.facilities.length &&
      Number.isFinite(hotel.starRating),
  )
  .map((hotel) => {
    const facts = {
      hotelCode: hotel.hotelCode,
      name: hotel.name.slice(0, 160),
      cityCode: values.city,
      city: hotel.cityName.slice(0, 100),
      country: hotel.countryName.slice(0, 100),
      stars: hotel.starRating,
      facilities: [
        ...new Set(hotel.facilities.map((value) => value.slice(0, 120))),
      ].slice(0, 24),
    };
    return {
      version: "tbo-facts-v1",
      source: "tbo-static",
      retrievedAt,
      contentHash: createHash("sha256")
        .update(JSON.stringify(facts))
        .digest("hex"),
      ...facts,
    };
  });
if (records.length < 12)
  throw new Error(
    "Not enough usable hotel facts for a train/validation/test split.",
  );
await mkdir(dirname(values.output), { recursive: true, mode: 0o700 });
await writeFile(
  values.output,
  records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  { mode: 0o600 },
);
await writeFile(
  `${values.output}.manifest.json`,
  JSON.stringify(
    {
      source: "tbo-static",
      cityCode: values.city,
      retrievedAt,
      hotels: records.length,
      purpose: "catalogue-grounding-experiment",
      containsCustomerData: false,
      containsAvailabilityOrPrices: false,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    hotels: records.length,
    output: values.output,
    customerData: false,
    supplierWrites: false,
  }),
);
