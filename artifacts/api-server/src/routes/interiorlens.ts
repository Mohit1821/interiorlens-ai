import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAnalysisBody,
  CreateAnalysisResponse,
  CreateEvidenceRecordBody,
  CreateEvidenceRecordResponse,
  GetAccountResponse,
  GetAnalysisParams,
  GetAnalysisResponse,
  GetQuoteIntelligenceResponse,
  AnalyzeQuoteIntelligenceResponse,
  GenerateVendorMessageBody,
  GenerateVendorMessageParams,
  GenerateVendorMessageResponse,
  GenerateBulkVendorMessageParams,
  GenerateBulkVendorMessageBody,
  GenerateBulkVendorMessageResponse,
  GetDashboardResponse,
  ListAnalysesResponse,
  ListInsightsResponse,
  ListQuotesResponse,
  ListAnalysisVendorsResponse,
  ListVendorsResponse,
  ResearchAnalysisVendorBody,
  ResearchAnalysisVendorResponse,
} from "@workspace/api-zod";
import {
  analysesTable,
  db,
  evidenceRecordsTable,
  pool,
  quotationExtractionsTable,
  quoteIntelligenceRunsTable,
  quotesTable,
  uploadIntentsTable,
  vendorIdentitiesTable,
} from "@workspace/db";
import type { Analysis, Insight, Quote, Vendor } from "@workspace/interiorlens-types";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  DocumentExtractionError,
  EXTRACTION_MODEL,
  extractQuotation,
  type QuotationExtractionResult,
} from "../lib/quotationExtraction";
import {
  INTELLIGENCE_MODEL,
  analyzeQuotation,
  calculateDocumentationCompletenessScore,
  sanitizeQuoteFindings,
  type QuoteIntelligenceResult,
} from "../lib/quoteIntelligence";
import {
  computeQuoteVerdict,
  generateBulkVendorMessage,
  generateVerdictSummary,
} from "../lib/quoteReport";
import {
  deleteEvidenceForAnalysisSource,
  createEvidenceRecord,
  listEvidenceForAnalysis,
  persistQuotationEvidence,
  persistQuoteFindingEvidence,
  replaceAnalysisVendorEvidence,
  toEvidenceRecord,
} from "../lib/evidenceEngine";
import {
  createOrReuseVendorIdentity,
  GooglePlacesAdapter,
  normalizeVendorIdentity,
} from "../lib/vendorIntelligence";
import { generateVendorClarificationMessage } from "../lib/vendorMessage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const googlePlacesAdapter = new GooglePlacesAdapter();
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB maximum for PostgreSQL database protection

const initialAnalyses = [
  {
    id: "ana-elm-street",
    name: "Elm Street residence",
    room: "Living room",
    status: "complete",
    progress: 100,
    address: "Elm Street, Brooklyn",
  },
  {
    id: "ana-harbor",
    name: "Harbor apartment",
    room: "Primary bathroom",
    status: "vendor-matching",
    progress: 76,
    address: "West Harbor, Seattle",
  },
  {
    id: "ana-mill-house",
    name: "Mill House",
    room: "Kitchen",
    status: "processing",
    progress: 42,
    address: "Mill Road, Austin",
  },
] as const;

const mockQuotes: Quote[] = [
  {
    id: "quo-01",
    analysisId: "ana-elm-street",
    vendorName: "Morrow + Reed",
    category: "Floor refinishing",
    amount: 4860,
    status: "recommended",
    note: "Clear scope and the strongest material allowance.",
    evidence: [],
  },
  {
    id: "quo-02",
    analysisId: "ana-elm-street",
    vendorName: "Northline Works",
    category: "Lighting update",
    amount: 2240,
    status: "review",
    note: "Lead time suits the phased project schedule.",
    evidence: [],
  },
  {
    id: "quo-03",
    analysisId: "ana-harbor",
    vendorName: "Palisade Tile",
    category: "Tile and waterproofing",
    amount: 7310,
    status: "received",
    note: "Includes a 10-year installation warranty.",
    evidence: [],
  },
];

const mockVendors: Vendor[] = [
  {
    id: "ven-morrow",
    name: "Morrow + Reed",
    specialty: "Floor restoration",
    location: "Brooklyn, NY",
    rating: 4.9,
    verified: false,
    responseTime: "",
    evidence: [],
  },
  {
    id: "ven-palisade",
    name: "Palisade Tile",
    specialty: "Bath renovation",
    location: "Seattle, WA",
    rating: 4.8,
    verified: false,
    responseTime: "",
    evidence: [],
  },
  {
    id: "ven-northline",
    name: "Northline Works",
    specialty: "Lighting and electrical",
    location: "New York, NY",
    rating: 4.7,
    verified: false,
    responseTime: "",
    evidence: [],
  },
];

