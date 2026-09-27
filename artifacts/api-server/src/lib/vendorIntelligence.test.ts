import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  vendorEvidenceRecordsTable,
  vendorIdentitiesTable,
} from "@workspace/db";
import {
  createOrReuseVendorIdentity,
  GooglePlacesAdapter,
  normalizeVendorIdentity,
  saveEvidence,
  type VendorIdentityInput,
} from "./vendorIntelligence";
import { isEvidenceVerificationStatus } from "./evidenceEngine";

const makeOwnerId = () => `vendor-identity-test-${crypto.randomUUID()}`;

test.after(async () => {
  await pool.end();
});

async function cleanupOwner(ownerId: string) {
  await db.execute(sql`
    DELETE FROM vendor_evidence_records
    WHERE vendor_identity_id IN (
      SELECT id FROM vendor_identities WHERE owner_id = ${ownerId}
    )
  `);
  await db
    .delete(vendorIdentitiesTable)
    .where(eq(vendorIdentitiesTable.ownerId, ownerId));
}

async function countOwnerIdentities(ownerId: string) {
  const records = await db
    .select({ id: vendorIdentitiesTable.id })
    .from(vendorIdentitiesTable)
    .where(eq(vendorIdentitiesTable.ownerId, ownerId));
  return records.length;
}

const baseIdentity: VendorIdentityInput = {
  vendorName: "Northstar Interiors",
  legalName: "Northstar Interiors Private Limited",
  gstin: "27AABCN1234F1Z5",
  cin: "U74999MH2020PTC123456",
  phone: "+91 98765 43210",
  website: "https://www.northstar.example",
  address: "12 Design Avenue",
  city: "Pune",
  state: "Maharashtra",
};

test("reuses one identity and enriches it when supplementary details arrive", async () => {
  const ownerId = makeOwnerId();
  try {
    const initial = await createOrReuseVendorIdentity(ownerId, {
      vendorName: baseIdentity.vendorName,
      phone: baseIdentity.phone,
      city: baseIdentity.city,
      state: baseIdentity.state,
    });
    const enriched = await createOrReuseVendorIdentity(ownerId, {
      vendorName: baseIdentity.vendorName,
      phone: "09876543210",
      website: baseIdentity.website,
      address: baseIdentity.address,
      city: baseIdentity.city,
      state: baseIdentity.state,
    });

    assert.equal(enriched.id, initial.id);
    assert.equal(enriched.website, baseIdentity.website);
    assert.equal(enriched.address, baseIdentity.address);
    assert.equal(enriched.phone, "09876543210");
    assert.equal(
      (enriched.normalizedJson as { phoneKey: string }).phoneKey,
      "9876543210",
    );
    assert.equal(await countOwnerIdentities(ownerId), 1);
  } finally {
    await cleanupOwner(ownerId);
  }
});

test("keeps identities separate when supplied identifiers conflict", async (t) => {
  const conflictingFields: Array<keyof VendorIdentityInput> = [
    "gstin",
    "cin",
    "phone",
    "website",
    "address",
    "legalName",
  ];

  for (const field of conflictingFields) {
    await t.test(`does not merge a conflicting ${field}`, async () => {
      const ownerId = makeOwnerId();
      try {
        const initial = await createOrReuseVendorIdentity(ownerId, baseIdentity);
        const conflicting: VendorIdentityInput = {
          ...baseIdentity,
          [field]:
            field === "phone"
              ? "+91 91234 56789"
              : field === "website"
                ? "https://other.example"
                : field === "address"
                  ? "99 Different Street"
                  : field === "legalName"
                    ? "Northstar Interiors LLP"
                    : `different-${field}`,
        };
        const separate = await createOrReuseVendorIdentity(ownerId, conflicting);

        assert.notEqual(separate.id, initial.id);
        assert.equal(await countOwnerIdentities(ownerId), 2);
      } finally {
        await cleanupOwner(ownerId);
      }
    });
  }
});

test("keeps identities separate when the vendor name conflicts", async () => {
  const ownerId = makeOwnerId();
  try {
    const initial = await createOrReuseVendorIdentity(ownerId, baseIdentity);
    const separate = await createOrReuseVendorIdentity(ownerId, {
      ...baseIdentity,
      vendorName: "Northstar Studio",
    });

    assert.notEqual(separate.id, initial.id);
    assert.equal(await countOwnerIdentities(ownerId), 2);
  } finally {
    await cleanupOwner(ownerId);
  }
});

