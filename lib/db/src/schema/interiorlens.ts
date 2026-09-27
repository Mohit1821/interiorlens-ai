import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  boolean,
  real,
  check,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const analysesTable = pgTable("analyses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  address: text("address"),
  status: text("status").notNull().default("draft"),
  progress: integer("progress").notNull().default(0),
  uploadedFileName: text("uploaded_file_name"),
  uploadedFilePath: text("uploaded_file_path"),
  uploadedFileType: text("uploaded_file_type"),
  uploadedFileSize: integer("uploaded_file_size"),
  ownerId: text("owner_id"),
  sourceAnalysisId: text("source_analysis_id")
    .references((): AnyPgColumn => analysesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const uploadIntentsTable = pgTable("upload_intents", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotesTable = pgTable("quotes", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .references(() => analysesTable.id),
  vendorName: text("vendor_name").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationExtractionsTable = pgTable("quotation_extractions", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .unique()
    .references(() => analysesTable.id),
  status: text("status").notNull().default("pending"),
  sourceText: text("source_text"),
  extractedJson: jsonb("extracted_json"),
  rawClaudeResponse: jsonb("raw_claude_response"),
  error: text("error"),
  model: text("model"),
  leaseToken: text("lease_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const quoteIntelligenceRunsTable = pgTable("quote_intelligence_runs", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .unique()
    .references(() => analysesTable.id),
  sourceExtractionId: text("source_extraction_id")
    .notNull()
    .references(() => quotationExtractionsTable.id),
  status: text("status").notNull().default("pending"),
  findingsJson: jsonb("findings_json"),
  error: text("error"),
  model: text("model"),
  leaseToken: text("lease_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const vendorsTable = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  location: text("location").notNull(),
  rating: numeric("rating", { precision: 2, scale: 1 }).notNull(),
  verified: boolean("verified").notNull().default(false),
  responseTime: text("response_time").notNull(),
});

export const vendorIdentitiesTable = pgTable(
  "vendor_identities",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    vendorName: text("vendor_name").notNull(),
    legalName: text("legal_name"),
    gstin: text("gstin"),
    cin: text("cin"),
    phone: text("phone"),
    website: text("website"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    identityKey: text("identity_key").notNull(),
    normalizedJson: jsonb("normalized_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    ownerIdentityKey: uniqueIndex("vendor_identities_owner_identity_key_idx").on(
      table.ownerId,
      table.identityKey,
    ),
  }),
);

export const evidenceRecordsTable = pgTable(
  "vendor_evidence_records",
  {
    id: text("id").primaryKey(),
    claim: text("claim").notNull().default("source_response"),
    value: text("value").notNull().default(""),
    source: text("source").notNull(),
    sourceType: text("source_type").notNull().default("vendor_source"),
    sourceUrl: text("source_url"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    confidence: real("confidence").notNull().default(0),
    verificationStatus: text("verification_status").notNull().default("UNVERIFIED"),
    analysisId: text("analysis_id").references(() => analysesTable.id),
    vendorId: text("vendor_identity_id").references(() => vendorIdentitiesTable.id),
    status: text("status").notNull().default("available"),
    query: text("query"),
    externalId: text("external_id"),
    resultJson: jsonb("result_json"),
    claimsJson: jsonb("claims_json"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    evidenceContext: check(
      "vendor_evidence_records_context_check",
      sql`${table.analysisId} is not null or ${table.vendorId} is not null`,
    ),
    evidenceVerificationStatus: check(
      "vendor_evidence_records_verification_status_check",
      sql`${table.verificationStatus} in ('VERIFIED', 'CROSS_VERIFIED', 'PUBLICLY_FOUND', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONFLICT', 'NOT_AVAILABLE', 'USER_VERIFICATION_REQUIRED')`,
    ),
  }),
);

// Backwards-compatible export for existing vendor intelligence consumers.
export const vendorEvidenceRecordsTable = evidenceRecordsTable;

export const insightsTable = pgTable("insights", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id")
    .notNull()
    .references(() => analysesTable.id),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  detail: text("detail").notNull(),
  evidence: text("evidence").notNull(),
  estimate: numeric("estimate", { precision: 12, scale: 2 }),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type AnalysisRecord = typeof analysesTable.$inferSelect;