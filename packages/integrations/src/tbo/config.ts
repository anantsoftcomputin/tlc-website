/**
 * TBO (Tek Travels) endpoints. Staging URLs come from apidoc.tektravels.com.
 * Production hosts are issued by TBO at certification, so production requires every
 * TBO_*_URL override to be set explicitly rather than guessing them.
 */
import { isIP } from "node:net";
export type TboConfig = {
  environment: "staging" | "production";
  apiUsername: string;
  apiPassword: string;
  clientId: string;
  staticUsername: string;
  staticPassword: string;
  endUserIp: string;
  urls: {
    authenticate: string;
    air: string;
    hotelSearch: string;
    hotelPreBook: string;
    hotelBook: string;
    hotelBookingDetail: string;
    hotelChangeRequest: string;
    staticContent: string;
  };
};

export const tboStagingUrls: TboConfig["urls"] = {
  authenticate: "https://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate",
  // Staging air is HTTP-only (TBO redirects HTTPS to HTTP); production must use HTTPS.
  air: "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest",
  hotelSearch: "https://affiliate.tektravels.com/HotelAPI/Search",
  hotelPreBook: "https://affiliate.tektravels.com/HotelAPI/PreBook",
  hotelBook: "https://HotelBE.tektravels.com/hotelservice.svc/rest/book/",
  hotelBookingDetail: "https://HotelBE.tektravels.com/hotelservice.svc/rest/Getbookingdetail",
  hotelChangeRequest: "https://HotelBE.tektravels.com/hotelservice.svc/rest/SendChangeRequest",
  staticContent: "https://api.tbotechnology.in/TBOHolidays_HotelAPI",
};

const urlEnv: Record<keyof TboConfig["urls"], string> = {
  authenticate: "TBO_AUTH_URL",
  air: "TBO_AIR_URL",
  hotelSearch: "TBO_HOTEL_SEARCH_URL",
  hotelPreBook: "TBO_HOTEL_PREBOOK_URL",
  hotelBook: "TBO_HOTEL_BOOK_URL",
  hotelBookingDetail: "TBO_HOTEL_BOOKING_DETAIL_URL",
  hotelChangeRequest: "TBO_HOTEL_CHANGE_REQUEST_URL",
  staticContent: "TBO_STATIC_URL",
};

/** Returns null when TBO is not configured, so the registry simply omits it. */
export function tboConfigFromEnv(env: Record<string, string | undefined> = process.env): TboConfig | null {
  if (!env.TBO_API_USERNAME && !env.TBO_API_PASSWORD) return null;
  if (!env.TBO_API_USERNAME || !env.TBO_API_PASSWORD) throw new Error("Set both TBO_API_USERNAME and TBO_API_PASSWORD.");
  if (env.TBO_ENV && !["staging", "production"].includes(env.TBO_ENV)) throw new Error("TBO_ENV must be staging or production.");
  const environment = env.TBO_ENV === "production" ? "production" : "staging";
  const urls = { ...tboStagingUrls };
  const missing: string[] = [];
  for (const [key, name] of Object.entries(urlEnv) as [keyof TboConfig["urls"], string][]) {
    if (env[name]) urls[key] = env[name]!;
    else if (environment === "production") missing.push(name);
  }
  if (missing.length)
    throw new Error(`TBO_ENV=production needs the production endpoints from TBO: ${missing.join(", ")}.`);
  for (const [key, value] of Object.entries(urls)) {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== "https:" && !(environment === "staging" && key === "air" && url.protocol === "http:")))
      throw new Error(`TBO endpoint ${key} must use HTTPS without embedded credentials.`);
  }
  if (environment === "production" && (!env.TBO_END_USER_IP || !isIP(env.TBO_END_USER_IP) || /^(127\.|0\.)/.test(env.TBO_END_USER_IP) || env.TBO_END_USER_IP === "::1"))
    throw new Error("Set TBO_END_USER_IP to the server IP approved by TBO before using production.");
  return {
    environment,
    apiUsername: env.TBO_API_USERNAME,
    apiPassword: env.TBO_API_PASSWORD,
    clientId: env.TBO_CLIENT_ID || "ApiIntegrationNew",
    staticUsername: env.TBO_STATIC_USERNAME || "",
    staticPassword: env.TBO_STATIC_PASSWORD || "",
    endUserIp: env.TBO_END_USER_IP || "127.0.0.1",
    urls,
  };
}
