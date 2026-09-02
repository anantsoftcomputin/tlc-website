export type SourcedResult<T> = {
  data: T;
  source: string;
  fetchedAt: string;
};

export interface HealthCheckableProvider {
  readonly key: string;
  healthCheck(): Promise<{ ok: boolean; reasoning: string }>;
}

export type ProviderClock = () => Date;

export const systemProviderClock: ProviderClock = () => new Date();

export function sourced<T>(
  data: T,
  source: string,
  clock: ProviderClock,
): SourcedResult<T> {
  return { data, source, fetchedAt: clock().toISOString() };
}
