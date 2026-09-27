import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  evidenceRecordsTable,
} from "@workspace/db";
import type {
  NormalizedVendorIdentity,
} from "./vendorIntelligence";
import type { QuotationExtractionResult } from "./quotationExtraction";

export const EVIDENCE_VERIFICATION_STATUSES = [
  "VERIFIED",
  "CROSS_VERIFIED",
  "PUBLICLY_FOUND",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "CONFLICT",
  "NOT_AVAILABLE",
  "USER_VERIFICATION_REQUIRED",
] as const;

export type EvidenceVerificationStatus =
  (typeof EVIDENCE_VERIFICATION_STATUSES)[number];

export type EvidenceRecordInput = {
  claim: string;
  value: string;
  source: string;
  sourceType: string;
  sourceUrl?: string | null;
  retrievedAt?: Date;
  confidence: number;
  verificationStatus: EvidenceVerificationStatus;
  analysisId?: string | null;
  vendorId?: string | null;
  status?: string;
  query?: string | null;
  externalId?: string | null;
  result?: Record<string, unknown> | null;
  claims?: Record<string, unknown> | null;
  error?: string | null;
};

export type EvidenceRecord = {
  id: string;
  claim: string;
  value: string;
  source: string;
  sourceType: string;
  sourceUrl: string | null;
  retrievedAt: string;
  confidence: number;
  verificationStatus: EvidenceVerificationStatus;
  analysisId: string | null;
  vendorId: string | null;
  status: string;
  query: string | null;
  externalId: string | null;
  error: string | null;
};

