import assert from "node:assert/strict";
import test from "node:test";

import { runVendorReviewCheck, VendorCheckError } from "./vendorCheck.js";

type Place = {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  userRatingCount?: number;
  googleMapsUri?: string;
};

async function withPlaces(places: Place[], run: () => Promise<void>) {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/places:searchText")) {
      return Response.json({ places });
    }

    const placeId = decodeURIComponent(url.split("/").at(-1) ?? "");
    return Response.json({
      googleMapsUri: `https://maps.google.com/?cid=${placeId}`,
      reviews: [],
    });
  };

  try {
    await run();
  } finally {
    if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  }
}

test("selects the exact singular Woodpecker name when Google ranks the plural branch first", async () => {
  await withPlaces(
    [
      {
        id: "woodpecker-horamavu",
        displayName: { text: "Woodpecker Interiors" },
        formattedAddress: "Horamavu, Bengaluru, Karnataka 560043, India",
        userRatingCount: 500,
      },
      {
        id: "woodpecker-machohalli",
        displayName: { text: "Woodpecker Interior" },
        formattedAddress:
          "Kadabagere Cross, Machohalli, Bengaluru, Karnataka 560091, India",
        userRatingCount: 12,
      },
    ],
    async () => {
      const result = await runVendorReviewCheck("Woodpecker Interior", "Bangalore");
      assert.equal(
        result.sourceUrl,
        "https://maps.google.com/?cid=woodpecker-machohalli",
      );
    },
  );
});

test("accepts common Bengaluru spelling variants", async () => {
  const place: Place = {
    id: "woodpecker-machohalli",
    displayName: { text: "Woodpecker Interior" },
    formattedAddress:
      "Kadabagere Cross, Machohalli, Bengaluru, Karnataka 560091, India",
  };

  for (const city of ["Bangalore", "Bengaluru", "Bangaluru", "Banglore", "Bengluru"]) {
    await withPlaces([place], async () => {
      const result = await runVendorReviewCheck("Woodpecker Interior", city);
      assert.equal(
        result.sourceUrl,
        "https://maps.google.com/?cid=woodpecker-machohalli",
        city,
      );
    });
  }
});

test("rejects a sole similarly named listing instead of treating it as the vendor", async () => {
  await withPlaces(
    [
      {
        id: "plural-branch",
        displayName: { text: "Woodpecker Interiors" },
        formattedAddress: "Horamavu, Bengaluru, Karnataka 560043, India",
      },
    ],
    async () => {
      await assert.rejects(
        runVendorReviewCheck("Woodpecker Interior", "Bangalore"),
        (error: unknown) =>
          error instanceof VendorCheckError &&
          error.status === 404 &&
          error.message === "Vendor not found on Google Maps.",
      );
    },
  );
});

test("rejects unrelated and out-of-location listings", async (t) => {
  await t.test("unrelated name", async () => {
    await withPlaces(
      [
        {
          id: "unrelated",
          displayName: { text: "Oak & Pine Furnishings" },
          formattedAddress: "Machohalli, Bengaluru, Karnataka 560091, India",
        },
      ],
      async () => {
        await assert.rejects(
          runVendorReviewCheck("Woodpecker Interior", "Bangalore"),
          (error: unknown) =>
            error instanceof VendorCheckError &&
            error.status === 404 &&
            error.message === "Vendor not found on Google Maps.",
        );
      },
    );
  });

  await t.test("wrong location", async () => {
    await withPlaces(
      [
        {
          id: "wrong-location",
          displayName: { text: "Woodpecker Interior" },
          formattedAddress: "Panaji, Goa 403001, India",
        },
      ],
      async () => {
        await assert.rejects(
          runVendorReviewCheck("Woodpecker Interior", "Bangalore"),
          (error: unknown) =>
            error instanceof VendorCheckError &&
            error.status === 404 &&
            error.message === "Vendor not found on Google Maps.",
        );
      },
    );
  });
});