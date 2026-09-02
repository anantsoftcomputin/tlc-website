import { MockFlightProvider, type FlightProvider } from "./flights/index.js";
import { MockHotelProvider, type HotelProvider } from "./hotels/index.js";

export type CommerceProviderSelection = {
  flights?: string;
  hotels?: string;
};

export class CommerceProviderRegistry {
  private readonly flights = new Map<string, FlightProvider>();
  private readonly hotels = new Map<string, HotelProvider>();

  constructor() {
    const mockFlight = new MockFlightProvider();
    const mockHotel = new MockHotelProvider();
    this.registerFlight(mockFlight);
    this.registerHotel(mockHotel);
    this.flights.set("mock", mockFlight);
    this.hotels.set("mock", mockHotel);
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

  resolve(selection: CommerceProviderSelection = {}) {
    return {
      flight: this.flight(selection.flights),
      hotel: this.hotel(selection.hotels),
    };
  }
}
