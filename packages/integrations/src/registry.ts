import {
  AmadeusFlightProvider,
  MockFlightProvider,
  TboFlightProvider,
  type FlightProvider,
} from "./flights/index.js";
import {
  HotelbedsHotelProvider,
  MockHotelProvider,
  TboHotelProvider,
  type HotelProvider,
} from "./hotels/index.js";
import { TboClient } from "./tbo/client.js";
import { tboConfigFromEnv } from "./tbo/config.js";
import { TboStaticContent } from "./tbo/static-content.js";
import {
  MockPaymentProvider,
  RazorpayPaymentProvider,
  type PaymentProvider,
} from "./payments/index.js";
import {
  MockAccountingProvider,
  TallyAccountingProvider,
  ZohoBooksProvider,
  type AccountingProvider,
} from "./accounting/index.js";

export type CommerceProviderSelection = {
  flights?: string;
  hotels?: string;
};

export class CommerceProviderRegistry {
  private readonly flights = new Map<string, FlightProvider>();
  private readonly hotels = new Map<string, HotelProvider>();
  private readonly payments = new Map<string, PaymentProvider>();
  private readonly accounting = new Map<string, AccountingProvider>();
  private tboClient?: TboClient;

  /** TBO static hotel content (needs TBO_STATIC_USERNAME/PASSWORD as well). */
  tboStaticContent() {
    if (!this.tboClient) throw new Error("TBO is not configured. Set TBO_API_USERNAME and TBO_API_PASSWORD.");
    if (!this.tboClient.config.staticUsername || !this.tboClient.config.staticPassword)
      throw new Error("TBO static content needs TBO_STATIC_USERNAME and TBO_STATIC_PASSWORD.");
    return new TboStaticContent(this.tboClient);
  }

  constructor(options: { onTboExchange?: TboClient["onExchange"]; tboRequestTimeoutMs?: number } = {}) {
    const mockFlight = new MockFlightProvider();
    const mockHotel = new MockHotelProvider();
    this.registerFlight(mockFlight);
    this.registerHotel(mockHotel);
    this.flights.set("mock", mockFlight);
    this.hotels.set("mock", mockHotel);
    if (process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET)
      this.registerFlight(
        new AmadeusFlightProvider(
          process.env.AMADEUS_CLIENT_ID,
          process.env.AMADEUS_CLIENT_SECRET,
          process.env.AMADEUS_BASE_URL,
        ),
      );
    if (process.env.HOTELBEDS_API_KEY && process.env.HOTELBEDS_SECRET)
      this.registerHotel(
        new HotelbedsHotelProvider(
          process.env.HOTELBEDS_API_KEY,
          process.env.HOTELBEDS_SECRET,
          process.env.HOTELBEDS_BASE_URL,
        ),
      );
    // TBO registers only when its agency API login is present in the environment.
    const tbo = tboConfigFromEnv();
    if (tbo) {
      const client = new TboClient(tbo, undefined, undefined, options.tboRequestTimeoutMs, options.tboRequestTimeoutMs);
      this.tboClient = client;
      if (options.onTboExchange) client.onExchange = options.onTboExchange;
      this.registerFlight(new TboFlightProvider(tbo, undefined, client));
      this.registerHotel(new TboHotelProvider(tbo, undefined, client));
    }
    const mockPayment = new MockPaymentProvider();
    this.registerPayment(mockPayment);
    this.payments.set("mock", mockPayment);
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
      this.registerPayment(
        new RazorpayPaymentProvider(
          process.env.RAZORPAY_KEY_ID,
          process.env.RAZORPAY_KEY_SECRET,
        ),
      );
    this.registerAccounting(new MockAccountingProvider());
    if (
      process.env.ZOHO_BOOKS_ACCESS_TOKEN &&
      process.env.ZOHO_BOOKS_ORGANIZATION_ID
    )
      this.registerAccounting(
        new ZohoBooksProvider(
          process.env.ZOHO_BOOKS_ACCESS_TOKEN,
          process.env.ZOHO_BOOKS_ORGANIZATION_ID,
        ),
      );
    if (process.env.TALLY_ENDPOINT && process.env.TALLY_COMPANY)
      this.registerAccounting(
        new TallyAccountingProvider(
          process.env.TALLY_ENDPOINT,
          process.env.TALLY_COMPANY,
        ),
      );
  }

  registerFlight(provider: FlightProvider) {
    this.flights.set(provider.key, provider);
    return this;
  }

  registerHotel(provider: HotelProvider) {
    this.hotels.set(provider.key, provider);
    return this;
  }

  flight(key = "mock-flight") {
    const provider = this.flights.get(key);
    if (!provider)
      throw new Error(`Flight provider '${key}' is not configured.`);
    return provider;
  }

  hotel(key = "mock-hotel") {
    const provider = this.hotels.get(key);
    if (!provider)
      throw new Error(`Hotel provider '${key}' is not configured.`);
    return provider;
  }

  registerPayment(provider: PaymentProvider) {
    this.payments.set(provider.key, provider);
    return this;
  }

  payment(key = "mock-payment") {
    const provider = this.payments.get(key);
    if (!provider)
      throw new Error(`Payment provider '${key}' is not configured.`);
    return provider;
  }

  registerAccounting(provider: AccountingProvider) {
    this.accounting.set(provider.key, provider);
    return this;
  }

  accountingProvider(key = "mock") {
    const provider = this.accounting.get(key);
    if (!provider)
      throw new Error(`Accounting provider '${key}' is not configured.`);
    return provider;
  }

  /** Provider keys usable on this server (aliases excluded). */
  available() {
    return {
      flights: [...this.flights.keys()].filter((key) => key !== "mock"),
      hotels: [...this.hotels.keys()].filter((key) => key !== "mock"),
    };
  }

  resolve(selection: CommerceProviderSelection = {}) {
    return {
      flight: this.flight(selection.flights),
      hotel: this.hotel(selection.hotels),
    };
  }
}
