import { Router, type IRouter } from "express";
import {
  GetVendorPublicSearchCheckQueryParams,
  GetVendorPublicSearchCheckResponse,
  GetVendorReviewCheckQueryParams,
  GetVendorReviewCheckResponse,
} from "@workspace/api-zod";
import {
  runVendorPublicSearchCheck,
  runVendorReviewCheck,
  VendorCheckError,
} from "../lib/vendorCheck";

const router: IRouter = Router();

router.get("/vendor-check/reviews", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const query = GetVendorReviewCheckQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "A vendor name and city are required." });
    return;
  }
  try {
    const result = await runVendorReviewCheck(query.data.name, query.data.city);
    res.json(GetVendorReviewCheckResponse.parse(result));
  } catch (error) {
    const status = error instanceof VendorCheckError ? error.status : 502;
    req.log.error({ err: error }, "Vendor review check failed");
    res.status(status).json({
      error:
        error instanceof VendorCheckError
          ? error.message
          : "Vendor review check is unavailable right now.",
    });
  }
});

router.get("/vendor-check/public-search", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const query = GetVendorPublicSearchCheckQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "A vendor name is required." });
    return;
  }
  try {
    const result = await runVendorPublicSearchCheck(query.data.name);
    res.json(GetVendorPublicSearchCheckResponse.parse(result));
  } catch (error) {
    const status = error instanceof VendorCheckError ? error.status : 502;
    req.log.error({ err: error }, "Vendor public search failed");
    res.status(status).json({
      error:
        error instanceof VendorCheckError
          ? error.message
          : "Public search is unavailable right now.",
    });
  }
});

export default router;