import type { TboClient } from "./client.js";
import { TboError } from "./client.js";

export type TboCountry = { code: string; name: string };
export type TboCity = { code: string; name: string };
export type TboHotelSummary = {
  hotelCode: string;
  name: string;
  starRating: number;
  address: string;
  cityName: string;
  countryCode: string;
  countryName: string;
  latitude?: number;
  longitude?: number;
};
export type TboHotelDetail = TboHotelSummary & {
  description: string;
  facilities: string[];
  attractions: string[];
  images: string[];
  pinCode: string;
  cityId: string;
  phone: string;
  checkInTime: string;
  checkOutTime: string;
};

const ratings: Record<string, number> = { OneStar: 1, TwoStar: 2, ThreeStar: 3, FourStar: 4, FiveStar: 5, All: 0 };
export function tboStarRating(value: unknown) {
  if (typeof value === "number") return Math.max(0, Math.min(5, value));
  const text = String(value ?? "");
  return ratings[text] ?? (Number.parseFloat(text) || 0);
}

const number = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** TBO descriptions mix "HeadLine :", "Location :" etc. and stray HTML; keep readable text. */
export function cleanTboText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function okStatus(status: { Code?: number; Description?: string } | undefined, action: string) {
  if (status?.Code !== 200) throw new TboError(`TBO ${action}: ${status?.Description || "request failed"}.`, status?.Code);
}

type RawHotel = Record<string, unknown>;

export function mapTboHotelSummary(raw: RawHotel): TboHotelSummary {
  return {
    hotelCode: String(raw.HotelCode),
    name: cleanTboText(raw.HotelName),
    starRating: tboStarRating(raw.HotelRating),
    address: cleanTboText(raw.Address),
    cityName: cleanTboText(raw.CityName),
    countryCode: String(raw.CountryCode ?? ""),
    countryName: cleanTboText(raw.CountryName),
    latitude: number(raw.Latitude),
    longitude: number(raw.Longitude),
  };
}

export function mapTboHotelDetail(raw: RawHotel): TboHotelDetail {
  const [latitude, longitude] = String(raw.Map ?? "").split("|").map(number);
  const attractions = raw.Attractions && typeof raw.Attractions === "object" ? Object.values(raw.Attractions as Record<string, unknown>) : [];
  return {
    ...mapTboHotelSummary(raw),
    latitude: latitude ?? number(raw.Latitude),
    longitude: longitude ?? number(raw.Longitude),
    description: cleanTboText(raw.Description),
    facilities: (Array.isArray(raw.HotelFacilities) ? raw.HotelFacilities : []).map(cleanTboText).filter(Boolean),
    attractions: attractions.map(cleanTboText).filter(Boolean),
    // Live responses carry a main "Image" and an often-empty "Images" list.
    images: [...new Set([raw.Image, ...(Array.isArray(raw.Images) ? raw.Images : [])]
      .map((value) => String(value ?? "").replace(/\s+/g, "").replace(/^(https:\/\/[^/]+)\/\//, "$1/"))
      .filter((value) => value.startsWith("https://")))],
    pinCode: String(raw.PinCode ?? ""),
    cityId: String(raw.CityId ?? ""),
    phone: String(raw.PhoneNumber ?? ""),
    checkInTime: String(raw.CheckInTime ?? ""),
    checkOutTime: String(raw.CheckOutTime ?? ""),
  };
}

/** Static content: Country List > City List > TBO Hotel Code List > Hotel Details. */
export class TboStaticContent {
  constructor(private readonly client: TboClient) {}

  private url(method: string) {
    return `${this.client.config.urls.staticContent}/${method}`;
  }

  async countries(): Promise<TboCountry[]> {
    const result = await this.client.get<{ Status?: { Code?: number }; CountryList?: { Code: string; Name: string }[] }>(this.url("CountryList"), "static");
    okStatus(result.Status, "country list");
    return (result.CountryList || []).map((item) => ({ code: item.Code, name: cleanTboText(item.Name) }));
  }

  async cities(countryCode: string): Promise<TboCity[]> {
    const result = await this.client.post<{ Status?: { Code?: number }; CityList?: { Code: string; Name: string }[] }>(this.url("CityList"), { CountryCode: countryCode }, "static");
    okStatus(result.Status, "city list");
    return (result.CityList || []).map((item) => ({ code: String(item.Code), name: cleanTboText(item.Name) }));
  }

  async hotels(cityCode: string): Promise<TboHotelSummary[]> {
    const result = await this.client.post<{ Status?: { Code?: number }; Hotels?: RawHotel[] }>(this.url("TBOHotelCodeList"), { CityCode: cityCode, IsDetailedResponse: "true" }, "static");
    okStatus(result.Status, "hotel code list");
    return (result.Hotels || []).map(mapTboHotelSummary);
  }

  /** TBO accepts comma-separated codes; batches keep responses a manageable size. */
  async hotelDetails(hotelCodes: string[], batchSize = 25): Promise<TboHotelDetail[]> {
    const details: TboHotelDetail[] = [];
    for (let index = 0; index < hotelCodes.length; index += batchSize) {
      const result = await this.client.post<{ Status?: { Code?: number }; HotelDetails?: RawHotel[] }>(
        this.url("Hoteldetails"),
        { Hotelcodes: hotelCodes.slice(index, index + batchSize).join(","), Language: "EN", IsRoomDetailRequired: false },
        "static",
      );
      okStatus(result.Status, "hotel details");
      details.push(...(result.HotelDetails || []).map(mapTboHotelDetail));
    }
    return details;
  }
}