test("concurrent identical and complementary submissions converge to one identity", async () => {
  const ownerId = makeOwnerId();
  try {
    const [first, duplicate, withWebsite, withAddress] = await Promise.all([
      createOrReuseVendorIdentity(ownerId, {
        vendorName: baseIdentity.vendorName,
        phone: baseIdentity.phone,
        city: baseIdentity.city,
        state: baseIdentity.state,
      }),
      createOrReuseVendorIdentity(ownerId, {
        vendorName: baseIdentity.vendorName,
        phone: baseIdentity.phone,
        city: baseIdentity.city,
        state: baseIdentity.state,
      }),
      createOrReuseVendorIdentity(ownerId, {
        vendorName: baseIdentity.vendorName,
        phone: baseIdentity.phone,
        website: baseIdentity.website,
        city: baseIdentity.city,
        state: baseIdentity.state,
      }),
      createOrReuseVendorIdentity(ownerId, {
        vendorName: baseIdentity.vendorName,
        phone: baseIdentity.phone,
        address: baseIdentity.address,
        city: baseIdentity.city,
        state: baseIdentity.state,
      }),
    ]);

    assert.deepEqual(
      new Set([first.id, duplicate.id, withWebsite.id, withAddress.id]).size,
      1,
    );
    assert.equal(await countOwnerIdentities(ownerId), 1);

    const [merged] = await db
      .select()
      .from(vendorIdentitiesTable)
      .where(
        and(
          eq(vendorIdentitiesTable.ownerId, ownerId),
          eq(vendorIdentitiesTable.id, first.id),
        ),
      );
    assert.equal(merged?.website, baseIdentity.website);
    assert.equal(merged?.address, baseIdentity.address);
  } finally {
    await cleanupOwner(ownerId);
  }
});

test("persists every adapter status with a supported structured verification status", async () => {
  const ownerId = makeOwnerId();
  try {
    const identity = await createOrReuseVendorIdentity(ownerId, baseIdentity);
    const statuses = ["available", "not_configured", "no_match", "error"] as const;

    for (const status of statuses) {
      await saveEvidence(identity.id, {
        status,
        query: `Northstar ${status}`,
        result: status === "available" ? { placeId: "place-1" } : null,
        claims: status === "available" ? { rating: 4.8 } : null,
        error: status === "error" ? "adapter failed" : null,
      });
    }

    const records = await db
      .select()
      .from(vendorEvidenceRecordsTable)
      .where(eq(vendorEvidenceRecordsTable.vendorId, identity.id));
    assert.deepEqual(
      records
        .map((record) => [record.status, record.verificationStatus])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
      [
        ["available", "PUBLICLY_FOUND"],
        ["error", "NOT_AVAILABLE"],
        ["no_match", "NOT_AVAILABLE"],
        ["not_configured", "NOT_AVAILABLE"],
      ],
    );
    assert.ok(records.every((record) => record.source === "google_places"));
  } finally {
    await cleanupOwner(ownerId);
  }
});

test("returns a public match only when exactly one location-compatible listing remains", async () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            id: "place-1",
            displayName: { text: "Northstar Interiors" },
            formattedAddress: "12 Design Avenue, Pune, Maharashtra, India",
            nationalPhoneNumber: "+91 98765 43210",
            websiteUri: "https://northstar.example",
            rating: 4.8,
            userRatingCount: 42,
            googleMapsUri: "https://maps.google.com/?cid=1",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const identity = normalizeVendorIdentity({
      vendorName: "Northstar Interiors",
      city: "Pune",
      state: "Maharashtra",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "available");
    assert.equal(result.externalId, "place-1");
    assert.equal(result.sourceUrl, "https://maps.google.com/?cid=1");
    assert.equal(result.claims?.formattedAddress, "12 Design Avenue, Pune, Maharashtra, India");
  } finally {
    if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  }
});

test("accepts a unique exact-name listing when Google uses a nearby locality in the submitted state", async () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            id: "place-metro",
            displayName: { text: "Woodpecker Interior" },
            formattedAddress:
              "Kadabagere Cross, Machohalli, Karnataka 560091, India",
            businessStatus: "OPERATIONAL",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const identity = normalizeVendorIdentity({
      vendorName: "Woodpecker Interior",
      city: "Bangalore",
      state: "Karnataka",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "available");
    assert.equal(result.externalId, "place-metro");
  } finally {
    if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  }
});

