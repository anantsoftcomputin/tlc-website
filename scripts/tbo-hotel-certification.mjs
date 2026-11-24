// Uses the application's actual TBO adapter. Never sends mail or uses production endpoints.
// smoke: pnpm tbo:hotel-certify -- smoke [run-id]
// book:  pnpm tbo:hotel-certify -- book <case-input.json> <run-id>
import { mkdir, writeFile, readFile, open } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { TboClient, TboHotelProvider, TboStaticContent, tboConfigFromEnv, tboStagingUrls } from "../packages/integrations/dist/index.js";

export async function runHotelCertification({ mode = "smoke", input = null, runId = `hotel-${new Date().toISOString().replace(/[^0-9TZ]/g, "")}`, client: sharedClient, authenticationEvidence } = {}) {
if (!["smoke", "inspect", "book"].includes(mode)) throw new Error("Use smoke, inspect or book.");
const caseId = input?.caseId || "smoke-domestic";
if (![runId, caseId].every(value => /^[A-Za-z0-9_-]{1,100}$/.test(value))) throw new Error("Run and case IDs must contain only letters, numbers, hyphens and underscores.");
const config = sharedClient?.config || tboConfigFromEnv();
if (!config || config.environment !== "staging") throw new Error("Configured staging TBO credentials are required.");
for (const key of ["authenticate", "hotelSearch", "hotelPreBook", "hotelBook", "hotelBookingDetail", "hotelGenerateVoucher", "hotelChangeRequest", "hotelChangeStatus", "staticContent"]) {
  if (new URL(config.urls[key]).hostname.toLowerCase() !== new URL(tboStagingUrls[key]).hostname.toLowerCase()) throw new Error(`Unexpected staging host for ${key}. Verify with TBO before running certification.`);
}
const directory = resolve("tbo-logs", runId, caseId);
await mkdir(directory, { recursive: true, mode: 0o700 });
// Never overwrite or repeat an attempted case, including an uncertain booking.
const lock = await open(`${directory}/run.lock`, "wx", 0o600);
await lock.close();
const client = sharedClient || new TboClient(config);
client.requireEvidence = true;
client.certificationContext = { runId, caseId };
let sequence = 0;
const calls = [];
client.onExchange = async exchange => {
  const name = `${String(++sequence).padStart(2, "0")}-${exchange.method}`;
  const requestText = JSON.stringify(exchange.request, null, 2);
  const responseText = JSON.stringify(exchange.response, null, 2);
  await writeFile(`${directory}/${name}-request.json`, requestText, { mode: 0o600 });
  await writeFile(`${directory}/${name}-response.json`, responseText, { mode: 0o600 });
  const { request, response, ...metadata } = exchange;
  calls.push({ ...metadata, requestFile: `${name}-request.json`, responseFile: `${name}-response.json`, requestSha256: createHash("sha256").update(requestText).digest("hex"), responseSha256: createHash("sha256").update(responseText).digest("hex") });
  await writeFile(`${directory}/manifest.json`, JSON.stringify(calls, null, 2), { mode: 0o600 });
};
const provider = new TboHotelProvider(config, undefined, client);
const content = new TboStaticContent(client);
let summary = { runId, caseId, mode, environment: "staging", startedAt: new Date().toISOString(), status: "running", certificationReady: false, ...(authenticationEvidence ? { authenticationEvidence } : {}) };
try {
  const dates = input?.search || {};
  const start = new Date(Math.max(Date.now(), Date.parse("2026-11-13T00:00:00Z")) + 45 * 86400000);
  const checkIn = dates.checkIn || start.toISOString().slice(0, 10);
  const checkOut = dates.checkOut || new Date(Date.parse(checkIn) + 2 * 86400000).toISOString().slice(0, 10);
  let codes = dates.hotelCodes;
  if (!codes?.length) {
    const countryCode = input?.countryCode || "IN";
    const cities = await content.cities(countryCode);
    const city = input?.cityName ? cities.find(city => city.name.toLowerCase().startsWith(input.cityName.toLowerCase()))
      : cities.find(city => /^(new delhi\s*\/\s*delhi|new delhi|delhi)(?:,|$)/i.test(city.name));
    if (!city) throw new Error("Requested city was not found in the country city list.");
    const hotels = await content.hotels(city.code);
    codes = hotels.slice(0, 100).map(hotel => hotel.hotelCode);
    provider.rememberHotels(hotels);
  }
  const search = { destination: dates.destination || "Delhi", checkIn, checkOut, guestNationality: dates.guestNationality || "IN", rooms: dates.rooms || [{ adults: 1 }], hotelCodes: codes };
  if (mode === "book") {
    if (!input.countryCode) throw new Error("Specify the destination countryCode for the certification case.");
    if (input.countryCode !== "IN" && search.guestNationality !== "IN") throw new Error("TBO India international bookings require Indian nationality.");
    if (!isIP(config.endUserIp) || /^(127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(config.endUserIp) || config.endUserIp.includes(":")) throw new Error("Set TBO_END_USER_IP to the public IPv4 used for staging requests.");
    if (!input.approvedBy || !input.guests?.length) throw new Error("Case input needs approvedBy and explicitly supplied test guests.");
    if (input.guests.length !== search.rooms.length || input.guests.some((guests, index) => guests.filter(guest => guest.type === "adult").length !== search.rooms[index].adults || guests.filter(guest => guest.type === "child").map(guest => guest.age).sort().join() !== [...(search.rooms[index].childrenAges || [])].sort().join())) throw new Error("Test guests must match the case's searched room occupancy and child ages.");
    await client.tokenId();
  }
  const offers = (await provider.search(search)).data;
  if (!offers.length) throw new Error("No staging rooms available for these dates and occupancy.");
  const selected = input?.bookingCode ? offers.find(offer => offer.offerId === input.bookingCode) : offers.find(offer => offer.refundable) || offers[0];
  if (!selected) throw new Error("Requested BookingCode was not found in this search.");
  summary = { ...summary, search, bookingCode: selected.offerId };
  const prebook = await provider.availability(selected.offerId);
  summary.validationInfo = prebook.data.details?.validationInfo;
  summary.netAmount = prebook.data.details?.netAmount;
  if (mode === "book") {
    await writeFile(`${directory}/booking-attempt.json`, JSON.stringify({ startedAt: new Date().toISOString(), bookingCode: selected.offerId }), { flag: "wx", mode: 0o600 });
    const booked = await provider.book({ offerId: selected.offerId, guestNames: [], guests: input.guests, netAmount: prebook.data.details?.netAmount, approvedBy: input.approvedBy, nationality: search.guestNationality, idempotencyKey: `${runId}-${caseId}`, extras: input.extras, isVoucherBooking: input.isVoucherBooking ?? true });
    summary.booking = booked.data;
    summary.status = booked.data.status;
    summary.certificationReady = booked.data.status === "confirmed" && Boolean(booked.data.supplierConfirmation);
  } else { summary.status = "smoke-passed"; }
} catch (error) {
  summary.status = "blocked";
  summary.error = error instanceof Error ? error.message : "Unknown error";

} finally {
  summary.completedAt = new Date().toISOString();
  await writeFile(`${directory}/case-summary.json`, JSON.stringify(summary, null, 2), { mode: 0o600 });
  summary.directory = directory;
  summary.calls = calls.length;
}

return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "smoke", argument, runArgument] = process.argv.slice(2).filter(value => value !== "--");
  const input = mode !== "smoke" ? JSON.parse(await readFile(argument, "utf8")) : null;
  const runId = (mode !== "smoke" ? runArgument : argument) || `hotel-${new Date().toISOString().replace(/[^0-9TZ]/g, "")}`;
  const summary = await runHotelCertification({ mode, input, runId });
  console.log(JSON.stringify({ directory: summary.directory, status: summary.status, certificationReady: summary.certificationReady, error: summary.error, calls: summary.calls }, null, 2));
  if (summary.status === "blocked") process.exitCode = 1;
}