const mockInsights: Insight[] = [
  {
    id: "ins-01",
    title: "Floor finish is nearing end of life",
    category: "Surface condition",
    severity: "High priority",
    detail: "Wear is concentrated along the primary circulation path and near the eastern window.",
    evidence: "Evidence 01 · edge abrasion, 3 locations",
    evidenceRecords: [],
    estimate: 4860,
  },
  {
    id: "ins-02",
    title: "Lighting layers are under-serving the seating zone",
    category: "Lighting",
    severity: "Opportunity",
    detail: "Ambient coverage is uneven and task light is absent from the reading corner.",
    evidence: "Evidence 02 · shadow falloff and fixture spacing",
    evidenceRecords: [],
    estimate: 2240,
  },
  {
    id: "ins-03",
    title: "Moisture protection needs verification before tile work",
    category: "Envelope",
    severity: "High priority",
    detail: "The current tile joint pattern suggests an earlier localized repair near the shower threshold.",
    evidence: "Evidence 03 · grout variation and threshold staining",
    evidenceRecords: [],
    estimate: 7310,
  },
];

const toAnalysis = (
  record: typeof analysesTable.$inferSelect,
  replacementAnalysisId: string | null = null,
): Analysis => ({
  id: record.id,
  name: record.name,
  room: record.room,
  status: record.status as Analysis["status"],
  progress: record.progress,
  address: record.address,
  fileName: record.uploadedFileName,
  sourceAnalysisId: record.sourceAnalysisId,
  replacementAnalysisId,
  createdAt: record.createdAt.toISOString(),
});

const toAnalyses = (records: (typeof analysesTable.$inferSelect)[]): Analysis[] => {
  const replacementBySource = new Map(
    records
      .filter((record) => record.sourceAnalysisId)
      .map((record) => [record.sourceAnalysisId!, record.id]),
  );
  return records.map((record) =>
    toAnalysis(record, replacementBySource.get(record.id) ?? null),
  );
};

const emptyExtractionField = {
  value: null,
  confidence: 0,
  evidence: null,
} as const;

const toExtractionResponse = (
  record: typeof quotationExtractionsTable.$inferSelect | undefined,
  analysisId: string,
) => {
  const storedResult =
    (record?.extractedJson as QuotationExtractionResult | null) ?? null;
  const result = storedResult
    ? {
        ...storedResult,
        subtotalBeforeGst:
          storedResult.subtotalBeforeGst ?? emptyExtractionField,
        gstRate: storedResult.gstRate ?? emptyExtractionField,
        gstAmount: storedResult.gstAmount ?? emptyExtractionField,
        grandTotalInclusiveGst:
          storedResult.grandTotalInclusiveGst ?? emptyExtractionField,
      }
    : null;
  return {
    analysisId,
    status: record?.status ?? "pending",
    result,
    error: record?.error ?? null,
    model: record?.model ?? null,
  };
};

const toIntelligenceResponse = (
  record: typeof quoteIntelligenceRunsTable.$inferSelect | undefined,
  analysisId: string,
  extraction?: typeof quotationExtractionsTable.$inferSelect,
) => {
  const storedResult = record?.findingsJson as QuoteIntelligenceResult | null;
  const findings = storedResult
    ? sanitizeQuoteFindings(storedResult.findings)
    : null;
  return {
  analysisId,
  status: record?.status ?? "pending",
  findings,
  documentationCompletenessScore: record?.findingsJson
    ? (record.findingsJson as QuoteIntelligenceResult).documentationCompletenessScore
      ?? (extraction?.extractedJson && extraction.sourceText
        ? calculateDocumentationCompletenessScore(
            extraction.extractedJson as QuotationExtractionResult,
            extraction.sourceText,
          )
        : null)
    : null,
  verdict: findings
    ? computeQuoteVerdict(findings, storedResult?.verdictSummary)
    : null,
  error: record?.error ?? null,
  model: record?.model ?? null,
  };
};

async function getOwnedUploadAnalysis(analysisId: string, userId: string) {
  const [analysis] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, analysisId));

  if (!analysis || analysis.ownerId !== userId) {
    return null;
  }
  return analysis;
}

function toAnalysisVendor(
  identity: typeof vendorIdentitiesTable.$inferSelect,
  evidence: Awaited<ReturnType<typeof listEvidenceForAnalysis>>,
) {
  const vendorEvidence = evidence.filter((record) => record.vendorId === identity.id);
  const category = [...vendorEvidence]
    .reverse()
    .find((record) => record.claim === "trade_category")?.value;
  return {
    id: identity.id,
    name: identity.vendorName,
    specialty: category ?? "Category not provided",
    location:
      [identity.city, identity.state].filter(Boolean).join(", ") ||
      "Location not provided",
    evidence: vendorEvidence,
  };
}

