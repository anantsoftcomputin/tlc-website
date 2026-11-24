// Builds a hotel-only sharing pack from the previously prepared TBO scenario catalogue.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "artifacts/tbo-hotel-test-plan");
await mkdir(out, { recursive: true });
const original = JSON.parse(
  await readFile(
    path.join(root, "artifacts/tbo-test-plan/TLC-TBO-Test-Scenarios.json"),
    "utf8",
  ),
);
const preparedDate = "2026-11-04",
  displayDate = "4 November 2026";
const baseName = "TLC-TBO-Hotel-API-Scenarios";
const sourceList = [
  [
    "H1",
    "Hotel certification occupancy cases",
    "https://apidoc.tektravels.com/hotelnew/Certification.aspx",
  ],
  [
    "H2",
    "Hotel API guide",
    "https://apidoc.tektravels.com/hotelnew/apiguide.aspx",
  ],
  [
    "H3",
    "Hotel search",
    "https://apidoc.tektravels.com/hotelnew/HotelSearch.aspx",
  ],
  [
    "H4",
    "Hotel PreBook",
    "https://apidoc.tektravels.com/hotelnew/HotelPreBook.aspx",
  ],
  [
    "H5",
    "Hotel Book fields",
    "https://apidoc.tektravels.com/hotelnew/HotelBook.aspx",
  ],
  [
    "H6",
    "Hotel Book JSON example",
    "https://apidoc.tektravels.com/hotelnew/HotelBook_Json.aspx",
  ],
  [
    "H7",
    "Booking retrieval",
    "https://apidoc.tektravels.com/hotelnew/HotelGetbookingdetail.aspx",
  ],
  [
    "H8",
    "Cancellation request",
    "https://apidoc.tektravels.com/hotelnew/HotelSendChange.aspx",
  ],
  [
    "H9",
    "Cancellation status",
    "https://apidoc.tektravels.com/hotelnew/HotelGetChangeRequestStatus.aspx",
  ],
  [
    "H10",
    "Per-service authorization",
    "https://apidoc.tektravels.com/hotelnew/Authorization.aspx",
  ],
].map(([id, title, url]) => ({ id, title, url, checked_on: preparedDate }));
const fullWorkflow = [
  "Resolve current hotel codes and details",
  "Authorize each service with its agreed account credentials",
  "Search for the exact stay and room occupancy",
  "PreBook the selected bookable unit",
  "Review current amount, restrictions and cancellation terms",
  "Submit Book after consultant approval",
  "Retrieve the reservation and reconcile its final status",
  "Retrieve or generate a voucher only when applicable to a confirmed reservation",
];
const room = (adults, childrenAges = []) => ({
  Adults: adults,
  Children: childrenAges.length,
  ChildrenAges: childrenAges.length ? childrenAges : null,
});
const occupancies = [
  [room(1)],
  [room(2, [6, 10])],
  [room(1), room(1)],
  [room(1, [6, 10]), room(2)],
];
const searchBody = (rooms, market = "NEW_DELHI") => ({
  CheckIn: "{{CHECK_IN_YYYY_MM_DD}}",
  CheckOut: "{{CHECK_OUT_YYYY_MM_DD}}",
  HotelCodes: `{{${market}_TBO_HOTEL_CODES}}`,
  GuestNationality: "IN",
  PaxRooms: rooms,
  ResponseTime: 23,
  IsDetailedResponse: true,
  Filters: { Refundable: false, NoOfRooms: 0, MealType: "All" },
});
const baseline = original.scenarios.filter((s) =>
  s.scenario_id.startsWith("HTL-C"),
);
const extended = original.scenarios.filter((s) =>
  /^HTL-\d+$/.test(s.scenario_id),
);
const access = original.scenarios.filter((s) =>
  s.scenario_id.startsWith("AUTH-"),
);
if (baseline.length !== 8 || extended.length !== 24 || access.length !== 8)
  throw new Error("Unexpected source scenario counts");
