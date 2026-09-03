import {
  AmadeusFlightProvider,
  MockFlightProvider,
  type FlightProvider,
} from "./flights/index.js";
import {
  HotelbedsHotelProvider,
  MockHotelProvider,
  type HotelProvider,
} from "./hotels/index.js";
import {
  MockPaymentProvider,
  RazorpayPaymentProvider,
  type PaymentProvider,
} from "./payments/index.js";

export type CommerceProviderSelection = {
  flights?: string;
  hotels?: string;
};

export class CommerceProviderRegistry {
  private readonly flights = new Map<string, FlightProvider>();
  private readonly hotels = new Map<string, HotelProvider>();
  private readonly payments = new Map<string, PaymentProvider>();

  constructor() {
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

  resolve(selection: CommerceProviderSelection = {}) {
    return {
      flight: this.flight(selection.flights),
      hotel: this.hotel(selection.hotels),
    };
  }
}