async function ensureMockAnalyses(): Promise<void> {
  await db
    .insert(analysesTable)
    .values(
      initialAnalyses.map((analysis, index) => ({
        ...analysis,
        createdAt: new Date(Date.now() - index * 1000 * 60 * 60 * 24 * 5),
      })),
    )
    .onConflictDoNothing();
}

async function purgeOldAnalysesForUser(ownerId: string, keepCount: number = 3): Promise<void> {
  try {
    if (!ownerId) return;

    // Get all user-owned analyses ordered newest first
    const userAnalyses = await db
      .select({
        id: analysesTable.id,
        uploadedFilePath: analysesTable.uploadedFilePath,
      })
      .from(analysesTable)
      .where(eq(analysesTable.ownerId, ownerId))
      .orderBy(desc(analysesTable.createdAt));

    if (userAnalyses.length <= keepCount) {
      return;
    }

    const analysesToPurge = userAnalyses.slice(keepCount);
    for (const item of analysesToPurge) {
      const analysisId = item.id;

      // Unlink any replacement pointers
      await db
        .update(analysesTable)
        .set({ sourceAnalysisId: null })
        .where(eq(analysesTable.sourceAnalysisId, analysisId))
        .catch(() => undefined);

      // Delete child records
      await db.delete(quotesTable).where(eq(quotesTable.analysisId, analysisId)).catch(() => undefined);
      await db.delete(evidenceRecordsTable).where(eq(evidenceRecordsTable.analysisId, analysisId)).catch(() => undefined);
      await db.delete(quoteIntelligenceRunsTable).where(eq(quoteIntelligenceRunsTable.analysisId, analysisId)).catch(() => undefined);
      await db.delete(quotationExtractionsTable).where(eq(quotationExtractionsTable.analysisId, analysisId)).catch(() => undefined);

      // Delete binary file data from Supabase uploaded_files table to free space
      if (item.uploadedFilePath) {
        const fileId = item.uploadedFilePath
          .replace(/^\/objects\/uploads\//, '')
          .replace(/^\/objects\//, '')
          .trim();
        if (fileId) {
          await pool.query('DELETE FROM uploaded_files WHERE id = $1', [fileId]).catch(() => undefined);
        }
      }

      // Delete analysis record
      await db.delete(analysesTable).where(eq(analysesTable.id, analysisId)).catch(() => undefined);
    }
  } catch (err) {
    console.error('Failed to purge old analyses for user:', err);
  }
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (userId) {
    await purgeOldAnalysesForUser(userId, 3);
  }

  const userAnalyses = userId
    ? await db
        .select()
        .from(analysesTable)
        .where(eq(analysesTable.ownerId, userId))
        .orderBy(desc(analysesTable.createdAt))
    : [];

  const recentAnalyses = toAnalyses(userAnalyses).slice(0, 3);
  const activeCount = userAnalyses.filter((a) => a.status !== "complete").length;
  const readyCount = userAnalyses.filter((a) => a.status === "complete").length;

  res.json(
    GetDashboardResponse.parse({
      activeAnalyses: activeCount,
      reportsReady: readyCount,
      quotesReceived: userAnalyses.length,
      potentialSavings: readyCount > 0 ? 1840 : 0,
      recentAnalyses,
    }),
  );
  req.log.info({ count: recentAnalyses.length, userId }, "Returned dashboard summary");
});

router.get("/analyses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const userId = req.user.id;
  await purgeOldAnalysesForUser(userId, 3);

  const analyses = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.ownerId, userId))
    .orderBy(desc(analysesTable.createdAt));

  res.json(ListAnalysesResponse.parse(toAnalyses(analyses)));
  req.log.info({ count: analyses.length, userId }, "Listed user analyses");
});