export function isEvidenceVerificationStatus(
  value: unknown,
): value is EvidenceVerificationStatus {
  return (
    typeof value === "string" &&
    (EVIDENCE_VERIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

function validateEvidenceInput(input: EvidenceRecordInput) {
  if (!input.claim.trim() || !input.value.trim() || !input.source.trim()) {
    throw new Error("Evidence claim, value, and source are required.");
  }
  if (!input.sourceType.trim()) {
    throw new Error("Evidence source type is required.");
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new Error("Evidence confidence must be between 0 and 1.");
  }
  if (!isEvidenceVerificationStatus(input.verificationStatus)) {
    throw new Error("Evidence verification status is not supported.");
  }
  if (!input.analysisId && !input.vendorId) {
    throw new Error("Evidence must be linked to an analysis or vendor.");
  }
}

export function toEvidenceRecord(
  record: typeof evidenceRecordsTable.$inferSelect,
): EvidenceRecord {
  return {
    id: record.id,
    claim: record.claim,
    value: record.value,
    source: record.source,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    retrievedAt: record.retrievedAt.toISOString(),
    confidence: record.confidence,
    verificationStatus: isEvidenceVerificationStatus(record.verificationStatus)
      ? record.verificationStatus
      : "UNVERIFIED",
    analysisId: record.analysisId,
    vendorId: record.vendorId,
    status: record.status,
    query: record.query,
    externalId: record.externalId,
    error: record.error,
  };
}

export async function createEvidenceRecord(input: EvidenceRecordInput) {
  validateEvidenceInput(input);
  const [record] = await db
    .insert(evidenceRecordsTable)
    .values({
      id: `ev-${crypto.randomUUID()}`,
      claim: input.claim.trim(),
      value: input.value.trim(),
      source: input.source.trim(),
      sourceType: input.sourceType.trim(),
      sourceUrl: input.sourceUrl ?? null,
      retrievedAt: input.retrievedAt ?? new Date(),
      confidence: input.confidence,
      verificationStatus: input.verificationStatus,
      analysisId: input.analysisId ?? null,
      vendorId: input.vendorId ?? null,
      status: input.status ?? "available",
      query: input.query ?? null,
      externalId: input.externalId ?? null,
      resultJson: input.result ?? null,
      claimsJson: input.claims ?? null,
      error: input.error ?? null,
    })
    .returning();
  return record;
}

export async function createEvidenceRecords(inputs: EvidenceRecordInput[]) {
  if (inputs.length === 0) return [];
  inputs.forEach(validateEvidenceInput);
  const records = await db
    .insert(evidenceRecordsTable)
    .values(
      inputs.map((input) => ({
        id: `ev-${crypto.randomUUID()}`,
        claim: input.claim.trim(),
        value: input.value.trim(),
        source: input.source.trim(),
        sourceType: input.sourceType.trim(),
        sourceUrl: input.sourceUrl ?? null,
        retrievedAt: input.retrievedAt ?? new Date(),
        confidence: input.confidence,
        verificationStatus: input.verificationStatus,
        analysisId: input.analysisId ?? null,
        vendorId: input.vendorId ?? null,
        status: input.status ?? "available",
        query: input.query ?? null,
        externalId: input.externalId ?? null,
        resultJson: input.result ?? null,
        claimsJson: input.claims ?? null,
        error: input.error ?? null,
      })),
    )
    .returning();
  return records;
}

export async function listEvidenceForVendor(vendorId: string) {
  const records = await db
    .select()
    .from(evidenceRecordsTable)
    .where(eq(evidenceRecordsTable.vendorId, vendorId))
    .orderBy(evidenceRecordsTable.createdAt);
  return records.map(toEvidenceRecord);
}

export async function listEvidenceForAnalysis(analysisId: string) {
  const records = await db
    .select()
    .from(evidenceRecordsTable)
    .where(eq(evidenceRecordsTable.analysisId, analysisId))
    .orderBy(evidenceRecordsTable.createdAt);
  return records.map(toEvidenceRecord);
}

export async function deleteEvidenceForAnalysisSource(
  analysisId: string,
  sourceType: string,
) {
  await db
    .delete(evidenceRecordsTable)
    .where(
      and(
        eq(evidenceRecordsTable.analysisId, analysisId),
        eq(evidenceRecordsTable.sourceType, sourceType),
      ),
    );
}

export async function deleteEvidenceForAnalysisVendor(
  analysisId: string,
  vendorId: string,
) {
  await db
    .delete(evidenceRecordsTable)
    .where(
      and(
        eq(evidenceRecordsTable.analysisId, analysisId),
        eq(evidenceRecordsTable.vendorId, vendorId),
      ),
    );
}

export async function persistVendorInputEvidence(
  vendorId: string,
  identity: NormalizedVendorIdentity,
  analysisId?: string | null,
  category?: string | null,
) {
  return createEvidenceRecords(
    buildVendorInputEvidenceInputs(
      vendorId,
      identity,
      analysisId,
      category,
    ),
  );
}

function buildVendorInputEvidenceInputs(
  vendorId: string,
  identity: NormalizedVendorIdentity,
  analysisId?: string | null,
  category?: string | null,
): EvidenceRecordInput[] {
  const values = [
    ["vendor_name", identity.vendorName],
    ["legal_name", identity.legalName],
    ["gstin", identity.gstin],
    ["cin", identity.cin],
    ["phone", identity.phone],
    ["website", identity.website],
    ["address", identity.address],
    ["city", identity.city],
    ["state", identity.state],
    ["trade_category", category],
  ] as const;
  return values
    .filter(([, value]) => Boolean(value))
    .map(([claim, value]) => ({
      claim,
      value: value!,
      source: "User-provided vendor details",
      sourceType: "user_input",
      confidence: 1,
      verificationStatus: "USER_VERIFICATION_REQUIRED" as const,
      analysisId: analysisId ?? null,
      vendorId,
    }));
}

export async function persistQuotationEvidence(
  analysisId: string,
  extraction: QuotationExtractionResult,
) {
  const fields = Object.entries(extraction).flatMap(([claim, value]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("value" in value) ||
      typeof value.value !== "string" ||
      !value.value.trim()
    ) {
      return [];
    }
    return [
      {
        claim: `quotation.${claim}`,
        value: value.value,
        source: "Uploaded quotation",
        sourceType: "uploaded_document",
        confidence:
          typeof value.confidence === "number" ? value.confidence : 0,
        verificationStatus: "USER_VERIFICATION_REQUIRED" as const,
        analysisId,
      },
    ];
  });
  return createEvidenceRecords(fields);
}

export async function persistQuoteFindingEvidence(
  analysisId: string,
  findings: Array<{ category: string; title: string; evidence: string }>,
) {
  return createEvidenceRecords(
    findings.map((finding) => ({
      claim: `quote_finding.${finding.category}`,
      value: finding.title,
      source: "Uploaded quotation",
      sourceType: "quote_intelligence",
      confidence: 1,
      verificationStatus: "USER_VERIFICATION_REQUIRED" as const,
      analysisId,
      claims: { excerpt: finding.evidence },
    })),
  );
}

export async function persistVendorAdapterEvidence(
  vendorId: string,
  adapterResult: {
    status: string;
    query: string;
    externalId?: string | null;
    sourceUrl?: string | null;
    result?: Record<string, unknown> | null;
    claims?: Record<string, unknown> | null;
    error?: string | null;
    source: string;
  },
  analysisId?: string | null,
) {
  return createEvidenceRecords(
    buildVendorAdapterEvidenceInputs(vendorId, adapterResult, analysisId),
  );
}

function buildVendorAdapterEvidenceInputs(
  vendorId: string,
  adapterResult: {
    status: string;
    query: string;
    externalId?: string | null;
    sourceUrl?: string | null;
    result?: Record<string, unknown> | null;
    claims?: Record<string, unknown> | null;
    error?: string | null;
    source: string;
  },
  analysisId?: string | null,
): EvidenceRecordInput[] {
  const claims = Object.entries(adapterResult.claims ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim(),
  );
  const verificationStatus: EvidenceVerificationStatus =
    adapterResult.status === "available" && claims.length > 0
      ? "PUBLICLY_FOUND"
      : "NOT_AVAILABLE";
  return (
    claims.length > 0
      ? claims.map(([claim, value]) => ({
          claim,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }))
      : [
          {
            claim: "source_status",
            value: adapterResult.status,
          },
        ]
  ).map(({ claim, value }) => ({
    claim,
    value,
    source: adapterResult.source,
    sourceType: "external_api",
    sourceUrl: adapterResult.sourceUrl ?? null,
    confidence: claims.length > 0 ? 0.7 : 0,
    verificationStatus,
    analysisId: analysisId ?? null,
    vendorId,
    status: adapterResult.status,
    query: adapterResult.query,
    externalId: adapterResult.externalId ?? null,
    result: adapterResult.result ?? null,
    error: adapterResult.error ?? null,
  }));
}

export async function replaceAnalysisVendorEvidence(
  analysisId: string,
  vendorId: string,
  identity: NormalizedVendorIdentity,
  category: string | null | undefined,
  adapterResult: {
    status: string;
    query: string;
    externalId?: string | null;
    sourceUrl?: string | null;
    result?: Record<string, unknown> | null;
    claims?: Record<string, unknown> | null;
    error?: string | null;
    source: string;
  },
) {
  const inputs = [
    ...buildVendorInputEvidenceInputs(
      vendorId,
      identity,
      analysisId,
      category,
    ),
    ...buildVendorAdapterEvidenceInputs(
      vendorId,
      adapterResult,
      analysisId,
    ),
  ];
  inputs.forEach(validateEvidenceInput);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${analysisId}|${vendorId}`}))`,
    );
    await tx
      .delete(evidenceRecordsTable)
      .where(
        and(
          eq(evidenceRecordsTable.analysisId, analysisId),
          eq(evidenceRecordsTable.vendorId, vendorId),
        ),
      );
    if (inputs.length === 0) return [];
    return tx
      .insert(evidenceRecordsTable)
      .values(
        inputs.map((input) => ({
          id: `ev-${crypto.randomUUID()}`,
          claim: input.claim.trim(),
          value: input.value.trim(),
          source: input.source.trim(),
          sourceType: input.sourceType.trim(),
          sourceUrl: input.sourceUrl ?? null,
          retrievedAt: input.retrievedAt ?? new Date(),
          confidence: input.confidence,
          verificationStatus: input.verificationStatus,
          analysisId,
          vendorId,
          status: input.status ?? "available",
          query: input.query ?? null,
          externalId: input.externalId ?? null,
          resultJson: input.result ?? null,
          claimsJson: input.claims ?? null,
          error: input.error ?? null,
        })),
      )
      .returning();
  });
}

export async function getEvidenceByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const records = await db
    .select()
    .from(evidenceRecordsTable)
    .where(inArray(evidenceRecordsTable.id, ids));
  return records.map(toEvidenceRecord);
}