const baselineTitles = [
  "Domestic: one room, one adult",
  "Domestic: one room, two adults and two children",
  "Domestic: two rooms, one adult in each",
  "Domestic: one adult and two children in room 1; two adults in room 2",
  "International: one room, one adult",
  "International: one room, two adults and two children",
  "International: two rooms, one adult in each",
  "International: one adult and two children in room 1; two adults in room 2",
];
const workflowRefs = {
  "HTL-01": ["STATIC_LOOKUP", "HOTEL_SEARCH"],
  "HTL-02": ["HOTEL_SEARCH", "HOTEL_PREBOOK", "HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-03": ["HOTEL_SEARCH", "HOTEL_PREBOOK"],
  "HTL-04": ["HOTEL_SEARCH", "HOTEL_PREBOOK"],
  "HTL-05": ["HOTEL_SEARCH", "HOTEL_PREBOOK", "HOTEL_BOOK"],
  "HTL-06": ["HOTEL_SEARCH", "HOTEL_PREBOOK"],
  "HTL-07": ["HOTEL_PREBOOK", "HOTEL_CANCEL", "HOTEL_CANCEL_STATUS"],
  "HTL-08": ["HOTEL_SEARCH", "HOTEL_PREBOOK"],
  "HTL-09": ["HOTEL_SEARCH", "HOTEL_PREBOOK"],
  "HTL-10": ["HOTEL_PREBOOK", "HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-11": ["HOTEL_SEARCH", "HOTEL_PREBOOK", "HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-12": ["HOTEL_PREBOOK"],
  "HTL-13": ["HOTEL_PREBOOK", "HOTEL_BOOK"],
  "HTL-14": ["HOTEL_PREBOOK", "HOTEL_BOOK"],
  "HTL-15": ["HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-16": ["HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-17": ["HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-18": ["HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-19": ["HOTEL_BOOK", "HOTEL_RETRIEVE"],
  "HTL-20": ["HOTEL_RETRIEVE", "HOTEL_VOUCHER"],
  "HTL-21": ["HOTEL_CANCEL", "HOTEL_CANCEL_STATUS", "HOTEL_RETRIEVE"],
  "HTL-22": ["HOTEL_AMEND_OR_APPROVED_ALTERNATIVE"],
  "HTL-23": ["HOTEL_CANCEL_STATUS", "HOTEL_RETRIEVE"],
  "HTL-24": ["HOTEL_RETRIEVE"],
};
const replacements = {
  "AUTH-01": {
    title: "Hotel service authorization succeeds",
    test_data:
      "TBO-issued hotel staging login, approved agency profile and whitelisted egress IP.",
    execution_steps:
      "Authorize each entitled hotel service and call an enabled hotel read method. Use Basic Auth or a session token only where specified for that service.",
    requested_tbo_fixture:
      "Successful authorization/read examples for the hotel account; session expiry metadata where applicable. Supply credentials separately.",
    acceptance_criteria:
      "Static-content access and hotel availability access are verified independently; no secret is included in the sharing pack.",
    api_calls: ["HOTEL_AUTHORIZATION", "STATIC_LOOKUP", "HOTEL_SEARCH"],
  },
  "AUTH-02": {
    title: "Invalid or incomplete hotel credentials",
    test_data:
      "Incorrect hotel credentials, omitted required authentication value, and incorrect agency/profile identifier as separate variants.",
    execution_steps:
      "Make one TBO-approved negative request per variant, followed by a corrected request.",
    requested_tbo_fixture:
      "The exact authorization errors and the supported correction procedure.",
    acceptance_criteria:
      "A rejected identity cannot proceed to a hotel reservation; distinguish authentication failure from zero availability.",
    api_calls: ["HOTEL_AUTHORIZATION", "HOTEL_SEARCH"],
  },
  "AUTH-03": {
    title: "Hotel session or selection expires",
    test_data:
      "Expired session token where required, and a selected hotel BookingCode that has expired.",
    execution_steps:
      "Test the session-based method and stale selection separately; follow the account-specific renewal and re-search procedure.",
    requested_tbo_fixture:
      "Expiry errors, applicable lifetimes and approved recovery paths.",
    acceptance_criteria:
      "Do not apply token renewal rules to Basic Auth calls; refresh expired selections and reconcile any uncertain booking first.",
    api_calls: ["HOTEL_PREBOOK", "HOTEL_RETRIEVE"],
  },
  "AUTH-04": {
    title: "Hotel account entitlement denied",
    test_data:
      "Static hotel content is accessible but Search, PreBook or Book entitlement is not enabled.",
    execution_steps:
      "Call each hotel service using its own entitled credentials and isolate the denied capability.",
    requested_tbo_fixture:
      "Entitlement-specific response and the account enablement procedure.",
    acceptance_criteria:
      "A configuration/access error is not displayed as a successful search with no rooms.",
    api_calls: ["STATIC_LOOKUP", "HOTEL_SEARCH", "HOTEL_PREBOOK", "HOTEL_BOOK"],
  },
  "AUTH-05": {
    title: "Hotel egress IP or agency profile rejected",
    test_data: "TBO-approved allowed and denied IP/profile fixtures.",
    execution_steps:
      "Use TBO-controlled denial fixtures; verify a corrected hotel request with the approved egress IP.",
    requested_tbo_fixture:
      "The exact rejection and diagnostic fields, plus whitelisting requirements.",
    acceptance_criteria:
      "The rejection is actionable and no reservation is reported as confirmed.",
    api_calls: ["HOTEL_AUTHORIZATION", "HOTEL_BOOK"],
  },
  "AUTH-06": {
    title: "Hotel throttling or temporary read outage",
    test_data:
      "Controlled rate-limit, timeout and service-unavailable fixtures; no uncontrolled load test.",
    execution_steps:
      "Exercise Search or static lookup with bounded retries under TBO's documented policy.",
    requested_tbo_fixture:
      "HTTP/application errors, retry headers and permitted retry intervals.",
    acceptance_criteria:
      "Back off within the request deadline; never convert an outage into a no-availability result.",
    api_calls: ["STATIC_LOOKUP", "HOTEL_SEARCH"],
  },
  "AUTH-07": {
    title: "Insufficient hotel wallet or credit",
    test_data: "Staging credit below the selected hotel's final amount.",
    execution_steps:
      "Use balance lookup if supported, then one approved hotel Book attempt and authoritative reconciliation.",
    requested_tbo_fixture:
      "Insufficient-credit response, any debit/release details, and the final reservation state.",
    acceptance_criteria:
      "No false confirmation, repeated debit or blind booking retry.",
    api_calls: ["HOTEL_BALANCE_IF_SUPPORTED", "HOTEL_BOOK", "HOTEL_RETRIEVE"],
  },
  "AUTH-08": {
    title: "Malformed, partial or interrupted hotel response",
    test_data:
      "Separate fixtures for a business error in HTTP 200, missing required field, invalid JSON and a lost response.",
    execution_steps:
      "Use TBO fixtures or local fault injection at read and booking boundaries.",
    requested_tbo_fixture:
      "Documented error contracts and a reconciliation fixture for uncertain Book results.",
    acceptance_criteria:
      "Reject incomplete success data. Preserve an unknown booking outcome until supplier retrieval resolves it.",
    api_calls: [
      "HOTEL_SEARCH",
      "HOTEL_PREBOOK",
      "HOTEL_BOOK",
      "HOTEL_RETRIEVE",
    ],
  },
};
const scenarios = [...baseline, ...extended, ...access].map((item, index) => {
  const accessCase = item.scenario_id.startsWith("AUTH-");
  const overrides = replacements[item.scenario_id] || {};
  const scenario = {
    scenario_number: index + 1,
    scenario_id: accessCase
      ? item.scenario_id.replace("AUTH-", "HTL-A")
      : item.scenario_id,
    source_scenario_id: item.scenario_id,
    category: "hotels",
    section:
      index < 8
        ? "A. Hotel certification occupancy cases"
        : index < 32
          ? "B. Functional and recovery scenarios"
          : "C. Hotel access and API resilience",
    priority: item.priority,
    title: index < 8 ? baselineTitles[index] : overrides.title || item.title,
    test_data: overrides.test_data || item.test_data,
    execution_steps:
      index < 8
        ? fullWorkflow
        : [
            String(overrides.execution_steps || item.execution_steps).replace(
              /\bH\b/g,
              "the agreed hotel booking workflow",
            ),
          ],
    requested_tbo_fixture:
      overrides.requested_tbo_fixture || item.requested_tbo_fixture,
    acceptance_criteria: [
      overrides.acceptance_criteria ||
        item.acceptance_criteria.replace(/\s*\[S\d+\]/g, ""),
    ],
    api_calls:
      index < 8
        ? [
            "STATIC_LOOKUP",
            "HOTEL_SEARCH",
            "HOTEL_PREBOOK",
            "HOTEL_BOOK",
            "HOTEL_RETRIEVE",
            "HOTEL_VOUCHER_IF_REQUIRED",
          ]
        : overrides.api_calls || workflowRefs[item.scenario_id],
    requirement_basis:
      index < 8
        ? `Published hotel occupancy case ${index + 1}; TBO to confirm the binding checklist for TLC.`
        : "TLC-proposed hotel test coverage; confirm applicability with TBO.",
    execution_status: "Not run",
    company_response: {
      support_status: "Pending confirmation",
      api_version: null,
      request_fixture: null,
      response_fixture: null,
      seed_or_trigger_instructions: null,
      owner: null,
      target_delivery_date: null,
      comments: null,
    },
  };
  if (index < 8) {
    const international = index >= 4,
      rooms = occupancies[index % 4];
    scenario.test_inputs = {
      market: international ? "international" : "domestic",
      city_candidate: international ? "Dubai" : "New Delhi",
      guest_nationality: "IN",
      nights: 5,
      rooms,
    };
    scenario.search_request_template = searchBody(
      rooms,
      international ? "DUBAI" : "NEW_DELHI",
    );
  }
  return scenario;
});
const requestExamples = {
  HOTEL_SEARCH: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_SEARCH_URL}}",
    authentication:
      "TBO-issued hotel API Basic Auth; send credentials securely outside this file.",
    body: searchBody([room(2, [6, 10])]),
    notes: [
      "Hotel codes come from current TBO static data.",
      "The eight occupancy cases contain their own Search bodies; preserve each room's occupancy.",
    ],
  },
  HOTEL_PREBOOK: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_PREBOOK_URL}}",
    authentication:
      "TBO-issued hotel API Basic Auth, subject to account confirmation.",
    body: { BookingCode: "{{BOOKING_CODE_FROM_SEARCH}}" },
    notes: [
      "Use a current bookable unit and review the returned amount, rules and guest-document requirements.",
    ],
  },
  HOTEL_BOOK: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_BOOK_URL}}",
    authentication:
      "TBO-issued hotel API authorization, as confirmed for this endpoint.",
    example_for_scenario: "HTL-C01",
    body: {
      BookingCode: "{{CURRENT_BOOKING_CODE_FROM_PREBOOK}}",
      IsVoucherBooking: true,
      GuestNationality: "IN",
      EndUserIp: "{{TBO_APPROVED_STAGING_EGRESS_IP}}",
      RequestedBookingMode: 5,
      NetAmount: "{{NUMERIC_NET_AMOUNT_FROM_PREBOOK}}",
      ClientReferenceId: "{{UNIQUE_LOGICAL_BOOKING_REFERENCE}}",
      HotelRoomsDetails: [
        {
          HotelPassenger: [
            {
              Title: "Mr",
              FirstName: "Sample",
              MiddleName: "",
              LastName: "Traveller",
              Email: "{{TBO_APPROVED_TEST_EMAIL}}",
              PaxType: 1,
              LeadPassenger: true,
              Age: 34,
              Phoneno: "{{TBO_APPROVED_TEST_PHONE}}",
              PassportNo: null,
              PassportIssueDate: null,
              PassportExpDate: null,
              PAN: null,
            },
          ],
        },
      ],
    },
    notes: [
      "This example has one adult in one room. For other cases generate the exact scenario guest/room mapping; designate one lead adult per room.",
      "Replace NetAmount with the numeric value/type required by the entitled schema, not a placeholder string.",
      "Populate required identity/tax fields only with TBO-approved synthetic test values and returned requirements.",
      "Confirm RequestedBookingMode, reference limits, hold/voucher fields and any transport-related hotel fields with TBO.",
    ],
  },
  HOTEL_RETRIEVE: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_BOOKING_DETAILS_URL}}",
    authentication:
      "Agreed session-token contract; confirm the endpoint family.",
    body: {
      EndUserIp: "{{TBO_APPROVED_STAGING_EGRESS_IP}}",
      TokenId: "{{TOKEN_ID_FROM_APPROVED_AUTHENTICATION}}",
      BookingId: "{{INTEGER_BOOKING_ID_FROM_BOOK_RESPONSE}}",
    },
    notes: [
      "Replace BookingId with an integer. Ask TBO to provide the supported fallback lookup when the booking response was lost; do not assume client-reference lookup is enabled.",
    ],
  },
  HOTEL_CANCEL: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_CHANGE_REQUEST_URL}}",
    authentication:
      "Agreed session-token contract; confirm the endpoint family.",
    body: {
      EndUserIp: "{{TBO_APPROVED_STAGING_EGRESS_IP}}",
      TokenId: "{{TOKEN_ID_FROM_APPROVED_AUTHENTICATION}}",
      BookingId: "{{INTEGER_BOOKING_ID}}",
      RequestType: 4,
      Remarks: "TLC approved staging cancellation test",
    },
    notes: [
      "Approved controlled staging cancellation only. Partial-room cancellation needs a separate TBO-confirmed schema and capability.",
    ],
  },
  HOTEL_CANCEL_STATUS: {
    method: "POST",
    url: "{{TBO_STAGING_HOTEL_CHANGE_STATUS_URL}}",
    authentication:
      "Agreed session-token contract; confirm the endpoint family.",
    body: {
      EndUserIp: "{{TBO_APPROVED_STAGING_EGRESS_IP}}",
      TokenId: "{{TOKEN_ID_FROM_APPROVED_AUTHENTICATION}}",
      ChangeRequestId: "{{INTEGER_CHANGE_REQUEST_ID}}",
    },
    notes: [
      "Track the supplier's final decision and refund evidence independently; a submitted cancellation is not a settled refund.",
    ],
  },
};
const confirmations = [
  "Confirm TLC's entitled hotel API family, versions and separate staging URLs for every method; map any Room/Block terminology to the supplied contract.",
  "Confirm hotel account entitlement, static-content versus hotel credentials, per-service authorization and approved egress IPs. Supply secrets through the agreed secure channel.",
  "Provide current city/hotel codes, available test dates, sufficient test credit and TBO-approved synthetic guest/contact/document fixtures.",
  "Resolve the public documentation differences: Search child ages versus Book acceptance, NetAmount scalar versus array wording, and the hold/voucher field names.",
  "Confirm pending-state polling, expiry, retry limits and lookup after a lost Book response. Confirm whether client-reference reconciliation is available for this account.",
  "Mark partial cancellation, amendments, special requests and any unsupported capability explicitly; supply the supported alternative and fixture owner/delivery date.",
];
const pack = {
  document_title: "TLC VACATIONS LLP — Hotel API scenarios",
  schema_version: "1.0",
  prepared_date: preparedDate,
  scope: "Hotel API only — first integration phase",
  source_document: "artifacts/tbo-test-plan/TLC-TBO-Test-Scenarios.json",
  source_plan_date: original.source_plan_date,
  document_type:
    "Scenario specification with illustrative API request templates",
  execution_status: "Not run",
  format_note:
    "This is a JSON scenario pack, not executed request/response logs or certification evidence. All {{...}} values require replacement and type resolution. TBO must confirm the entitled endpoint family and payloads before any request is sent.",
  counts: {
    total: 40,
    published_occupancy_cases: 8,
    additional_functional_cases: 24,
    hotel_access_and_resilience_cases: 8,
  },
  common_test_setup: {
    execution_date_rule:
      "D is the actual agreed execution date; calculate check-in D+30 and check-out D+35 each run.",
    illustrative_execution_date: preparedDate,
    illustrative_check_in: "2026-12-04",
    illustrative_check_out: "2026-12-09",
    illustrative_nights: 5,
    availability:
      "TBO must nominate bookable staging inventory; these cities and dates are candidates.",
    nationality: "IN unless a scenario overrides it",
    child_ages_at_check_in: [6, 10],
    credentials: "Not included; provide securely outside the pack",
    booking_approval:
      "Consultant approval required before a controlled supplier booking",
    execution_modes: [
      "TBO-approved staging",
      "Supplier-provided mock fixture",
      "Local fault injection",
    ],
    variant_rule:
      "Run each listed positive/negative variation independently and record its execution mode.",
  },
  required_confirmations: confirmations,
  workflows: {
    HOTEL_BOOKING: fullWorkflow,
    OTHER_METHODS:
      "Static lookups, authorization, balance, voucher and amendment paths must be mapped to the entitled account contract by TBO.",
  },
  request_examples: requestExamples,
  evidence_required: [
    "scenario_id and variant/run ID",
    "actual execution timestamp with timezone",
    "endpoint family/version and fixture version",
    "redacted request and response JSON for each method",
    "HTTP status, application error/status and elapsed time",
    "session/trace/reference identifiers required by TBO, through the agreed channel",
    "final retrieval and confirmation evidence for successful bookings",
    "final cancellation/refund state where applicable",
  ],
  evidence_submission_note:
    "After execution, submit each occupancy certification case separately with its actual method-level request/response logs and supplier confirmation evidence; a planning JSON file is not a substitute for those logs.",
  scenarios,
  sources: sourceList,
};
await writeFile(
  path.join(out, `${baseName}.json`),
  JSON.stringify(pack, null, 2) + "\n",
);
const intro = [
  [
    "Purpose",
    "Please review this hotel-only scenario pack and return the account-specific request/response fixtures, supported methods, reproducible inventory or error triggers, and expected supplier states. Prioritize cases 1–8, then the applicable functional and recovery cases.",
  ],
  [
    "Scope and status",
    "40 numbered scenarios: 8 published hotel occupancy cases, 24 additional hotel cases and 8 hotel access/resilience cases. The extra cases are TLC proposals, not an assertion that TBO mandates all 40. Every case is Not run.",
  ],
  [
    "Test dates and guests",
    "Use the actual execution date D, check-in D+30 and check-out D+35 (five nights). Example for 4 November 2026: 4–9 December 2026; reconfirm bookable staging dates. Nationality IN unless varied; use synthetic guest details and child ages 6 and 10 at check-in.",
  ],
  [
    "Hotel workflow",
    "Current static hotel codes → agreed authorization → Search → PreBook → consultant review → approved Book → booking retrieval → voucher only where appropriate. Use the agreed cancellation/status path for cancellation cases.",
  ],
  [
    "How the files match",
    "The scenario number and scenario ID are identical in the numbered document and JSON. JSON includes exact Search occupancy bodies for cases 1–8 and six illustrative request templates. Placeholder values and unresolved numeric types must be replaced before execution. TBO supplies the response fixtures; none are fabricated here.",
  ],
];
let md = `# TLC VACATIONS LLP\n\n# Hotel API scenarios — Phase 1\n\nVersion 1.0 · ${displayDate} · 40 scenarios · Not run\n\n`;
for (const [title, text] of intro) md += `**${title}.** ${text}\n\n`;
md +=
  "## Confirm with the company before execution\n\n" +
  confirmations.map((x, i) => `${i + 1}. ${x}`).join("\n") +
  "\n\n";