router.post("/analyses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Please sign in to upload a quotation." });
    return;
  }

  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fileName, filePath, fileType, fileSize, sourceAnalysisId } = parsed.data;
  const fileExt = fileName?.split(".").pop()?.toLowerCase();
  if (
    !fileName ||
    !fileExt ||
    !ALLOWED_EXTENSIONS.has(fileExt) ||
    !filePath ||
    !fileType ||
    !fileSize ||
    !ALLOWED_UPLOAD_TYPES.has(fileType) ||
    fileSize > MAX_UPLOAD_BYTES ||
    !filePath.startsWith("/objects/uploads/") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    res.status(400).json({ error: "Please upload only PDF, JPG, PNG, or WEBP quotation files up to 5 MB." });
    return;
  }

  try {
    if (sourceAnalysisId) {
      const sourceAnalysis = await getOwnedUploadAnalysis(sourceAnalysisId, req.user.id);
      if (!sourceAnalysis) {
        res.status(404).json({ error: "Source analysis not found." });
        return;
      }
      const [existingReplacement] = await db
        .select({ id: analysesTable.id })
        .from(analysesTable)
        .where(eq(analysesTable.sourceAnalysisId, sourceAnalysisId));
      if (existingReplacement) {
        res.status(409).json({
          error: "A corrected version has already been uploaded for this analysis.",
        });
        return;
      }
    }

    const [uploadIntent] = await db
      .select()
      .from(uploadIntentsTable)
      .where(
        and(
          eq(uploadIntentsTable.objectPath, filePath),
          eq(uploadIntentsTable.ownerId, req.user.id),
          eq(uploadIntentsTable.fileName, fileName),
          eq(uploadIntentsTable.fileType, fileType),
          eq(uploadIntentsTable.fileSize, fileSize),
          eq(uploadIntentsTable.status, "pending"),
          gt(uploadIntentsTable.expiresAt, new Date()),
        ),
      );
    if (!uploadIntent) {
      res.status(400).json({
        error: "This upload request is missing, expired, or already used.",
      });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(filePath);
    const [metadata] = await objectFile.getMetadata();
    const actualSize = Number(metadata.size);
    if (
      metadata.contentType !== fileType ||
      !Number.isFinite(actualSize) ||
      actualSize !== fileSize ||
      actualSize > MAX_UPLOAD_BYTES
    ) {
      res.status(400).json({
        error: "The uploaded file does not match the requested file details.",
      });
      return;
    }

    const [claimedIntent] = await db
      .update(uploadIntentsTable)
      .set({ status: "finalizing" })
      .where(
        and(
          eq(uploadIntentsTable.id, uploadIntent.id),
          eq(uploadIntentsTable.status, "pending"),
        ),
      )
      .returning();
    if (!claimedIntent) {
      res.status(409).json({ error: "This upload is already being finalized." });
      return;
    }

    const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(filePath, {
      owner: req.user.id,
      visibility: "private",
    });

    const [analysis] = await db
      .insert(analysesTable)
      .values({
        id: `ana-${crypto.randomUUID()}`,
        name: parsed.data.name,
        room: parsed.data.room,
        address: parsed.data.address ?? null,
        status: "processing",
        progress: 0,
        uploadedFileName: fileName,
        uploadedFilePath: normalizedPath,
        uploadedFileType: fileType,
        uploadedFileSize: fileSize,
        ownerId: req.user.id,
        sourceAnalysisId: sourceAnalysisId ?? null,
      })
      .returning();

    await db
      .update(uploadIntentsTable)
      .set({ status: "consumed", consumedAt: new Date() })
      .where(eq(uploadIntentsTable.id, claimedIntent.id));

    // Auto-delete older quotation records and binary files beyond 3 to stay within free database storage limits
    await purgeOldAnalysesForUser(req.user.id, 3);

    res.status(201).json(CreateAnalysisResponse.parse(toAnalysis(analysis)));
    req.log.info({ analysisId: analysis.id }, "Created analysis from secure upload");
  } catch (error) {
    await db
      .update(uploadIntentsTable)
      .set({ status: "pending" })
      .where(
        and(
          eq(uploadIntentsTable.objectPath, parsed.data.filePath ?? ""),
          eq(uploadIntentsTable.ownerId, req.user.id),
          eq(uploadIntentsTable.status, "finalizing"),
        ),
      )
      .catch(() => undefined);
    req.log.error({ err: error }, "Could not finalize uploaded quotation");
    res.status(500).json({ error: "We couldn't save that quotation. Please try again." });
  }
});

router.get("/analyses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureMockAnalyses();
  const analyses = await db.select().from(analysesTable);
  const analysis = analyses.find((entry) => entry.id === parsed.data.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  if (analysis.ownerId && analysis.ownerId !== req.user.id) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const [replacement] = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(eq(analysesTable.sourceAnalysisId, analysis.id));
  res.json(
    GetAnalysisResponse.parse(toAnalysis(analysis, replacement?.id ?? null)),
  );
});

router.get("/analyses/:id/extraction", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }

  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }

  const [extraction] = await db
    .select()
    .from(quotationExtractionsTable)
    .where(eq(quotationExtractionsTable.analysisId, analysis.id));

  res.json(toExtractionResponse(extraction, analysis.id));
});

