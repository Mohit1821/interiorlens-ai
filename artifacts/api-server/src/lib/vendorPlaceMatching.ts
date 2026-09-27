const CITY_ALIASES: Record<string, string[]> = {
  bangalore: ["bangalore", "bengaluru"],
  bangaluru: ["bangalore", "bengaluru"],
  banglore: ["bangalore", "bengaluru"],
  bengluru: ["bangalore", "bengaluru"],
  bengaluru: ["bangalore", "bengaluru"],
};

const CITY_STATE_ALIASES: Record<string, string[]> = {
  bangalore: ["karnataka"],
  bangaluru: ["karnataka"],
  banglore: ["karnataka"],
  bengluru: ["karnataka"],
  bengaluru: ["karnataka"],
};

export function normalizePlaceText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, "");
}

function normalizeWords(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function placeNameIsExact(expected: string, candidate: string | null | undefined) {
  const expectedKey = normalizePlaceText(expected);
  return Boolean(expectedKey && expectedKey === normalizePlaceText(candidate));
}

function locationTerms(value: string | null | undefined) {
  const normalized = normalizeWords(value);
  if (!normalized) return [];
  return CITY_ALIASES[normalized] ?? [normalized];
}

export function placeLocationMatches(
  formattedAddress: string | null | undefined,
  expected: {
    city?: string | null;
    state?: string | null;
    address?: string | null;
  },
) {
  const candidateAddress = normalizePlaceText(formattedAddress);
  if (!candidateAddress) return false;

  const rawCity = normalizeWords(expected.city);
  const localityTerms = [
    ...locationTerms(expected.city),
    ...locationTerms(expected.state),
    ...(CITY_STATE_ALIASES[rawCity] ?? []),
  ].map(normalizePlaceText).filter(Boolean);
  const submittedAddress = normalizePlaceText(expected.address);
  if (localityTerms.length === 0 && !submittedAddress) return false;

  const localityMatches =
    localityTerms.length === 0 ||
    localityTerms.some((term) => candidateAddress.includes(term));
  const addressMatches =
    !submittedAddress ||
    candidateAddress.includes(submittedAddress) ||
    submittedAddress.includes(candidateAddress);
  return localityMatches && addressMatches;
}

export function matchingGooglePlaces<
  Place extends {
    displayName?: { text?: string };
    formattedAddress?: string;
  },
>(
  places: Place[],
  expectedNames: Array<string | null | undefined>,
  expectedLocation: {
    city?: string | null;
    state?: string | null;
    address?: string | null;
  },
) {
  const names = expectedNames.filter(
    (name): name is string => Boolean(name?.trim()),
  );
  return places.filter(
    (place) =>
      names.some((name) => placeNameIsExact(name, place.displayName?.text)) &&
      placeLocationMatches(place.formattedAddress, expectedLocation),
  );
}