let previousSection = "";
for (const s of scenarios) {
  if (s.section !== previousSection) {
    md += `## ${s.section}\n\n`;
    previousSection = s.section;
  }
  md += `### ${s.scenario_number}. ${s.title}\n\n**ID:** ${s.scenario_id} · **Priority:** ${s.priority} · **Status:** Not run\n\n- **Test data:** ${s.test_data}\n- **Steps:** ${s.execution_steps.join(" → ")}\n- **Company to provide:** ${s.requested_tbo_fixture}\n- **Expected result:** ${s.acceptance_criteria.join(" ")}\n\n`;
  if (s.scenario_number <= 8) md += `Basis: ${s.requirement_basis} [H1]\n\n`;
}
md +=
  "## JSON example and submission format\n\nThe companion JSON contains all 40 numbered definitions, baseline Search bodies, reusable request templates and blank company-response fields. Illustrative PreBook body:\n\n```json\n" +
  JSON.stringify(requestExamples.HOTEL_PREBOOK.body, null, 2) +
  "\n```\n\nAfter execution, return each certification case separately with actual request/response files, timestamps, API version, supplier identifiers and retrieval evidence. Record support status, fixture owner and target delivery date in the JSON company_response fields.\n\n";
md +=
  "## Hotel documentation references\n\nChecked 4 November 2026. Exact applicability remains subject to TBO's account-specific confirmation.\n\n" +
  sourceList.map((s) => `- [${s.id}] ${s.title}: ${s.url}`).join("\n") +
  "\n";