router.post("/analyses/:id/extraction", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }

  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  if (!analysis.uploadedFilePath || !analysis.uploadedFileType) {
    res.status(400).json({ error: "This analysis does not have an uploaded quotation." });
    return;
  }

  const [existing] = await db
    .select()
    .from(quotationExtractionsTable)
    .where(eq(quotationExtractionsTable.analysisId, analysis.id));
  const extractionLeaseCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const processingLeaseIsActive =
    existing?.status === "processing" &&
    existing.updatedAt > extractionLeaseCutoff;
  if (existing?.status === "complete" || processingLeaseIsActive) {
    res.json(toExtractionResponse(existing, analysis.id));
    return;
  }

  const leaseToken = crypto.randomUUID();
  const [created] = existing
    ? await db
        .update(quotationExtractionsTable)
        .set({
          status: "processing",
          error: null,
          model: null,
          sourceText: null,
          extractedJson: null,
          rawClaudeResponse: null,
          leaseToken,
        })
        .where(
          and(
            eq(quotationExtractionsTable.id, existing.id),
            or(
              eq(quotationExtractionsTable.status, "failed"),
              and(
                eq(quotationExtractionsTable.status, "processing"),
                lt(quotationExtractionsTable.updatedAt, extractionLeaseCutoff),
              ),
            ),
          ),
        )
        .returning()
    : await db
        .insert(quotationExtractionsTable)
        .values({
          id: `ext-${crypto.randomUUID()}`,
          analysisId: analysis.id,
          status: "processing",
          leaseToken,
        })
        .onConflictDoNothing()
        .returning();

  if (!created) {
    const [concurrent] = await db
      .select()
      .from(quotationExtractionsTable)
      .where(eq(quotationExtractionsTable.analysisId, analysis.id));
    res.json(toExtractionResponse(concurrent, analysis.id));
    return;
  }

  const requestAbortController = new AbortController();
  const abortExtraction = () => requestAbortController.abort();
  req.once("aborted", abortExtraction);

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(
      analysis.uploadedFilePath,
    );
    const [metadata] = await objectFile.getMetadata();
    const actualSize = Number(metadata.size);
    if (
      metadata.contentType !== analysis.uploadedFileType ||
      !Number.isFinite(actualSize) ||
      actualSize < 1 ||
      actualSize > MAX_UPLOAD_BYTES ||
      actualSize !== analysis.uploadedFileSize
    ) {
      throw new DocumentExtractionError(
        "This upload's file details could not be verified. Please upload the quotation again.",
      );
    }
    const [buffer] = await objectFile.download();
    const { result, sourceText } = await extractQuotation({
      buffer,
      contentType: analysis.uploadedFileType,
      signal: requestAbortController.signal,
      onRawClaudeResponse: async (rawClaudeResponse) => {
        const [persisted] = await db
          .update(quotationExtractionsTable)
          .set({ rawClaudeResponse })
          .where(
            and(
              eq(quotationExtractionsTable.id, created.id),
              eq(quotationExtractionsTable.leaseToken, leaseToken),
            ),
          )
          .returning({ id: quotationExtractionsTable.id });
        if (!persisted) {
          throw new DocumentExtractionError(
            "This quotation extraction was superseded. Please try again.",
          );
        }
      },
    });

    await deleteEvidenceForAnalysisSource(analysis.id, "uploaded_document");
    await persistQuotationEvidence(analysis.id, result);
    const [completed] = await db
      .update(quotationExtractionsTable)
      .set({
        status: "complete",
        sourceText,
        extractedJson: result,
        model: EXTRACTION_MODEL,
        error: null,
        leaseToken: null,
      })
      .where(
        and(
          eq(quotationExtractionsTable.id, created.id),
          eq(quotationExtractionsTable.leaseToken, leaseToken),
        ),
      )
      .returning();

    if (!completed) {
      const [latest] = await db
        .select()
        .from(quotationExtractionsTable)
        .where(eq(quotationExtractionsTable.id, created.id));
      res.json(toExtractionResponse(latest, analysis.id));
      return;
    }

    req.log.info({ analysisId: analysis.id }, "Completed quotation extraction");
    res.json(toExtractionResponse(completed, analysis.id));
  } catch (error) {
    const message =
      error instanceof DocumentExtractionError
        ? error.message
        : "We couldn't extract this quotation. Please try a clearer document.";

    const [failed] = await db
      .update(quotationExtractionsTable)
      .set({
        status: "failed",
        error: message,
        model: null,
        leaseToken: null,
      })
      .where(
        and(
          eq(quotationExtractionsTable.id, created.id),
          eq(quotationExtractionsTable.leaseToken, leaseToken),
        ),
      )
      .returning();

    req.log.warn(
      { analysisId: analysis.id, err: error },
      "Quotation extraction failed",
    );
    if (res.destroyed) {
      return;
    }
    if (!failed) {
      const [latest] = await db
        .select()
        .from(quotationExtractionsTable)
        .where(eq(quotationExtractionsTable.id, created.id));
      res.json(toExtractionResponse(latest, analysis.id));
      return;
    }

    res
      .status(error instanceof DocumentExtractionError ? 422 : 500)
      .json(toExtractionResponse(failed, analysis.id));
  } finally {
    req.off("aborted", abortExtraction);
  }
});

