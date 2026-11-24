// Offline review of real staging evidence; makes no API calls.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { validateHotelGuests } from "../packages/integrations/dist/index.js";
const directory = resolve(process.argv[2] || "");
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
const summary = JSON.parse(await readFile(`${directory}/case-summary.json`, "utf8"));
const checks = [];
const check = (name, pass) => checks.push({ name, passed: Boolean(pass) });
const exchanges = [];
for (const call of manifest) {
  if ([call.requestFile, call.responseFile].some(name => basename(name) !== name)) throw new Error("Invalid evidence filename.");
  const requestText = await readFile(`${directory}/${call.requestFile}`, "utf8");
  const responseText = await readFile(`${directory}/${call.responseFile}`, "utf8");
  check(`${call.requestFile}: SHA-256`, createHash("sha256").update(requestText).digest("hex") === call.requestSha256);
  check(`${call.responseFile}: SHA-256`, createHash("sha256").update(responseText).digest("hex") === call.responseSha256);
  const request = JSON.parse(requestText), response = JSON.parse(responseText);
  const secretsRedacted = value => !value || typeof value !== "object" || Object.entries(value).every(([key, child]) => /^(password|tokenid|authorization)$/i.test(key) ? child === "[redacted]" : secretsRedacted(child));
  check(`${call.method}: credentials redacted`, secretsRedacted(request) && secretsRedacted(response));
  check(`${call.method}: staging case correlation`, call.runId === summary.runId && call.caseId === summary.caseId);
  check(`${call.method}: response received`, call.status >= 200 && call.status < 300 && !call.networkError);
  exchanges.push({ ...call, request, response });
}
let auth = exchanges.find(call => call.method === "Authenticate");
if (!auth && summary.authenticationEvidence) {
  const shared = summary.authenticationEvidence;
  const authDirectory = resolve(directory, shared.directory);
  if (!authDirectory.startsWith(`${resolve(directory, "..")}/`)) throw new Error("Shared authentication must be inside the same run directory.");
  const authManifest = JSON.parse(await readFile(`${authDirectory}/manifest.json`, "utf8"));
  const entry = authManifest.find(call => call.method === "Authenticate");
  if (entry) {
    if ([entry.requestFile, entry.responseFile].some(name => basename(name) !== name)) throw new Error("Invalid shared authentication filename.");
    const requestText = await readFile(`${authDirectory}/${entry.requestFile}`, "utf8");
    const responseText = await readFile(`${authDirectory}/${entry.responseFile}`, "utf8");
    check("Shared authentication evidence integrity", createHash("sha256").update(requestText).digest("hex") === entry.requestSha256 && createHash("sha256").update(responseText).digest("hex") === entry.responseSha256);
    auth = { ...entry, request: JSON.parse(requestText), response: JSON.parse(responseText) };
    check("Shared authentication correlation", auth.runId === shared.runId && auth.caseId === shared.caseId && auth.runId === summary.runId);
    check("Shared authentication secrets redacted", auth.request.Password === "[redacted]" && auth.response.TokenId === "[redacted]");
    check("Shared authentication HTTP success", auth.status === 200 && !auth.networkError);
  }
}
const search = exchanges.find(call => call.method === "Search");
const prebooks = exchanges.filter(call => call.method === "PreBook");
const books = exchanges.filter(call => call.method.toLowerCase() === "book");
const detail = exchanges.findLast(call => call.method.toLowerCase() === "getbookingdetail");
const prebook = prebooks.at(-1);
const book = books[0];
check("Successful authentication", auth?.response.Status === 1);
check("Search succeeded", search?.response.Status?.Code === 200);
check("Exactly one Book attempt", books.length === 1);
check("BookingCode preserved", Boolean(summary.bookingCode) && prebooks.every(call => call.request.BookingCode === summary.bookingCode) && book?.request.BookingCode === summary.bookingCode);
check("Selected rate exists in Search", search?.response.HotelResult?.some(hotel => hotel.Rooms?.some(room => room.BookingCode === summary.bookingCode)));
const prebookRoom = prebook?.response.HotelResult?.flatMap(hotel => hotel.Rooms || []).find(room => room.BookingCode === summary.bookingCode);
check("NetAmount matches final PreBook", Number.isFinite(prebookRoom?.NetAmount) && book?.request.NetAmount === prebookRoom.NetAmount);
check("Each Search batch <= 100 codes", exchanges.filter(call => call.method === "Search").every(call => call.request.HotelCodes?.split(",").length <= 100));
check("All room options requested", search?.request.Filters?.NoOfRooms === 0);
check("Room occupancy preserved", JSON.stringify(search?.request.PaxRooms?.map(room => [room.Adults, room.Children, [...(room.ChildrenAges || [])].sort()])) === JSON.stringify(book?.request.HotelRoomsDetails?.map(room => [room.HotelPassenger.filter(pax => pax.PaxType === 1).length, room.HotelPassenger.filter(pax => pax.PaxType === 2).length, room.HotelPassenger.filter(pax => pax.PaxType === 2).map(pax => pax.Age).sort()])));
try {
  const guests = book.request.HotelRoomsDetails.map(room => room.HotelPassenger.map(pax => ({ title: pax.Title, firstName: pax.FirstName, lastName: pax.LastName, type: pax.PaxType === 1 ? "adult" : "child", age: pax.Age, lead: pax.LeadPassenger, email: pax.Email, phone: pax.Phoneno, pan: pax.PAN || undefined, ...(pax.GuardianDetail ? { guardian: { title: pax.GuardianDetail.Title, firstName: pax.GuardianDetail.FirstName, lastName: pax.GuardianDetail.LastName, pan: pax.GuardianDetail.PAN } } : {}), passportNo: pax.PassportNo || undefined, passportIssueDate: pax.PassportIssueDate || undefined, passportExpDate: pax.PassportExpDate || undefined, ...(pax.GSTNumber ? { gst: { companyAddress: pax.GSTCompanyAddress, companyContactNumber: pax.GSTCompanyContactNumber, companyName: pax.GSTCompanyName, number: pax.GSTNumber, companyEmail: pax.GSTCompanyEmail } } : {}) })));
  const validation = validateHotelGuests(prebook.response.ValidationInfo, guests, { ...(book.request.ArrivalTransport ? { arrivalTransport: { type: book.request.ArrivalTransport.ArrivalTransportType, infoId: book.request.ArrivalTransport.TransportInfoId, time: book.request.ArrivalTransport.Time } } : {}), ...(book.request.DepartureTransport ? { departureTransport: { type: book.request.DepartureTransport.DepartureTransportType, infoId: book.request.DepartureTransport.TransportInfoId, time: book.request.DepartureTransport.Time } } : {}) });
  check("Passenger validations and PAN classification", validation.isCorporate === book.request.IsCorporate);
} catch { check("Passenger validations and PAN classification", false); }
check("Book accepted", book?.response.BookResult?.ResponseStatus === 1 && !book?.response.BookResult?.Error?.ErrorCode);
check("Get Booking Details follows Book", exchanges.indexOf(detail) > exchanges.indexOf(book));
const result = detail?.response.GetBookingDetailResult;
check("Confirmed occupancy matches searched rooms", Array.isArray(result?.Rooms) && result.Rooms.length === search?.request.PaxRooms?.length && result.Rooms.every((room, index) => room.AdultCount === search.request.PaxRooms[index].Adults && room.ChildCount === search.request.PaxRooms[index].Children));
const bookedGuardians = book?.request.HotelRoomsDetails?.flatMap(room => room.HotelPassenger).filter(pax => pax.GuardianDetail) || [];
const confirmedPassengers = result?.Rooms?.flatMap(room => room.HotelPassenger || []) || [];
check("Guardian PAN recorded for child passengers", bookedGuardians.every(pax => confirmedPassengers.some(confirmed => confirmed.PaxType === pax.PaxType && confirmed.FirstName === pax.FirstName && confirmed.LastName === pax.LastName && Number(confirmed.Age) === pax.Age && confirmed.GuardianDetail?.PAN === pax.GuardianDetail.PAN && confirmed.GuardianDetail?.FirstName === pax.GuardianDetail.FirstName && confirmed.GuardianDetail?.LastName === pax.GuardianDetail.LastName)));
check("Booking independently confirmed", result?.ResponseStatus === 1 && !result.Error?.ErrorCode && ["Confirmed", "Vouchered"].includes(result.HotelBookingStatus));
check("Voucher status matches booking mode", book?.request.IsVoucherBooking !== true || result?.VoucherStatus === true);
check("Booking ID and confirmation match", result?.BookingId > 0 && String(result.BookingId) === summary.booking?.bookingRef && result.ConfirmationNo === summary.booking?.supplierConfirmation && result.BookingId === book?.response.BookResult?.BookingId);
const report = { runId: summary.runId, caseId: summary.caseId, reviewedAt: new Date().toISOString(), readyForCertificationReview: checks.every(check => check.passed), checks, note: "Actual staging traffic for this booking case. TBO must review the logs; this report does not constitute certification." };
await writeFile(`${directory}/verification-report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ directory, readyForCertificationReview: report.readyForCertificationReview, passed: checks.filter(check => check.passed).length, total: checks.length, failed: checks.filter(check => !check.passed).map(check => check.name) }, null, 2));
if (!report.readyForCertificationReview) process.exitCode = 1;