await writeFile(path.join(out, `${baseName}.md`), md);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const css = `@page{size:A4;margin:17mm 17mm 19mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#24343a;font-size:10pt;line-height:1.45;margin:0}h1,h2,h3{font-weight:700;color:#153d37}h1{font-size:27pt;line-height:1.12;margin:12px 0}h2{font-size:16pt;margin:24px 0 12px;border-bottom:2px solid #b5945f;padding-bottom:7px;break-after:avoid}h3{font-size:11.5pt;margin:0 0 5px;line-height:1.3;break-after:avoid}p{margin:7px 0}a{color:#285f67;overflow-wrap:anywhere}.brand{font-size:11pt;letter-spacing:.14em;font-weight:700;color:#8a2836}.subtitle{font-size:13pt;color:#59706e}.meta{font-size:9pt;color:#5d6a6b}.summary{background:#edf3ef;border-left:4px solid #153d37;padding:13px 17px;margin:15px 0}.intro-item{margin:12px 0}.scenario{break-inside:avoid;border-bottom:1px solid #dce4df;padding:12px 0}.scenario ul{margin:6px 0 0;padding-left:18px}.scenario li{margin:4px 0}.badge{font-weight:700;color:#8a2836}.basis{font-size:8.5pt;color:#667471}.section-start{break-before:page}.refs{font-size:9pt}.refs li{margin:7px 0}pre{background:#f1f4f1;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:9pt}ol{padding-left:20px}ol li{margin:7px 0}`;
let body = `<div class="brand">TLC VACATIONS LLP</div><h1>Hotel API scenarios</h1><p class="subtitle">Phase 1 · Company review and staging fixture request</p><p class="meta">Version 1.0 · ${displayDate} · Hotel API only</p><div class="summary"><strong>40 numbered scenarios</strong><br>8 occupancy certification cases · 24 functional cases · 8 access/resilience cases<br><span class="badge">Execution status: Not run</span></div>`;
for (const [title, text] of intro)
  body += `<div class="intro-item"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
body += `<h2>Confirm before execution</h2><ol>${confirmations.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
previousSection = "";
for (const s of scenarios) {
  if (s.section !== previousSection) {
    body += `<h2 class="section-start">${esc(s.section)}</h2>`;
    previousSection = s.section;
  }
  body += `<article class="scenario"><h3>${s.scenario_number}. ${esc(s.title)}</h3><div class="meta"><strong>${s.scenario_id}</strong> · ${s.priority} · Not run</div><ul><li><strong>Test data:</strong> ${esc(s.test_data)}</li><li><strong>Steps:</strong> ${esc(s.execution_steps.join(" → "))}</li><li><strong>Company to provide:</strong> ${esc(s.requested_tbo_fixture)}</li><li><strong>Expected result:</strong> ${esc(s.acceptance_criteria.join(" "))}</li></ul>${s.scenario_number <= 8 ? `<p class="basis">${esc(s.requirement_basis)} [H1]</p>` : ""}</article>`;
}
body += `<h2 class="section-start">JSON format and evidence</h2><p>The JSON companion has the same 40 scenario numbers and IDs, exact occupancy Search templates for cases 1–8, six method request examples and company-response fields. It is a planning file; no supplier response or successful booking is invented.</p><p><strong>Illustrative PreBook body:</strong></p><pre>${esc(JSON.stringify(requestExamples.HOTEL_PREBOOK.body, null, 2))}</pre><p>Replace placeholders and confirm endpoint/schema differences before running a call. TBO should return an accepted request body, response fixture and seed/trigger instructions per relevant variant.</p><p>After execution, submit each certification case separately with its actual method request/response JSON, run time, API version, supplier confirmation and booking-retrieval evidence. Keep credentials outside the sharing pack.</p><h2>Hotel documentation references</h2><p class="meta">Checked ${displayDate}. Account-specific confirmation takes precedence.</p><ol class="refs">${sourceList.map((s) => `<li><strong>${s.id} — ${esc(s.title)}</strong><br><a href="${esc(s.url)}">${esc(s.url)}</a></li>`).join("")}</ol>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TLC — Hotel API scenarios</title><style>${css}</style></head><body>${body}</body></html>`;
const htmlPath = path.join(out, `${baseName}.html`);
await writeFile(htmlPath, html);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(new URL(`file://${htmlPath}`).href);
  await page.pdf({
    path: path.join(out, `${baseName}.pdf`),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="font-family:Arial;font-size:8px;color:#61706a;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>TLC VACATIONS LLP · Hotel API scenarios · Not run</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: "17mm", right: "17mm", bottom: "19mm", left: "17mm" },
  });
  await page.screenshot({
    path: path.join(out, "preview.png"),
    fullPage: false,
  });
} finally {
  await browser.close();
}
execFileSync(
  "textutil",
  ["-convert", "docx", "-output", path.join(out, `${baseName}.docx`), htmlPath],
  { stdio: "pipe" },
);
const csvCell = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
const tracker = [
  [
    "No.",
    "Scenario ID",
    "Priority",
    "Title",
    "Execution status",
    "Company support status",
    "API version",
    "Fixture owner",
    "Target delivery date",
    "Request fixture",
    "Response fixture",
    "Comments",
  ],
  ...scenarios.map((s) => [
    s.scenario_number,
    s.scenario_id,
    s.priority,
    s.title,
    "Not run",
    "Pending confirmation",
    "",
    "",
    "",
    "",
    "",
    "",
  ]),
]
  .map((row) => row.map(csvCell).join(","))
  .join("\r\n");