router.get("/analyses/:id/intelligence", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  let [run] = await db.select().from(quoteIntelligenceRunsTable)
    .where(eq(quoteIntelligenceRunsTable.analysisId, analysis.id));
  if (run?.status === "complete" && run.findingsJson) {
    const storedResult = run.findingsJson as QuoteIntelligenceResult;
    if (!storedResult.verdictSummary) {
      const findings = sanitizeQuoteFindings(storedResult.findings);
      try {
        const verdictSummary = await generateVerdictSummary(findings);
        const [updated] = await db
          .update(quoteIntelligenceRunsTable)
          .set({ findingsJson: { ...storedResult, verdictSummary } })
          .where(eq(quoteIntelligenceRunsTable.id, run.id))
          .returning();
        run = updated ?? run;
      } catch (error) {
        req.log.warn(
          { analysisId: analysis.id, err: error },
          "Verdict summary generation failed; using deterministic fallback",
        );
      }
    }
  }
  const [extraction] = await db.select().from(quotationExtractionsTable)
    .where(eq(quotationExtractionsTable.analysisId, analysis.id));
  res.json(GetQuoteIntelligenceResponse.parse(toIntelligenceResponse(run, analysis.id, extraction)));
});

router.post("/analyses/:id/vendor-message", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const params = GenerateVendorMessageParams.safeParse(req.params);
  const body = GenerateVendorMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid finding reference." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(params.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  const [run] = await db
    .select()
    .from(quoteIntelligenceRunsTable)
    .where(eq(quoteIntelligenceRunsTable.analysisId, analysis.id));
  if (run?.status !== "complete" || !run.findingsJson) {
    res.status(409).json({ error: "Quote intelligence is not ready." });
    return;
  }
  const finding = sanitizeQuoteFindings(
    (run.findingsJson as QuoteIntelligenceResult).findings,
  ).find(
    (candidate) =>
      candidate.category === body.data.findingCategory &&
      candidate.title === body.data.findingTitle,
  );
  if (!finding) {
    res.status(404).json({ error: "Finding not found." });
    return;
  }
  try {
    const message = await generateVendorClarificationMessage(finding);
    res.json(GenerateVendorMessageResponse.parse({ message }));
  } catch (error) {
    req.log.error(
      { analysisId: analysis.id, findingCategory: finding.category, err: error },
      "Vendor message generation failed",
    );
    res.status(502).json({ error: "We couldn't generate a message right now." });
  }
});

router.post("/analyses/:id/bulk-vendor-message", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const params = GenerateBulkVendorMessageParams.safeParse(req.params);
  const body = GenerateBulkVendorMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(params.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  const [run] = await db
    .select()
    .from(quoteIntelligenceRunsTable)
    .where(eq(quoteIntelligenceRunsTable.analysisId, analysis.id));
  if (run?.status !== "complete" || !run.findingsJson) {
    res.status(409).json({ error: "Quote intelligence is not ready." });
    return;
  }
  const findings = sanitizeQuoteFindings(
    (run.findingsJson as QuoteIntelligenceResult).findings,
  );
  const hasRequestedFindings = findings.some((finding) =>
    body.data.priority === "LOW"
      ? finding.severity === "LOW"
      : finding.severity === "HIGH" || finding.severity === "CRITICAL",
  );
  if (!hasRequestedFindings) {
    res.status(404).json({ error: `No ${body.data.priority.toLowerCase()}-priority findings are available.` });
    return;
  }
  try {
    const message = await generateBulkVendorMessage(findings, body.data.priority);
    res.json(GenerateBulkVendorMessageResponse.parse({ message }));
  } catch (error) {
    req.log.error(
      { analysisId: analysis.id, err: error },
      "Bulk vendor message generation failed",
    );
    res.status(502).json({ error: "We couldn't generate a message right now." });
  }
});

router.get("/analyses/:id/evidence", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  res.json(await listEvidenceForAnalysis(analysis.id));
});

router.get("/analyses/:id/vendors", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }

  const evidence = await listEvidenceForAnalysis(analysis.id);
  const vendorIds = Array.from(
    new Set(
      evidence
        .map((record) => record.vendorId)
        .filter((vendorId): vendorId is string => Boolean(vendorId)),
    ),
  );
  if (vendorIds.length === 0) {
    res.json(ListAnalysisVendorsResponse.parse([]));
    return;
  }

  const identities = await db
    .select()
    .from(vendorIdentitiesTable)
    .where(
      and(
        eq(vendorIdentitiesTable.ownerId, req.user.id),
        inArray(vendorIdentitiesTable.id, vendorIds),
      ),
    );
  res.json(
    ListAnalysisVendorsResponse.parse(
      identities.map((identity) => toAnalysisVendor(identity, evidence)),
    ),
  );
});

