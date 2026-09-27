import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  vendorIdentitiesTable,
} from "@workspace/db";
import { persistVendorAdapterEvidence } from "./evidenceEngine";
import { matchingGooglePlaces } from "./vendorPlaceMatching";

export const GOOGLE_PLACES_SOURCE = "google_places";
export const UNVERIFIED_STATUS = "unverified";

export type VendorIdentityInput = {
  vendorName: string;
  legalName?: string | null;
  gstin?: string | null;
  cin?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type NormalizedVendorIdentity = {
  vendorName: string;
  legalName: string | null;
  gstin: string | null;
  cin: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  vendorNameKey: string;
  legalNameKey: string | null;
  gstinKey: string | null;
  cinKey: string | null;
  phoneKey: string | null;
  websiteKey: string | null;
  addressKey: string | null;
  cityKey: string | null;
  stateKey: string | null;
};

export type GooglePlacesResult = {
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  id?: string;
  types?: string[];
};

export type AdapterResult = {
  status: "available" | "not_configured" | "no_match" | "error";
  query: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  result?: Record<string, unknown> | null;
  claims?: Record<string, unknown> | null;
  error?: string | null;
};

const cleanText = (value: string | null | undefined) => {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned : null;
};

const keyText = (value: string | null | undefined) =>
  cleanText(value)?.normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, "") ?? null;

const keyPhone = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, "");
  return digits ? (digits.length > 10 ? digits.slice(-10) : digits) : null;
};

const keyWebsite = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned.includes("://") ? cleaned : `https://${cleaned}`);
    return url.hostname.toLocaleLowerCase("en-IN").replace(/^www\./, "");
  } catch {
    return keyText(cleaned);
  }
};

export function normalizeVendorIdentity(input: VendorIdentityInput): NormalizedVendorIdentity {
  const vendorName = cleanText(input.vendorName) ?? "";
  const legalName = cleanText(input.legalName);
  const gstin = cleanText(input.gstin)?.toUpperCase() ?? null;
  const cin = cleanText(input.cin)?.toUpperCase() ?? null;
  const phone = cleanText(input.phone);
  const website = cleanText(input.website);
  const address = cleanText(input.address);
  const city = cleanText(input.city);
  const state = cleanText(input.state);

  return {
    vendorName,
    legalName,
    gstin,
    cin,
    phone,
    website,
    address,
    city,
    state,
    vendorNameKey: keyText(vendorName) ?? "",
    legalNameKey: keyText(legalName),
    gstinKey: keyText(gstin),
    cinKey: keyText(cin),
    phoneKey: keyPhone(phone),
    websiteKey: keyWebsite(website),
    addressKey: keyText(address),
    cityKey: keyText(city),
    stateKey: keyText(state),
  };
}

export function getIdentityKey(identity: NormalizedVendorIdentity): string {
  return [
    "v1",
    `name:${identity.vendorNameKey}`,
    `legal:${identity.legalNameKey ?? ""}`,
    `gstin:${identity.gstinKey ?? ""}`,
    `cin:${identity.cinKey ?? ""}`,
    `phone:${identity.phoneKey ?? ""}`,
    `website:${identity.websiteKey ?? ""}`,
    `address:${identity.addressKey ?? ""}`,
    `city:${identity.cityKey ?? ""}`,
    `state:${identity.stateKey ?? ""}`,
  ].join("|");
}

function getResolutionScope(identity: NormalizedVendorIdentity): string {
  return [
    "vendor-resolution-v1",
    `name:${identity.vendorNameKey}`,
  ].join("|");
}

export function buildPlacesQuery(identity: NormalizedVendorIdentity): string {
  const strongParts = [identity.vendorName, identity.legalName, identity.address, identity.city, identity.state]
    .filter(Boolean)
    .slice(0, 4);
  return strongParts.join(", ");
}

function selectedPlaceResult(place: GooglePlacesResult): Record<string, unknown> {
  return {
    placeId: place.id ?? null,
    displayName: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    nationalPhoneNumber: place.nationalPhoneNumber ?? null,
    websiteUri: place.websiteUri ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    businessStatus: place.businessStatus ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    types: place.types ?? [],
  };
}

function hasSubmittedLocation(identity: NormalizedVendorIdentity) {
  return Boolean(identity.cityKey || identity.stateKey || identity.addressKey);
}