await writeFile(
  path.join(out, "TLC-TBO-Hotel-Scenario-Tracker.csv"),
  tracker + "\r\n",
);
await writeFile(
  path.join(out, "Covering-message.txt"),
  `Subject: TLC VACATIONS LLP — Hotel API Phase 1 scenarios and JSON fixture request\n\nDear TBO Integration Team,\n\nPlease find attached our hotel-only point-wise scenario document and matching JSON pack. The first eight scenarios cover the published hotel occupancy certification cases. The remaining scenarios request applicable hotel functionality, error and recovery fixtures.\n\nPlease confirm our entitled hotel API family, staging URLs, per-method authorization, current hotel codes, bookable dates and required guest fields. Please return supported/conditional/unsupported status, accepted request and response JSON, reproducible fixture instructions, owner and target delivery date for each applicable case.\n\nAll cases are Not run. The JSON includes illustrative request templates; these are not executed certification logs. Please prioritize the eight occupancy cases and clarify any schema differences before execution.\n\nRegards,\nTLC VACATIONS LLP\n`,
);
await writeFile(
  path.join(out, "README.txt"),
  `TLC HOTEL API SCENARIO PACK\nPrepared ${displayDate}. Hotel API only. All 40 cases are Not run.\n\nSend these two primary attachments:\n1. ${baseName}.pdf — numbered point-wise scenarios.\n2. ${baseName}.json — matching definitions, eight occupancy Search bodies and six illustrative request templates.\n\nDOCX is editable; HTML/Markdown are readable alternatives. CSV tracks the company's replies. Covering-message.txt is a draft for you to send.\n\nThis package contains no actual API credentials, real guest documents, booking confirmations or executed supplier response logs. TBO must confirm account schemas and provide test inventory. Existing mixed-service files were preserved.\n`,
);
// Validate the supplier-facing scope and cross-file identity before reporting success.
const serialized = JSON.stringify(pack);
if (
  /AIR-(?:C|SAMPLE|\d)|Flight API|Flight certification|DEL[–-]BOM/.test(
    serialized,
  )
)
  throw new Error("Unexpected non-hotel scenario leakage");
if (
  new Set(scenarios.map((s) => s.scenario_id)).size !== 40 ||
  scenarios.some(
    (s, i) => s.scenario_number !== i + 1 || s.execution_status !== "Not run",
  )
)
  throw new Error("Scenario numbering/status mismatch");
for (const s of scenarios) {
  if (!md.includes(`### ${s.scenario_number}. `) || !md.includes(s.scenario_id))
    throw new Error("Document/JSON mismatch");
  if (s.test_inputs) {
    for (const r of s.test_inputs.rooms)
      if (r.Children !== (r.ChildrenAges || []).length)
        throw new Error("Occupancy mismatch");
  }
}
console.log(
  JSON.stringify({
    output: out,
    scenarios: scenarios.length,
    baseline: baseline.length,
    extended: extended.length,
    access: access.length,
    requestTemplates: Object.keys(requestExamples).length,
    executionStatus: "Not run",
    primaryFiles: [`${baseName}.pdf`, `${baseName}.json`],
  }),
);