router.post("/analyses/:id/vendors", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsedParams = GetAnalysisParams.safeParse(req.params);
  const parsedBody = ResearchAnalysisVendorBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Vendor research details are invalid." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(
    parsedParams.data.id,
    req.user.id,
  );
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }

  const { category, ...vendorInput } = parsedBody.data;
  try {
    const identity = await createOrReuseVendorIdentity(
      req.user.id,
      vendorInput,
    );
    const normalized = normalizeVendorIdentity(vendorInput);
    const adapterResult = await googlePlacesAdapter.lookup(normalized);
    await replaceAnalysisVendorEvidence(
      analysis.id,
      identity.id,
      normalized,
      category,
      {
        ...adapterResult,
        source: googlePlacesAdapter.source,
      },
    );
    const evidence = await listEvidenceForAnalysis(analysis.id);
    res
      .status(201)
      .json(
        ResearchAnalysisVendorResponse.parse(
          toAnalysisVendor(identity, evidence),
        ),
      );
  } catch (error) {
    req.log.error(
      { err: error, analysisId: analysis.id },
      "Failed to research analysis vendor",
    );
    res.status(500).json({
      error: "Vendor research could not be completed. Please try again.",
    });
  }
});

router.post("/evidence", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = CreateEvidenceRecordBody.safeParse(req.body);
  if (!parsed.success || (!parsed.data.analysisId && !parsed.data.vendorId)) {
    res.status(400).json({
      error: "An evidence record needs an owned analysis or vendor context.",
    });
    return;
  }
  if (
    parsed.data.verificationStatus !== "USER_VERIFICATION_REQUIRED" ||
    parsed.data.sourceType !== "user_input"
  ) {
    res.status(400).json({
      error:
        "Manual evidence must be marked USER_VERIFICATION_REQUIRED and use source type user_input.",
    });
    return;
  }
  if (parsed.data.analysisId) {
    const analysis = await getOwnedUploadAnalysis(
      parsed.data.analysisId,
      req.user.id,
    );
    if (!analysis) {
      res.status(404).json({ error: "Analysis not found." });
      return;
    }
  }
  if (parsed.data.vendorId) {
    const [vendor] = await db
      .select({ id: vendorIdentitiesTable.id })
      .from(vendorIdentitiesTable)
      .where(
        and(
          eq(vendorIdentitiesTable.id, parsed.data.vendorId),
          eq(vendorIdentitiesTable.ownerId, req.user.id),
        ),
      );
    if (!vendor) {
      res.status(404).json({ error: "Vendor context not found." });
      return;
    }
  }
  try {
    const record = await createEvidenceRecord({
      ...parsed.data,
      retrievedAt: parsed.data.retrievedAt ?? undefined,
      analysisId: parsed.data.analysisId ?? null,
      vendorId: parsed.data.vendorId ?? null,
    });
    res.status(201).json(CreateEvidenceRecordResponse.parse(toEvidenceRecord(record)));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Evidence record is invalid.",
    });
  }
});

