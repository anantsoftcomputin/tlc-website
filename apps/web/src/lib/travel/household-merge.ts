type Traveller = { clientId: string; firstName: string; relationship: string } & Record<string, unknown>;
type Household = {
  homeCity?: string;
  travellers?: Traveller[];
  sharedPreferences?: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
  completeness?: number;
};

const travellerKey = (traveller: Traveller) =>
  traveller.firstName.trim()
    ? `${traveller.relationship}:${traveller.firstName.trim().toLowerCase()}`
    : `client:${traveller.clientId}`;

const meaningful = (value: unknown) =>
  value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

/**
 * Folds a newly confirmed household profile into the stored one. Existing travellers
 * are kept; a traveller with the same relationship and first name is updated in place.
 * Newly confirmed shared preferences win, but blank answers never erase stored ones.
 */
export function mergeHouseholdProfile<T extends Traveller>(
  existing: Household | undefined,
  incoming: { homeCity: string; travellers: T[]; sharedPreferences: Record<string, unknown> },
) {
  if (!existing) return { ...incoming, createdAt: undefined, createdBy: undefined };
  const travellers = new Map<string, T>();
  for (const traveller of (existing.travellers || []) as T[]) travellers.set(travellerKey(traveller), traveller);
  for (const traveller of incoming.travellers) {
    const key = travellerKey(traveller);
    const previous = travellers.get(key);
    travellers.set(
      key,
      previous
        ? ({
            ...previous,
            ...Object.fromEntries(Object.entries(traveller).filter(([, value]) => meaningful(value))),
            clientId: previous.clientId,
          } as T)
        : traveller,
    );
  }
  const sharedPreferences = { ...(existing.sharedPreferences || {}) };
  for (const [key, value] of Object.entries(incoming.sharedPreferences))
    if (meaningful(value)) sharedPreferences[key] = value;
  return {
    homeCity: incoming.homeCity || existing.homeCity || "",
    travellers: [...travellers.values()].slice(0, 50),
    sharedPreferences,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
  };
}