test("prefers the exact vendor name by rejecting a similarly named Places result", async () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  globalThis.fetch = async () =>
    Response.json({
      places: [
        {
          id: "plural-branch",
          displayName: { text: "Woodpecker Interiors" },
          formattedAddress: "Horamavu, Bengaluru, Karnataka, India",
          userRatingCount: 500,
        },
        {
          id: "exact-branch",
          displayName: { text: "Woodpecker Interior" },
          formattedAddress: "Machohalli, Bengaluru, Karnataka, India",
          userRatingCount: 12,
        },
      ],
    });

  try {
    const identity = normalizeVendorIdentity({
      vendorName: "Woodpecker Interior",
      city: "Bangalore",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "available");
    assert.equal(result.externalId, "exact-branch");
  } finally {
    if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  }
});

test("keeps ambiguous and name-only Places responses unavailable", async (t) => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

  await t.test("ambiguous location matches do not select an exact result", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place-1",
              displayName: { text: "Northstar Interiors" },
              formattedAddress: "12 Design Avenue, Pune, Maharashtra, India",
            },
            {
              id: "place-2",
              displayName: { text: "Northstar Interiors" },
              formattedAddress: "99 Design Avenue, Pune, Maharashtra, India",
            },
          ],
        }),
        { status: 200 },
      );
    const identity = normalizeVendorIdentity({
      vendorName: "Northstar Interiors",
      city: "Pune",
      state: "Maharashtra",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "no_match");
  });

  await t.test("a sole similarly named listing is not treated as the submitted vendor", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place-1",
              displayName: { text: "Northstar Interiors Studio" },
              formattedAddress: "12 Design Avenue, Pune, Maharashtra, India",
            },
          ],
        }),
        { status: 200 },
      );
    const identity = normalizeVendorIdentity({
      vendorName: "Northstar Interiors",
      city: "Pune",
      state: "Maharashtra",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "no_match");
  });

  await t.test("a sole exact-name listing in a different submitted state is not asserted", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place-1",
              displayName: { text: "Northstar Interiors" },
              formattedAddress: "12 Design Avenue, Panaji, Goa, India",
            },
          ],
        }),
        { status: 200 },
      );
    const identity = normalizeVendorIdentity({
      vendorName: "Northstar Interiors",
      city: "Pune",
      state: "Maharashtra",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "no_match");
  });

  await t.test("a capped result set remains unavailable because uniqueness is indeterminate", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          places: Array.from({ length: 20 }, (_, index) => ({
            id: `place-${index}`,
            displayName: {
              text: index === 0 ? "Northstar Interiors" : `Other Business ${index}`,
            },
            formattedAddress: "Pune, Maharashtra, India",
          })),
        }),
        { status: 200 },
      );
    const identity = normalizeVendorIdentity({
      vendorName: "Northstar Interiors",
      city: "Pune",
      state: "Maharashtra",
    });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "no_match");
  });

  await t.test("name-only searches are not asserted even if Places returns a listing", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(
        JSON.stringify({
          places: [
            {
              id: "place-1",
              displayName: { text: "Northstar Interiors" },
              formattedAddress: "Pune, Maharashtra, India",
            },
          ],
        }),
        { status: 200 },
      );
    };
    const identity = normalizeVendorIdentity({ vendorName: "Northstar Interiors" });
    const result = await new GooglePlacesAdapter().lookup(identity);
    assert.equal(result.status, "no_match");
    assert.equal(fetchCalled, false);
  });

  if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
  globalThis.fetch = originalFetch;
});

test("accepts only the exact evidence verification status vocabulary", () => {
  const supported = [
    "VERIFIED",
    "CROSS_VERIFIED",
    "PUBLICLY_FOUND",
    "PARTIALLY_VERIFIED",
    "UNVERIFIED",
    "CONFLICT",
    "NOT_AVAILABLE",
    "USER_VERIFICATION_REQUIRED",
  ];
  assert.ok(supported.every(isEvidenceVerificationStatus));
  assert.equal(isEvidenceVerificationStatus("unverified"), false);
  assert.equal(isEvidenceVerificationStatus("verified"), false);
  assert.equal(isEvidenceVerificationStatus("PENDING"), false);
});