router.post("/analyses/:id/intelligence", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analysis identifier." });
    return;
  }
  const analysis = await getOwnedUploadAnalysis(parsed.data.id, req.user.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found." });
    return;
  }
  const [extraction] = await db.select().from(quotationExtractionsTable)
    .where(eq(quotationExtractionsTable.analysisId, analysis.id));
  if (!extraction || extraction.status !== "complete" || !extraction.extractedJson || !extraction.sourceText) {
    res.status(400).json({ error: "Quotation extraction must complete before review." });
    return;
  }
  const [existing] = await db.select().from(quoteIntelligenceRunsTable)
    .where(eq(quoteIntelligenceRunsTable.analysisId, analysis.id));
  const leaseCutoff = new Date(Date.now() - 10 * 60 * 1000);
  if (existing?.status === "complete" || (existing?.status === "processing" && existing.updatedAt > leaseCutoff)) {
    res.json(AnalyzeQuoteIntelligenceResponse.parse(toIntelligenceResponse(existing, analysis.id, extraction)));
    return;
  }
  const leaseToken = crypto.randomUUID();
  const [claimed] = existing
    ? await db.update(quoteIntelligenceRunsTable).set({
        status: "processing", error: null, findingsJson: null, model: null,
        sourceExtractionId: extraction.id, leaseToken,
      }).where(and(
        eq(quoteIntelligenceRunsTable.id, existing.id),
        or(eq(quoteIntelligenceRunsTable.status, "failed"), and(eq(quoteIntelligenceRunsTable.status, "processing"), lt(quoteIntelligenceRunsTable.updatedAt, leaseCutoff))),
      )).returning()
    : await db.insert(quoteIntelligenceRunsTable).values({
        id: `int-${crypto.randomUUID()}`, analysisId: analysis.id,
        sourceExtractionId: extraction.id, status: "processing", leaseToken,
      }).onConflictDoNothing().returning();
  if (!claimed) {
    const [concurrent] = await db.select().from(quoteIntelligenceRunsTable)
      .where(eq(quoteIntelligenceRunsTable.analysisId, analysis.id));
    res.json(AnalyzeQuoteIntelligenceResponse.parse(toIntelligenceResponse(concurrent, analysis.id, extraction)));
    return;
  }
  try {
    const heartbeat = setInterval(() => {
      void db.update(quoteIntelligenceRunsTable)
        .set({ updatedAt: new Date() })
        .where(and(
          eq(quoteIntelligenceRunsTable.id, claimed.id),
          eq(quoteIntelligenceRunsTable.leaseToken, leaseToken),
        ));
    }, 60_000);
    let result;
    try {
      result = await analyzeQuotation(
        extraction.extractedJson as QuotationExtractionResult,
        extraction.sourceText,
      );
      try {
        result.verdictSummary = await generateVerdictSummary(result.findings);
      } catch (error) {
        req.log.warn(
          { analysisId: analysis.id, err: error },
          "Verdict summary generation failed; using deterministic fallback",
        );
      }
    } finally {
      clearInterval(heartbeat);
    }
    await deleteEvidenceForAnalysisSource(analysis.id, "quote_intelligence");
    await persistQuoteFindingEvidence(analysis.id, result.findings);
    const [completed] = await db.update(quoteIntelligenceRunsTable).set({
      status: "complete", findingsJson: result, error: null, model: INTELLIGENCE_MODEL, leaseToken: null,
    }).where(and(eq(quoteIntelligenceRunsTable.id, claimed.id), eq(quoteIntelligenceRunsTable.leaseToken, leaseToken))).returning();
    if (completed) {
      await db.update(analysesTable).set({ status: "complete", progress: 100 }).where(eq(analysesTable.id, analysis.id));
      req.log.info({ analysisId: analysis.id, findings: result.findings.length }, "Completed quote intelligence");
      res.json(AnalyzeQuoteIntelligenceResponse.parse(toIntelligenceResponse(completed, analysis.id, extraction)));
      return;
    }
    const [latest] = await db.select().from(quoteIntelligenceRunsTable).where(eq(quoteIntelligenceRunsTable.id, claimed.id));
    res.json(AnalyzeQuoteIntelligenceResponse.parse(toIntelligenceResponse(latest, analysis.id, extraction)));
  } catch (error) {
    const message = "We couldn't complete this quotation review. Please try again.";
    const [failed] = await db.update(quoteIntelligenceRunsTable).set({
      status: "failed", error: message, model: null, leaseToken: null,
    }).where(and(eq(quoteIntelligenceRunsTable.id, claimed.id), eq(quoteIntelligenceRunsTable.leaseToken, leaseToken))).returning();
    req.log.warn({ analysisId: analysis.id, err: error }, "Quote intelligence failed");
    res.status(500).json(AnalyzeQuoteIntelligenceResponse.parse(toIntelligenceResponse(failed, analysis.id, extraction)));
  }
});

router.get("/quotes", (req, res): void => {
  res.json(ListQuotesResponse.parse(mockQuotes));
  req.log.info({ count: mockQuotes.length }, "Listed quotes");
});

router.get("/vendors", (req, res): void => {
  res.json(ListVendorsResponse.parse(mockVendors));
  req.log.info({ count: mockVendors.length }, "Listed vendors");
});

router.get("/insights", (req, res): void => {
  res.json(ListInsightsResponse.parse(mockInsights));
  req.log.info({ count: mockInsights.length }, "Listed insights");
});

router.get("/account", async (req, res): Promise<void> => {
  const userId = req.user?.id || "guest_user";
  const isGuest = !req.user?.email;
  const displayName =
    [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") ||
    (isGuest ? "Guest User" : "Member");
  const email = req.user?.email || "guest@interiorlens.ai";

  const userAnalyses = await db
    .select({ id: analysesTable.id })
    .from(analysesTable)
    .where(eq(analysesTable.ownerId, userId));

  res.json(
    GetAccountResponse.parse({
      id: userId,
      name: displayName,
      email: email,
      plan: "Free Beta",
      analysesUsed: userAnalyses.length,
      analysesLimit: 3,
    }),
  );
  req.log.info({ userId }, "Returned account details");
});

export default router;