export function isConservativePlaceMatch(
  identity: NormalizedVendorIdentity,
  place: GooglePlacesResult,
) {
  return matchingGooglePlaces(
    [place],
    [identity.vendorName, identity.legalName],
    {
      city: identity.city,
      state: identity.state,
      address: identity.address,
    },
  ).length === 1;
}

export interface VendorSourceAdapter {
  readonly source: string;
  lookup(identity: NormalizedVendorIdentity): Promise<AdapterResult>;
}

export class GooglePlacesAdapter implements VendorSourceAdapter {
  readonly source = GOOGLE_PLACES_SOURCE;

  async lookup(identity: NormalizedVendorIdentity): Promise<AdapterResult> {
    const query = buildPlacesQuery(identity);
    if (!hasSubmittedLocation(identity)) {
      return {
        status: "no_match",
        query,
        result: { places: [] },
        error:
          "A city, state, or address is required before Google Places can be matched safely.",
      };
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return {
        status: "not_configured",
        query,
        error: "Google Places API is not connected in this environment.",
      };
    }

    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.types",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "en",
          regionCode: "IN",
          maxResultCount: 20,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        return {
          status: "error",
          query,
          error: `Google Places API returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        };
      }

      const payload = (await response.json()) as { places?: GooglePlacesResult[] };
      const places = payload.places ?? [];
      const plausibleMatches = matchingGooglePlaces(
        places,
        [identity.vendorName, identity.legalName],
        {
          city: identity.city,
          state: identity.state,
          address: identity.address,
        },
      );
      const resultSetMayBeTruncated = places.length === 20;
      const selected =
        !resultSetMayBeTruncated && plausibleMatches.length === 1
          ? plausibleMatches[0]
          : undefined;
      if (!selected) {
        return {
          status: "no_match",
          query,
          result: { places: [] },
          error:
            "No unique Google Places result matched both the submitted vendor name and location.",
        };
      }

      const result = selectedPlaceResult(selected);
      const sourceUrl =
        typeof selected.googleMapsUri === "string"
          ? selected.googleMapsUri
          : selected.id
            ? `https://www.google.com/maps/search/?api=1&query=place_id:${encodeURIComponent(selected.id)}`
            : result.formattedAddress || result.displayName
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(result.formattedAddress || result.displayName))}`
              : null;
      return {
        status: "available",
        query,
        externalId: selected.id ?? null,
        sourceUrl,
        result,
        claims: {
          displayName: result.displayName,
          formattedAddress: result.formattedAddress,
          nationalPhoneNumber: result.nationalPhoneNumber,
          websiteUri: result.websiteUri,
          rating: result.rating,
          userRatingCount: result.userRatingCount,
          businessStatus: result.businessStatus,
        },
      };
    } catch (error) {
      return {
        status: "error",
        query,
        error: error instanceof Error ? error.message : "Google Places request failed.",
      };
    }
  }
}

function fieldConflicts(
  incoming: string | null,
  existing: string | null | undefined,
) {
  return Boolean(incoming && existing && incoming !== existing);
}

function hasIdentifierConflict(
  incoming: NormalizedVendorIdentity,
  existing: NormalizedVendorIdentity,
) {
  return [
    [incoming.legalNameKey, existing.legalNameKey],
    [incoming.gstinKey, existing.gstinKey],
    [incoming.cinKey, existing.cinKey],
    [incoming.phoneKey, existing.phoneKey],
    [incoming.websiteKey, existing.websiteKey],
    [incoming.addressKey, existing.addressKey],
    [incoming.cityKey, existing.cityKey],
    [incoming.stateKey, existing.stateKey],
  ].some(([left, right]) => fieldConflicts(left, right));
}

function canReuseIdentity(
  incoming: NormalizedVendorIdentity,
  existing: NormalizedVendorIdentity,
) {
  if (incoming.vendorNameKey !== existing.vendorNameKey) return false;
  if (hasIdentifierConflict(incoming, existing)) return false;

  const hasStrongMatch = Boolean(
    (incoming.gstinKey && incoming.gstinKey === existing.gstinKey) ||
      (incoming.cinKey && incoming.cinKey === existing.cinKey),
  );
  if (hasStrongMatch) return true;

  const hasContactMatch = Boolean(
    (incoming.phoneKey && incoming.phoneKey === existing.phoneKey) ||
      (incoming.websiteKey && incoming.websiteKey === existing.websiteKey),
  );
  if (hasContactMatch) return true;

  return Boolean(
    incoming.cityKey &&
      incoming.stateKey &&
      incoming.cityKey === existing.cityKey &&
      incoming.stateKey === existing.stateKey,
  );
}

function mergeIdentity(
  existing: NormalizedVendorIdentity,
  incoming: NormalizedVendorIdentity,
): NormalizedVendorIdentity {
  return normalizeVendorIdentity({
    vendorName: incoming.vendorName || existing.vendorName,
    legalName: incoming.legalName ?? existing.legalName,
    gstin: incoming.gstin ?? existing.gstin,
    cin: incoming.cin ?? existing.cin,
    phone: incoming.phone ?? existing.phone,
    website: incoming.website ?? existing.website,
    address: incoming.address ?? existing.address,
    city: incoming.city ?? existing.city,
    state: incoming.state ?? existing.state,
  });
}

export async function createOrReuseVendorIdentity(
  ownerId: string,
  input: VendorIdentityInput,
) {
  const normalized = normalizeVendorIdentity(input);
  const identityKey = getIdentityKey(normalized);
  const resolutionLock = `${ownerId}|${getResolutionScope(normalized)}`;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${resolutionLock}))`,
    );

    const ownerRecords = await tx
      .select()
      .from(vendorIdentitiesTable)
      .where(eq(vendorIdentitiesTable.ownerId, ownerId));
    const compatibleRecords = ownerRecords.filter((record) =>
      canReuseIdentity(normalized, record.normalizedJson as NormalizedVendorIdentity),
    );
    const existing =
      compatibleRecords.length === 1 ? compatibleRecords[0] : undefined;

    if (existing) {
      const merged = mergeIdentity(
        existing.normalizedJson as NormalizedVendorIdentity,
        normalized,
      );
      const [updated] = await tx
        .update(vendorIdentitiesTable)
        .set({
          vendorName: merged.vendorName,
          legalName: merged.legalName,
          gstin: merged.gstin,
          cin: merged.cin,
          phone: merged.phone,
          website: merged.website,
          address: merged.address,
          city: merged.city,
          state: merged.state,
          identityKey: getIdentityKey(merged),
          normalizedJson: merged,
          updatedAt: new Date(),
        })
        .where(eq(vendorIdentitiesTable.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await tx
      .insert(vendorIdentitiesTable)
      .values({
        id: `vnd-int-${crypto.randomUUID()}`,
        ownerId,
        vendorName: normalized.vendorName,
        legalName: normalized.legalName,
        gstin: normalized.gstin,
        cin: normalized.cin,
        phone: normalized.phone,
        website: normalized.website,
        address: normalized.address,
        city: normalized.city,
        state: normalized.state,
        identityKey,
        normalizedJson: normalized,
      })
      .onConflictDoNothing({
        target: [vendorIdentitiesTable.ownerId, vendorIdentitiesTable.identityKey],
      })
      .returning();
    if (created) return created;

    const [concurrentMatch] = await tx
      .select()
      .from(vendorIdentitiesTable)
      .where(
        and(
          eq(vendorIdentitiesTable.ownerId, ownerId),
          eq(vendorIdentitiesTable.identityKey, identityKey),
        ),
      );
    if (concurrentMatch) return concurrentMatch;

    throw new Error("Vendor identity could not be created after conflict resolution.");
  });
}

export async function saveEvidence(
  vendorIdentityId: string,
  adapterResult: AdapterResult,
) {
  return persistVendorAdapterEvidence(vendorIdentityId, {
    ...adapterResult,
    source: GOOGLE_PLACES_SOURCE,
  });
}

export function getInformationalMatchConfidence(identity: NormalizedVendorIdentity, adapterResult: AdapterResult) {
  const suppliedFields = [
    identity.vendorName,
    identity.legalName,
    identity.gstin,
    identity.cin,
    identity.phone,
    identity.website,
    identity.address,
    identity.city,
    identity.state,
  ].filter(Boolean).length;
  const base = Math.round((suppliedFields / 9) * 60);
  const sourceBonus = adapterResult.status === "available" ? 18 : adapterResult.status === "no_match" ? 4 : 0;
  return Math.min(78, base + sourceBonus);
}
