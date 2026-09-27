import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_MODEL = "claude-opus-5";
const MAX_EXTRACTION_TOKENS = 16_384;
const EXTRACTION_TIMEOUT_MS = 90_000;
const MAX_PDF_PAGES = 20;
const MAX_SOURCE_TEXT_CHARS = 60_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type ExtractionField = {
  value: string | null;
  confidence: number;
  evidence: string | null;
};

export type ExtractionListItem = ExtractionField;

export type ExtractedLineItem = {
  description: ExtractionField;
  quantity: ExtractionField;
  unit: ExtractionField;
  amount: ExtractionField;
  material: ExtractionField;
  brand: ExtractionField;
  hardware: ExtractionField;
  confidence: number;
  evidence: string | null;
};

export type QuotationExtractionResult = {
  documentReadable: true;
  vendorName: ExtractionField;
  legalName: ExtractionField;
  gstin: ExtractionField;
  cinOrLlpin: ExtractionField;
  phone: ExtractionField;
  email: ExtractionField;
  website: ExtractionField;
  address: ExtractionField;
  city: ExtractionField;
  state: ExtractionField;
  pincode: ExtractionField;
  quotationNumber: ExtractionField;
  quotationDate: ExtractionField;
  projectType: ExtractionField;
  projectLocation: ExtractionField;
  subtotalBeforeGst: ExtractionField;
  gstRate: ExtractionField;
  gstAmount: ExtractionField;
  grandTotalInclusiveGst: ExtractionField;
  /** Kept for compatibility with existing API consumers; represents the quoted grand total. */
  totalQuotationValue: ExtractionField;
  rooms: ExtractionListItem[];
  lineItems: ExtractedLineItem[];
  materials: ExtractionListItem[];
  brands: ExtractionListItem[];
  hardware: ExtractionListItem[];
  warranty: ExtractionField;
  timeline: ExtractionField;
  paymentTerms: ExtractionField;
  /** Every complete payment schedule found, each retaining its source clause. */
  paymentSchedules: ExtractionListItem[];
};

/**
 * A line-item sum is only safe to compare with a document total when the
 * source text gives us a reliable priced-row count and every such row was
 * extracted. If the source format does not expose identifiable rows, stay
 * conservative and do not treat the partial sum as authoritative.
 */
export function hasCompleteLineItemExtraction(
  extraction: Pick<QuotationExtractionResult, "lineItems">,
  sourceText: string,
): boolean {
  const pricedRows = findPricedLineItemRows(sourceText);

  if (pricedRows.length === 0 || extraction.lineItems.length !== pricedRows.length) {
    return false;
  }

  const matchedRowForItem: Array<number | undefined> = [];
  const matchRow = (rowIndex: number, visitedItems: Set<number>): boolean => {
    const row = pricedRows[rowIndex];
    for (let itemIndex = 0; itemIndex < extraction.lineItems.length; itemIndex += 1) {
      if (visitedItems.has(itemIndex)) continue;
      const item = extraction.lineItems[itemIndex];
      const description = normalizeComparableText(item.description.value ?? "");
      const amount = normalizeComparableAmount(item.amount.value ?? "");
      if (
        description.length < 3 ||
        amount === null ||
        !row.normalizedText.includes(description) ||
        amount !== row.totalAmount
      ) {
        continue;
      }
      visitedItems.add(itemIndex);
      const previouslyMatchedRow = matchedRowForItem[itemIndex];
      if (
        previouslyMatchedRow === undefined ||
        matchRow(previouslyMatchedRow, visitedItems)
      ) {
        matchedRowForItem[itemIndex] = rowIndex;
        return true;
      }
    }
    return false;
  };

  return pricedRows.every((_, rowIndex) => matchRow(rowIndex, new Set()));
}

const MULTI_FRAGMENT_FIELDS = new Set([
  "warranty",
  "paymentTerms",
  "timeline",
  "materials",
  "brands",
  "hardware",
]);
const NUMERIC_FIELDS = new Set([
  "quantity",
  "amount",
  "rate",
  "gstRate",
  "gstAmount",
  "subtotalBeforeGst",
  "grandTotalInclusiveGst",
  "totalQuotationValue",
]);

export class DocumentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

type ExtractQuotationInput = {
  buffer: Buffer;
  contentType: string;
  signal?: AbortSignal;
  onRawClaudeResponse?: (response: Record<string, unknown>) => Promise<void>;
};

export async function extractQuotation(
  input: ExtractQuotationInput,
): Promise<{
  result: QuotationExtractionResult;
  sourceText: string | null;
  rawClaudeResponse: Record<string, unknown>;
}> {
  const source =
    input.contentType === "application/pdf"
      ? await extractPdfText(input.buffer)
      : await createImageSource(input);

  const requestController = new AbortController();
  const timeout = setTimeout(() => requestController.abort(), EXTRACTION_TIMEOUT_MS);
  const abortFromCaller = () => requestController.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (input.signal?.aborted) abortFromCaller();

  let modelResponse: Anthropic.Message;
  try {
    const modelStream = anthropic.messages.stream({
      model: EXTRACTION_MODEL,
      max_tokens: MAX_EXTRACTION_TOKENS,
      system: extractionInstructions(source.kind === "image"),
      messages: [{
        role: "user",
        content:
          source.kind === "text"
            ? `Extract only information explicitly visible in this quotation document.\n\nDOCUMENT TEXT:\n${source.text}`
            : [
                {
                  type: "text",
                  text: "Extract only information explicitly visible in this quotation image.",
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: source.mediaType,
                    data: source.base64,
                  },
                },
              ],
      }],
    }, {
      signal: requestController.signal,
    });
    modelResponse = await modelStream.finalMessage();
  } catch (error) {
    if (requestController.signal.aborted) {
      throw new DocumentExtractionError(
        "The quotation analysis took too long and was stopped. Please try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }

  const contentBlock = modelResponse.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  const content = contentBlock?.text;
  if (!content) {
    throw new DocumentExtractionError(
      "The document could not be read. Please upload a clearer quotation.",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stripMarkdownCodeFence(content));
  } catch {
    const trimmedContent = content.trim();
    console.error("Claude quotation extraction returned invalid JSON", {
      model: modelResponse.model,
      stopReason: modelResponse.stop_reason,
      contentLength: content.length,
      startsWithObject: trimmedContent.startsWith("{"),
      endsWithObject: trimmedContent.endsWith("}"),
      startsWithFence: trimmedContent.startsWith("```"),
      endsWithFence: trimmedContent.endsWith("```"),
    });
    throw new DocumentExtractionError(
      "The document could not be read reliably. Please upload a clearer quotation.",
    );
  }

  const record = asRecord(raw);
  if (!record) {
    throw new DocumentExtractionError(
      "This quotation is unreadable or does not contain extractable details. Please upload a clearer document.",
    );
  }
  await input.onRawClaudeResponse?.(record);
  if (record.documentReadable !== true && record.r !== true) {
    throw new DocumentExtractionError(
      "This quotation is unreadable or does not contain extractable details. Please upload a clearer document.",
    );
  }
  const verificationText =
    source.kind === "text"
      ? source.text
      : typeof (record.sourceText ?? record.s) === "string"
        ? String(record.sourceText ?? record.s).trim().slice(0, MAX_SOURCE_TEXT_CHARS)
        : "";
  if (verificationText.length < 3) {
    throw new DocumentExtractionError(
      "This quotation is unreadable or does not contain extractable details. Please upload a clearer document.",
    );
  }

  return {
    result: normalizeQuotationResult(record, verificationText),
    sourceText: verificationText,
    rawClaudeResponse: record,
  };
}

async function extractPdfText(buffer: Buffer): Promise<{ kind: "text"; text: string }> {
  const directory = await mkdtemp(join(tmpdir(), "interiorlens-quotation-"));
  const inputPath = join(directory, "quotation.pdf");
  const outputPath = join(directory, "quotation.html");

  try {
    await writeFile(inputPath, buffer);
    const { stdout: metadata } = await execFileAsync("pdfinfo", [inputPath], {
      timeout: 15_000,
      maxBuffer: 1_000_000,
    });
    const pagesMatch = metadata.match(/^Pages:\s+(\d+)$/m);
    const pages = pagesMatch ? Number(pagesMatch[1]) : 0;
    if (!pages || pages > MAX_PDF_PAGES) {
      throw new DocumentExtractionError(
        `This quotation has more than ${MAX_PDF_PAGES} pages. Please upload a shorter document.`,
      );
    }

    await execFileAsync(
      "pdftotext",
      ["-f", "1", "-l", String(MAX_PDF_PAGES), "-bbox-layout", inputPath, outputPath],
      { timeout: 20_000, maxBuffer: 1_000_000 },
    );
    const text = extractTextFromPopplerBboxLayout(await readFile(outputPath, "utf8"))
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_SOURCE_TEXT_CHARS);
    if (text.length < 40) {
      throw new DocumentExtractionError(
        "This PDF has no readable text. Please upload a clearer PDF or a high-resolution image.",
      );
    }

    return { kind: "text", text };
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(
      "This PDF could not be read. Please upload a valid, text-readable quotation.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type PositionedPdfLine = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  text: string;
};

type PositionedPdfBlock = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  lines: PositionedPdfLine[];
};

type PdfTextEvent = {
  yMin: number;
  yMax: number;
  xMin: number;
  text: string;
};

/**
 * Rebuilds readable text from Poppler's coordinate-aware bbox output.
 * Ordinary fragments sharing a baseline are joined into one row so tables
 * retain their structure. Two wide prose blocks with independent headings are
 * read down the left block and then down the right block instead of being
 * interleaved row-by-row.
 */
export function extractTextFromPopplerBboxLayout(html: string): string {
  const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  const pages: string[] = [];

  for (const pageMatch of html.matchAll(pagePattern)) {
    const pageWidth = readNumericAttribute(pageMatch[1], "width");
    const blocks = parsePdfBlocks(pageMatch[2]);
    if (!pageWidth || blocks.length === 0) continue;
    pages.push(renderPdfPage(blocks, pageWidth));
  }

  return pages.filter(Boolean).join("\n\n");
}

function parsePdfBlocks(pageHtml: string): PositionedPdfBlock[] {
  const blocks: PositionedPdfBlock[] = [];
  const blockPattern = /<block\b([^>]*)>([\s\S]*?)<\/block>/gi;

  for (const blockMatch of pageHtml.matchAll(blockPattern)) {
    const xMin = readNumericAttribute(blockMatch[1], "xMin");
    const yMin = readNumericAttribute(blockMatch[1], "yMin");
    const xMax = readNumericAttribute(blockMatch[1], "xMax");
    const yMax = readNumericAttribute(blockMatch[1], "yMax");
    if ([xMin, yMin, xMax, yMax].some((value) => value === null)) continue;

    const lines: PositionedPdfLine[] = [];
    const linePattern = /<line\b([^>]*)>([\s\S]*?)<\/line>/gi;
    for (const lineMatch of blockMatch[2].matchAll(linePattern)) {
      const lineXMin = readNumericAttribute(lineMatch[1], "xMin");
      const lineYMin = readNumericAttribute(lineMatch[1], "yMin");
      const lineXMax = readNumericAttribute(lineMatch[1], "xMax");
      const lineYMax = readNumericAttribute(lineMatch[1], "yMax");
      if (
        [lineXMin, lineYMin, lineXMax, lineYMax].some(
          (value) => value === null,
        )
      ) {
        continue;
      }

      const words = Array.from(
        lineMatch[2].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/gi),
        (wordMatch) => decodePdfHtml(wordMatch[1].replace(/<[^>]+>/g, "")),
      ).filter(Boolean);
      if (words.length === 0) continue;
      lines.push({
        xMin: lineXMin!,
        yMin: lineYMin!,
        xMax: lineXMax!,
        yMax: lineYMax!,
        text: words.join(" "),
      });
    }

    if (lines.length > 0) {
      blocks.push({
        xMin: xMin!,
        yMin: yMin!,
        xMax: xMax!,
        yMax: yMax!,
        lines,
      });
    }
  }

  return blocks;
}

function renderPdfPage(blocks: PositionedPdfBlock[], pageWidth: number): string {
  const pairedBlocks = new Set<number>();
  const events: PdfTextEvent[] = [];

  for (let leftIndex = 0; leftIndex < blocks.length; leftIndex += 1) {
    if (pairedBlocks.has(leftIndex)) continue;
    const left = blocks[leftIndex];
    if (!isColumnProseBlock(left, pageWidth)) continue;

    let bestRightIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let rightIndex = 0; rightIndex < blocks.length; rightIndex += 1) {
      if (rightIndex === leftIndex || pairedBlocks.has(rightIndex)) continue;
      const right = blocks[rightIndex];
      if (
        !isColumnProseBlock(right, pageWidth) ||
        left.xMin >= right.xMin ||
        left.xMax >= right.xMin
      ) {
        continue;
      }

      const overlap =
        Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin);
      const shorterHeight = Math.min(
        left.yMax - left.yMin,
        right.yMax - right.yMin,
      );
      const gap = right.xMin - left.xMax;
      if (
        overlap <= 0 ||
        overlap / shorterHeight < 0.65 ||
        Math.abs(left.yMin - right.yMin) > 18 ||
        gap > pageWidth * 0.12
      ) {
        continue;
      }

      const score = Math.abs(left.yMin - right.yMin) + gap;
      if (score < bestScore) {
        bestScore = score;
        bestRightIndex = rightIndex;
      }
    }

    if (bestRightIndex < 0) continue;
    const right = blocks[bestRightIndex];
    pairedBlocks.add(leftIndex);
    pairedBlocks.add(bestRightIndex);
    events.push({
      yMin: Math.min(left.yMin, right.yMin),
      yMax: Math.max(left.yMax, right.yMax),
      xMin: left.xMin,
      text: [
        ...left.lines.map((line) => line.text),
        ...right.lines.map((line) => line.text),
      ].join("\n"),
    });
  }

  const ordinaryLines = blocks.flatMap((block, blockIndex) =>
    pairedBlocks.has(blockIndex) ? [] : block.lines,
  );
  ordinaryLines.sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin);

  for (let index = 0; index < ordinaryLines.length;) {
    const first = ordinaryLines[index];
    const row = [first];
    index += 1;
    while (
      index < ordinaryLines.length &&
      row.some((line) => linesShareVisualRow(line, ordinaryLines[index]))
    ) {
      row.push(ordinaryLines[index]);
      index += 1;
    }
    row.sort((left, right) => left.xMin - right.xMin);
    events.push({
      yMin: Math.min(...row.map((line) => line.yMin)),
      yMax: Math.max(...row.map((line) => line.yMax)),
      xMin: row[0].xMin,
      text: row.map((line) => line.text).join(" "),
    });
  }

  events.sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin);
  const output: string[] = [];
  let previous: PdfTextEvent | null = null;
  for (const event of events) {
    if (
      previous &&
      event.yMin - previous.yMax >
        Math.max(8, (previous.yMax - previous.yMin) * 1.5)
    ) {
      output.push("");
    }
    output.push(event.text);
    previous = event;
  }

  return output.join("\n").trim();
}

function isColumnProseBlock(
  block: PositionedPdfBlock,
  pageWidth: number,
): boolean {
  if (
    block.lines.length < 3 ||
    block.xMax - block.xMin < pageWidth * 0.3
  ) {
    return false;
  }

  const heading = block.lines[0].text;
  const letters = heading.replace(/[^a-z]/gi, "");
  const body = block.lines.slice(1);
  const alphabeticWords = body.flatMap((line) =>
    line.text.match(/[a-z]{2,}/gi) ?? [],
  );
  const lineGaps = block.lines.slice(1).map(
    (line, index) => line.yMin - block.lines[index].yMin,
  );
  const lineHeights = block.lines.map((line) => line.yMax - line.yMin);
  const medianGap = median(lineGaps);
  const medianLineHeight = median(lineHeights);
  return (
    letters.length >= 3 &&
    heading.split(/\s+/).length <= 6 &&
    letters === letters.toLocaleUpperCase() &&
    isQuotationSectionHeading(heading) &&
    alphabeticWords.length >= 8 &&
    medianLineHeight > 0 &&
    medianGap <= medianLineHeight * 1.9
  );
}

function isQuotationSectionHeading(heading: string): boolean {
  return /^(?:warranty|(?:project|delivery|work)\s+timeline|timeline|scope\s+exclusions?|exclusions?|payment\s+terms?|terms(?:\s+and\s+conditions)?|assumptions?|inclusions?)$/i.test(
    heading.trim(),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function linesShareVisualRow(
  left: PositionedPdfLine,
  right: PositionedPdfLine,
): boolean {
  const overlap = Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin);
  const shorterHeight = Math.min(
    left.yMax - left.yMin,
    right.yMax - right.yMin,
  );
  return shorterHeight > 0 && overlap / shorterHeight >= 0.45;
}

function readNumericAttribute(
  attributes: string,
  name: string,
): number | null {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]+)"`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function decodePdfHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

async function createImageSource(
  input: ExtractQuotationInput,
): Promise<{ kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }> {
  const mediaType = ["image/jpeg", "image/png", "image/webp"].find(
    (type): type is "image/jpeg" | "image/png" | "image/webp" =>
      type === input.contentType,
  );
  if (!mediaType) {
    throw new DocumentExtractionError("This document format is not supported.");
  }
  if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new DocumentExtractionError(
      "This image is too large to read reliably. Please upload an image smaller than 6 MB.",
    );
  }

  return {
    kind: "image",
    mediaType,
    base64: input.buffer.toString("base64"),
  };
}

function stripMarkdownCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractionInstructions(includeSourceText: boolean): string {
  return `You extract data from interior quotation documents. Return one minified JSON object only, with no markdown and no whitespace outside string values.

Rules:
- Use only information that is explicitly visible in the supplied document.
- Never infer, complete, or guess a value. Use null if a value is missing, uncertain, or illegible.
- Represent each extracted field as [value, evidence, confidence].
- Keep evidence to the shortest exact phrase that proves the value, with a maximum of 120 characters.
- Represent each line item as [description, quantity, unit, amount, material, brand, hardware, evidence, confidence].
- Preserve every explicitly listed scope row as a line item even when its quantity, unit, rate, or amount is blank or zero. Keep missing fields null; never copy a section total into the row amount.
- Use one short row-level evidence excerpt per line item.
- Set documentReadable to false if the document is blank, unreadable, not a quotation, or lacks usable details.
- Preserve monetary values exactly as written. Do not calculate totals or normalize dates.
- Extract subtotalBeforeGst only from a clearly labeled subtotal before GST/tax.
- Extract gstRate and gstAmount only when the printed GST/tax rate and amount are explicit.
- Extract grandTotalInclusiveGst only from a clearly labeled grand total that includes GST/tax.
- Keep totalQuotationValue populated with the quoted grand total for compatibility.
- Use [] for absent list fields.
- ${includeSourceText
    ? "Set s to the verbatim legible text visible in the image so extracted values can be verified."
    : "Set s to an empty string. The source text is already available and must not be repeated."}

Field definitions for Indian interior quotations:

- MATERIAL means the physical substance a line item is built from. Look for phrases such as: Century plywood, Greenply, Kitply, BWP grade, BWR grade, MR grade, 710 grade, marine plywood, HDHMR, MDF, particle board, engineered wood, solid wood, plywood thickness (16mm, 18mm), acrylic laminate, PU finish, veneer, membrane finish. When the item's description or continuation lines contain any of these, populate the material field.

- HARDWARE means fittings and mechanisms. Look for phrases such as: Hettich, Ebco, Blum, Godrej Locks, Hafele, Ozone, hinges, drawer channels, telescopic channels, soft-close hinges, handles, tandem boxes, gas lifts, locks. When these appear, populate the hardware field.

- BRAND means the named manufacturer of any material, hardware, laminate, or finish. Populate brand if any brand name is mentioned in the line item text or its continuation.

- WARRANTY means any stated period during which the vendor covers defects. Look for a WARRANTY section heading, or phrases like "5 years on carpentry", "1 year on hardware", "workmanship warranty". Capture all warranty periods as one combined string.

- paymentTerms means the schedule for how the client pays. Look for a PAYMENT SCHEDULE section, or a table of milestones with percentages and/or explicit monetary amounts. Capture the complete schedule as one string that includes each milestone.
- When a payment schedule states milestone amounts without percentages, preserve every explicit amount exactly as written rather than calculating or inventing percentages.
- paymentSchedules is a list of every complete payment schedule found in the document. Return one entry per distinct schedule, including schedules repeated in terms, procedure, or other clauses. Each entry must contain the complete schedule in value and the exact source clause in evidence. Use [] when no complete schedule is present.

Line item continuation rule:

Indian interior quotes typically place each line item's pricing on one row (description, quantity, unit, rate, amount) and place the item's specifications on the next 1-3 lines, often indented. Example:

    1  Wardrobe  60 sqft  ₹1,700  ₹1,02,000
       Century BWR plywood, Hettich hardware, laminate shutters

The specification line ("Century BWR plywood, Hettich hardware, laminate shutters") belongs to the item above ("Wardrobe"). Do not treat it as a separate item. Extract material, brand, and hardware from the specification line for the item above it.

If the specification line contains multiple facts, split them into the appropriate fields: plywood grade goes into material, brand name goes into brand, hinges/channels go into hardware.

For line items with continuation lines, evidence may span both the pricing row and the specification line. Keep evidence under 120 characters (raised from 80) to accommodate multi-line specifications.

Examples of correct extraction:

Example 1 — Line item with continuation:

Source text:
"1  Wardrobe  60 sqft  ₹1,700  ₹1,02,000
Century BWR plywood, Hettich hardware, laminate shutters"

Correct extraction for this line item:
description: "Wardrobe"
quantity: "60"
unit: "sqft"
amount: "₹1,02,000"
material: "Century BWR plywood"
brand: "Century"
hardware: "Hettich hardware"
evidence: "Wardrobe 60 sqft ₹1,700 ₹1,02,000 Century BWR plywood"

Note: material is "Century BWR plywood" — the plywood grade IS the material. Do not return null just because the phrase combines a brand with a material type. Include the full descriptive phrase in the material field.

Example 2 — Line item with brand and material in different words:

Source text:
"2  Bed with Storage  1  unit  ₹38,000  ₹38,000
Century BWP plywood, hydraulic storage"

Correct extraction:
description: "Bed with Storage"
material: "Century BWP plywood"
brand: "Century"
hardware: null

Example 3 — Warranty in an interleaved section:

Source text (note the two-column layout is interleaved):
"WARRANTY PROJECT TIMELINE
Carpentry & Woodwork: 5 years 60 working days from receipt of
material advance,
Hardware (hinges, channels, fittings): 1 year subject to site
readiness..."

Correct extraction:
warranty value: "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 1 year"
warranty evidence: "Carpentry & Woodwork: 5 years"

Note: Even when warranty text is interleaved with project timeline text, extract only the warranty durations. Combine multiple warranty periods with a semicolon. Do not return null just because the section is interleaved.

Example 4 — Payment schedule table:

Source text:
"PAYMENT SCHEDULE
Milestone % of Total Amount (₹)
On order confirmation 50% ₹5,31,000
On material delivery 40% ₹4,24,800
On completion 10% ₹1,06,200
Total 100% ₹10,62,000"

Correct extraction:
paymentTerms value: "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 10% ₹1,06,200"
paymentTerms evidence: "On order confirmation 50% ₹5,31,000"

Important rules from these examples:

- Never return null when the field's information is present in the source. If you see plywood grade mentioned anywhere for a line item, extract it as material.
- When multiple warranty periods exist, combine them with semicolons in one string. Do not return null because it is "multiple values."
- When a payment schedule has multiple milestones, combine them with semicolons. Do not return null because it is a table.
- Do not include a payment schedule header or printed total row as a milestone.
- Interleaved two-column text is common in PDF extractions. Extract the relevant section anyway.

Return this exact structure:
{
  "r": true,
  "s": ${includeSourceText ? '"verbatim legible image text"' : '""'},
  "f": {
    "vendorName": [null, null, 0],
    "legalName": [null, null, 0],
    "gstin": [null, null, 0],
    "cinOrLlpin": [null, null, 0],
    "phone": [null, null, 0],
    "email": [null, null, 0],
    "website": [null, null, 0],
    "address": [null, null, 0],
    "city": [null, null, 0],
    "state": [null, null, 0],
    "pincode": [null, null, 0],
    "quotationNumber": [null, null, 0],
    "quotationDate": [null, null, 0],
    "projectType": [null, null, 0],
    "projectLocation": [null, null, 0],
    "subtotalBeforeGst": [null, null, 0],
    "gstRate": [null, null, 0],
    "gstAmount": [null, null, 0],
    "grandTotalInclusiveGst": [null, null, 0],
    "totalQuotationValue": [null, null, 0],
    "warranty": [null, null, 0],
    "timeline": [null, null, 0],
    "paymentTerms": [null, null, 0]
  },
  "rooms": [["value", "evidence", 0]],
  "items": [["description", "quantity", "unit", "amount", "material", "brand", "hardware", "evidence", 0]],
  "materials": [["value", "evidence", 0]],
  "brands": [["value", "evidence", 0]],
  "hardware": [["value", "evidence", 0]],
  "paymentSchedules": [["complete schedule", "exact source clause", 0]]
}`;
}

export function normalizeQuotationResult(
  raw: Record<string, unknown>,
  sourceText: string,
): QuotationExtractionResult {
  const compactFields = asRecord(raw.f);
  const field = (key: string) =>
    normalizeField(
      compactFields?.[key] ?? raw[key],
      sourceText,
      MULTI_FRAGMENT_FIELDS.has(key),
      NUMERIC_FIELDS.has(key) ? "numeric" : "text",
    );
  const paymentTerms = field("paymentTerms");
  const extractedPaymentSchedules = normalizeList(
    compactFields?.paymentSchedules ?? raw.paymentSchedules,
    sourceText,
    true,
  );
  const paymentSchedules =
    extractedPaymentSchedules.length > 0
      ? extractedPaymentSchedules
      : paymentTerms.value
        ? [paymentTerms]
        : [];

  return {
    documentReadable: true,
    vendorName: field("vendorName"),
    legalName: field("legalName"),
    gstin: field("gstin"),
    cinOrLlpin: field("cinOrLlpin"),
    phone: field("phone"),
    email: field("email"),
    website: field("website"),
    address: field("address"),
    city: field("city"),
    state: field("state"),
    pincode: field("pincode"),
    quotationNumber: field("quotationNumber"),
    quotationDate: field("quotationDate"),
    projectType: field("projectType"),
    projectLocation: field("projectLocation"),
    subtotalBeforeGst: field("subtotalBeforeGst"),
    gstRate: field("gstRate"),
    gstAmount: field("gstAmount"),
    grandTotalInclusiveGst: field("grandTotalInclusiveGst"),
    totalQuotationValue: field("totalQuotationValue"),
    rooms: normalizeList(raw.rooms, sourceText),
    lineItems: normalizeLineItems(raw.items ?? raw.lineItems, sourceText),
    materials: normalizeList(raw.materials, sourceText, true),
    brands: normalizeList(raw.brands, sourceText, true),
    hardware: normalizeList(raw.hardware, sourceText, true),
    warranty: field("warranty"),
    timeline: field("timeline"),
    paymentTerms: paymentTerms.value
      ? paymentTerms
      : paymentSchedules[0] ?? paymentTerms,
    paymentSchedules,
  };
}

/**
 * Returns payment milestone percentages only when the extracted schedule is
 * complete enough to reconcile without guessing. A missing percentage, an
 * ambiguous clause, or a tax percentage makes the schedule unsafe to total.
 * Printed total rows are excluded because they repeat the milestone sum.
 */
export function parsePaymentMilestonePercentages(
  paymentTerms: string | null,
): number[] | null {
  if (!paymentTerms) return null;

  const clauses = paymentMilestoneClauses(paymentTerms);
  if (clauses.length < 2) return null;

  const percentages: number[] = [];
  for (const clause of clauses) {
    if (/\b(?:gst|tax|vat|cgst|sgst|igst)\b/i.test(clause)) return null;

    const matches = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*%/g));
    if (matches.length !== 1) return null;

    const percentage = Number(matches[0][1]);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return null;
    }
    percentages.push(percentage);
  }

  return percentages.length >= 2 ? percentages : null;
}

/**
 * Returns payment milestone amounts only when every non-total clause has one
 * unambiguous, explicitly marked monetary amount. A missing amount or a
 * clause with multiple amounts makes the schedule unsafe to reconcile.
 */
export function parsePaymentMilestoneAmounts(
  paymentTerms: string | null,
): number[] | null {
  if (!paymentTerms) return null;

  const clauses = paymentMilestoneClauses(paymentTerms);
  if (clauses.length < 2) return null;

  const amounts: number[] = [];
  for (const clause of clauses) {
    const matches = Array.from(
      clause.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi),
    );
    if (matches.length !== 1) return null;

    const amount = parsePaymentAmount(matches[0][1]);
    if (amount === null) return null;
    amounts.push(amount);
  }

  return amounts.length >= 2 ? amounts : null;
}

export function paymentMilestoneClauses(paymentTerms: string): string[] {
  return paymentTerms
    .split(/;|\r?\n/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && !isPaymentAggregateClause(clause));
}

function isPaymentAggregateClause(clause: string): boolean {
  const label = clause
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?/gi, "")
    .replace(/\d+(?:\.\d+)?\s*%/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:(?:payment\s+)?schedule\s+|payment\s+)?(?:grand\s+)?(?:sub)?total\b/i.test(label);
}

function parsePaymentAmount(value: string): number | null {
  const normalized = value.replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return normalized && Number.isFinite(amount) ? amount : null;
}

function normalizeField(
  value: unknown,
  sourceText: string,
  allowMultiFragment = false,
  fieldType: "numeric" | "text" = "text",
  allowInterveningLineItemWords = false,
  lineItemEvidenceValidatedSeparately = false,
  allowWrappedLineItemDescription = false,
): ExtractionField {
  if (Array.isArray(value)) {
    value = {
      value: value[0],
      evidence: value[1],
      confidence: value[2],
    };
  }
  const record = asRecord(value);
  const candidate = typeof record?.value === "string" ? record.value.trim() : null;
  const evidence = typeof record?.evidence === "string" ? record.evidence.trim() : null;
  const evidenceIsGrounded =
    evidence !== null &&
    (
      lineItemEvidenceValidatedSeparately
        ? true
        : isGrounded(evidence, sourceText)
    );
  const candidateIsGrounded =
    candidate !== null &&
    (
      isGrounded(candidate, sourceText, allowMultiFragment, fieldType) ||
      (
        allowInterveningLineItemWords &&
        isLineItemValueGroundedWithInterveningWords(candidate, sourceText)
      ) ||
      (
        allowWrappedLineItemDescription &&
        isWrappedLineItemDescriptionGrounded(candidate, sourceText)
      )
    );
  if (
    !candidate ||
    !evidence ||
    !candidateIsGrounded ||
    !evidenceIsGrounded
  ) {
    return { value: null, confidence: 0, evidence: null };
  }

  return {
    value: candidate,
    confidence: clampConfidence(record?.confidence),
    evidence,
  };
}

function normalizeList(
  value: unknown,
  sourceText: string,
  allowMultiFragment = false,
): ExtractionListItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeField(item, sourceText, allowMultiFragment))
    .filter((item) => item.value !== null);
}

function normalizeLineItems(value: unknown, sourceText: string): ExtractedLineItem[] {
  if (!Array.isArray(value)) return [];
  const lineItems: ExtractedLineItem[] = [];
  for (const item of value) {
    if (Array.isArray(item)) {
      const trailingEvidence = item.at(-2);
      const providedEvidence =
        typeof trailingEvidence === "string" ? trailingEvidence.trim() : null;
      const itemConfidence = clampConfidence(item.at(-1));
      const rawDescription =
        typeof item[0] === "string" ? item[0].trim() : null;
      const itemEvidence = resolveLineItemEvidence(
        providedEvidence,
        sourceText,
        rawDescription,
        typeof item[3] === "string" ? item[3].trim() : null,
      );
      const tupleField = (fieldValue: unknown, fieldName: string) => {
        const isDescriptiveSpecification =
          fieldName === "material" || fieldName === "brand" || fieldName === "hardware";
        return normalizeField(
          [fieldValue, itemEvidence, itemConfidence],
          sourceText,
          isDescriptiveSpecification,
          NUMERIC_FIELDS.has(fieldName) ? "numeric" : "text",
          isDescriptiveSpecification,
          true,
          fieldName === "description",
        );
      };
      const description = tupleField(item[0], "description");
      const amount = tupleField(item[3], "amount");
      if (
        !description.value ||
        !itemEvidence ||
        !isLineItemEvidenceGrounded(
          itemEvidence,
          sourceText,
          description.value,
          amount.value,
        )
      ) {
        continue;
      }
      lineItems.push({
        description,
        quantity: tupleField(item[1], "quantity"),
        unit: tupleField(item[2], "unit"),
        amount,
        material: tupleField(item[4], "material"),
        brand: tupleField(item[5], "brand"),
        hardware: tupleField(item[6], "hardware"),
        confidence: itemConfidence,
        evidence: itemEvidence,
      });
      continue;
    }
    const record = asRecord(item) ?? {};
    const providedEvidence =
      typeof record.evidence === "string" ? record.evidence.trim() : null;
    const itemConfidence = clampConfidence(record.confidence);
    const rawDescription =
      typeof record.description === "string"
        ? record.description.trim()
        : typeof asRecord(record.description)?.value === "string"
          ? String(asRecord(record.description)?.value).trim()
          : null;
    const rawAmount =
      typeof record.amount === "string"
        ? record.amount.trim()
        : typeof asRecord(record.amount)?.value === "string"
          ? String(asRecord(record.amount)?.value).trim()
          : null;
    const itemEvidence = resolveLineItemEvidence(
      providedEvidence,
      sourceText,
      rawDescription,
      rawAmount,
    );
    const lineItemField = (fieldValue: unknown, fieldName: string) => {
      const isDescriptiveSpecification =
        fieldName === "material" || fieldName === "brand" || fieldName === "hardware";
      return typeof fieldValue === "string"
        ? normalizeField(
            {
              value: fieldValue,
              confidence: itemConfidence,
              evidence: itemEvidence,
            },
            sourceText,
            isDescriptiveSpecification,
            NUMERIC_FIELDS.has(fieldName) ? "numeric" : "text",
            isDescriptiveSpecification,
            true,
            fieldName === "description",
          )
        : normalizeField(
            fieldValue,
            sourceText,
            isDescriptiveSpecification,
            NUMERIC_FIELDS.has(fieldName) ? "numeric" : "text",
            isDescriptiveSpecification,
            true,
            fieldName === "description",
          );
    };
    const description = lineItemField(record.description, "description");
    const amount = lineItemField(record.amount, "amount");
    if (
      !description.value ||
      !itemEvidence ||
      !isLineItemEvidenceGrounded(
        itemEvidence,
        sourceText,
        description.value,
        amount.value,
      )
    ) {
      continue;
    }

    lineItems.push({
      description,
      quantity: lineItemField(record.quantity, "quantity"),
      unit: lineItemField(record.unit, "unit"),
      amount,
      material: lineItemField(record.material, "material"),
      brand: lineItemField(record.brand, "brand"),
      hardware: lineItemField(record.hardware, "hardware"),
      confidence: itemConfidence,
      evidence: itemEvidence,
    });
  }
  return lineItems;
}

function resolveLineItemEvidence(
  providedEvidence: string | null,
  sourceText: string,
  description: string | null,
  amount: string | null,
): string | null {
  if (!description) return null;
  const locatedEvidence = uniquelyLocatedLineItemEvidence(
    sourceText,
    description,
  );
  if (providedEvidence) {
    if (
      isLineItemEvidenceGrounded(
        providedEvidence,
        sourceText,
        description,
        amount,
      )
    ) {
      return providedEvidence;
    }
    if (!locatedEvidence) return null;

    const nextLine = locatedEvidence.sourceLines
      .slice(locatedEvidence.rowLineIndex + 1)
      .find((line) => line.trim().length > 0);
    if (
      !nextLine ||
      !isLikelySourceSectionBoundary(nextLine) ||
      !matchesOrderedTokens(
        tokenizeGroundingText(providedEvidence),
        tokenizeGroundingText(`${locatedEvidence.evidence}\n${nextLine}`),
        24,
      )
    ) {
      return null;
    }
    return locatedEvidence.evidence;
  }

  return locatedEvidence?.evidence ?? null;
}

function uniquelyLocatedLineItemEvidence(
  sourceText: string,
  description: string,
): {
  evidence: string;
  rowLineIndex: number;
  sourceLines: string[];
} | null {
  const descriptionTokens = tokenizeGroundingText(description);
  if (descriptionTokens.length === 0) return null;
  const sourceLines = sourceText.split(/\r?\n/);
  const matchingRows = sourceLines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) =>
        isLikelySourceLineItemRow(line) &&
        matchesOrderedTokens(
          descriptionTokens,
          tokenizeGroundingText(line),
          24,
        ),
    );
  if (matchingRows.length !== 1) return null;

  const rowLineIndex = matchingRows[0].index;
  const evidence = lineItemSourceBlock(sourceLines, rowLineIndex)
    .join("\n")
    .trim();
  return evidence ? { evidence, rowLineIndex, sourceLines } : null;
}

function isLineItemEvidenceGrounded(
  evidence: string,
  sourceText: string,
  description: string,
  amount: string | null,
): boolean {
  const sourceLines = sourceText.split(/\r?\n/);
  const descriptionTokens = tokenizeGroundingText(description);
  const parsedAmount = amount ? Number(amount.replace(/[^\d.]/g, "")) : null;
  const normalizedAmount =
    parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? amount?.replace(/[^\d.]/g, "") ?? null
      : null;
  const rawFragments = evidence
    .split(/(?:\.{3,}|…+)/)
    .flatMap((fragment) =>
      fragment
        .replace(/\)\s+/g, ")|")
        .replace(/([a-z])\.\s+/gi, "$1|")
        .split("|"),
    )
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  if (descriptionTokens.length === 0 || rawFragments.length === 0) return false;

  const firstDescriptionToken = descriptionTokens[0];
  const firstFragmentTokens = tokenizeGroundingText(rawFragments[0]);
  const descriptionStart = firstFragmentTokens.indexOf(firstDescriptionToken);
  if (descriptionStart > 0) {
    rawFragments[0] = firstFragmentTokens.slice(descriptionStart).join(" ");
  }

  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const candidateLines = sourceLines.slice(
      Math.max(0, lineIndex - 2),
      lineIndex + 3,
    );
    const candidateTokens = tokenizeGroundingText(candidateLines.join(" "));
    if (!matchesOrderedTokens(descriptionTokens, candidateTokens, 24)) continue;
    if (
      normalizedAmount &&
      !candidateLines.some(
        (line) => line.replace(/[^\d.]/g, "").includes(normalizedAmount),
      )
    ) continue;

    const rowLineIndex = findAnchoredLineItemRow(
      sourceLines,
      lineIndex,
      descriptionTokens,
      normalizedAmount,
    );
    if (rowLineIndex === null) continue;
    const blockTokens = tokenizeGroundingText(
      lineItemSourceBlock(sourceLines, rowLineIndex).join(" "),
    );
    if (
      rawFragments.every((fragment) => {
        const fragmentTokens = tokenizeGroundingText(fragment);
        return (
          fragmentTokens.length > 0 &&
          matchesOrderedTokens(fragmentTokens, blockTokens, 24)
        );
      })
    ) return true;
  }

  return false;
}

function findAnchoredLineItemRow(
  sourceLines: string[],
  approximateIndex: number,
  descriptionTokens: string[],
  normalizedAmount: string | null,
): number | null {
  const start = Math.max(0, approximateIndex - 2);
  const end = Math.min(sourceLines.length, approximateIndex + 3);
  for (let index = start; index < end; index += 1) {
    const line = sourceLines[index];
    if (
      normalizedAmount &&
      line.replace(/[^\d.]/g, "").includes(normalizedAmount)
    ) return index;
  }
  for (let index = start; index < end; index += 1) {
    const lineTokens = tokenizeGroundingText(sourceLines[index]);
    if (
      isLikelySourceLineItemRow(sourceLines[index]) &&
      matchesOrderedTokens(descriptionTokens, lineTokens, 24)
    ) return index;
  }
  for (let index = start; index < end; index += 1) {
    const lineTokens = tokenizeGroundingText(sourceLines[index]);
    if (matchesOrderedTokens(descriptionTokens, lineTokens, 24)) return index;
  }
  return null;
}

function lineItemSourceBlock(
  sourceLines: string[],
  rowLineIndex: number,
): string[] {
  let start = rowLineIndex;
  for (let offset = 1; offset <= 3 && rowLineIndex - offset >= 0; offset += 1) {
    const line = sourceLines[rowLineIndex - offset];
    if (
      isLikelySourceLineItemRow(line) ||
      isLikelySourceSectionBoundary(line)
    ) break;
    start = rowLineIndex - offset;
  }

  let end = rowLineIndex + 1;
  for (let offset = 1; offset <= 3 && rowLineIndex + offset < sourceLines.length; offset += 1) {
    const line = sourceLines[rowLineIndex + offset];
    if (isLikelySourceLineItemRow(line) || isLikelySourceSectionBoundary(line)) {
      break;
    }
    end = rowLineIndex + offset + 1;
  }
  return sourceLines.slice(start, end);
}

function isLikelySourceLineItemRow(line: string): boolean {
  return /^(?:\d{1,3}(?:[.)\-:]\s*|\s+)|[ivxlcdm]+[.)\-:]\s*)[a-z]/i.test(
    line.trim(),
  );
}

function isLikelySourceSectionBoundary(line: string): boolean {
  const trimmed = line.trim();
  return (
    /\bTOTAL AMOUNT\b/i.test(trimmed) ||
    /^(?:PAYMENT|TERMS|WARRANTY|NOTES?|EXCLUSIONS?)\b/i.test(trimmed)
  );
}

function matchesOrderedTokens(
  expectedTokens: string[],
  sourceTokens: string[],
  maxSkippedTokens: number,
): boolean {
  for (let start = 0; start < sourceTokens.length; start += 1) {
    if (sourceTokens[start] !== expectedTokens[0]) continue;
    let expectedIndex = 1;
    let skippedTokens = 0;
    for (let sourceIndex = start + 1; sourceIndex < sourceTokens.length; sourceIndex += 1) {
      if (sourceTokens[sourceIndex] === expectedTokens[expectedIndex]) {
        expectedIndex += 1;
        if (expectedIndex === expectedTokens.length) return true;
      } else {
        skippedTokens += 1;
        if (skippedTokens > maxSkippedTokens) break;
      }
    }
  }
  return expectedTokens.length === 1 && sourceTokens.includes(expectedTokens[0]);
}

function isWrappedLineItemDescriptionGrounded(
  value: string,
  sourceText: string,
): boolean {
  const descriptionTokens = tokenizeGroundingText(value);
  if (descriptionTokens.length < 2) return false;

  const sourceLines = sourceText.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const lineTokens = tokenizeGroundingText(
      sourceLines.slice(lineIndex, lineIndex + 3).join(" "),
    );
    let descriptionIndex = 0;
    let skippedTokens = 0;
    for (const token of lineTokens) {
      if (token === descriptionTokens[descriptionIndex]) {
        descriptionIndex += 1;
        if (descriptionIndex === descriptionTokens.length) return true;
      } else if (descriptionIndex > 0) {
        skippedTokens += 1;
        if (skippedTokens > 24) break;
      }
    }
  }

  return false;
}

type PricedLineItemRow = {
  normalizedText: string;
  totalAmount: string;
};

function findPricedLineItemRows(sourceText: string): PricedLineItemRow[] {
  const rows: PricedLineItemRow[] = [];
  let inPaymentSection = false;
  for (const line of sourceText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(?:payment\s+schedule|payment\s+terms)$/i.test(trimmed)) {
      inPaymentSection = true;
      continue;
    }
    if (
      inPaymentSection &&
      /^(?:warranty|project\s+timeline|terms(?:\s+and\s+conditions)?|notes?|exclusions?)\b/i.test(trimmed)
    ) {
      inPaymentSection = false;
    }
    if (inPaymentSection) continue;

    const row = toPricedLineItemRow(trimmed);
    if (row) rows.push(row);
  }
  return rows;
}
function isGrounded(
  value: string,
  sourceText: string,
  allowMultiFragment = false,
  fieldType: "numeric" | "text" = "text",
): boolean {
  const normalize = (input: string) =>
    input.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedValue = normalize(value);
  const normalizedSource = normalize(sourceText);
  if (fieldType !== "numeric" && normalizedValue.length < 3) return false;
  if (normalizedSource.includes(normalizedValue)) return true;

  if (!allowMultiFragment) return false;
  const fragments = value.split(";").map((fragment) => normalize(fragment));
  return (
    fragments.length > 1 &&
    fragments.every(
      (fragment) => fragment.length >= 3 && normalizedSource.includes(fragment),
    )
  );
}

function isLineItemValueGroundedWithInterveningWords(
  value: string,
  sourceText: string,
): boolean {
  const sourceTokens = tokenizeGroundingText(sourceText);
  const fragments = value
    .split(";")
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  if (fragments.length < 2) return false;

  return fragments.every((fragment) => {
    const fragmentTokens = tokenizeGroundingText(fragment);
    if (fragmentTokens.length < 3) {
      return isGrounded(fragment, sourceText);
    }

    for (let start = 0; start < sourceTokens.length; start += 1) {
      if (sourceTokens[start] !== fragmentTokens[0]) continue;

      let fragmentIndex = 1;
      let interveningWords = 0;
      for (
        let sourceIndex = start + 1;
        sourceIndex < sourceTokens.length && interveningWords <= 4;
        sourceIndex += 1
      ) {
        if (sourceTokens[sourceIndex] === fragmentTokens[fragmentIndex]) {
          fragmentIndex += 1;
          if (fragmentIndex === fragmentTokens.length) return true;
        } else {
          interveningWords += 1;
        }
      }
    }

    return false;
  });
}

function tokenizeGroundingText(value: string): string[] {
  return value.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function clampConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export { EXTRACTION_MODEL };

function toPricedLineItemRow(line: string): PricedLineItemRow | null {
  const trimmed = line.trim();
  const amounts = Array.from(
    trimmed.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi),
  );
  const totalAmount = normalizeComparableAmount(amounts.at(-1)?.[1] ?? "");
  if (totalAmount === null) return null;
  if (isAggregateAmountLine(trimmed)) return null;

  return {
    normalizedText: normalizeComparableText(trimmed),
    totalAmount,
  };
}

function isAggregateAmountLine(line: string): boolean {
  const label = line
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:(?:room|grand)\s+)?subtotal(?:\s+all\s+rooms)?$/i.test(label)
    || /^grand\s+total$/i.test(label)
    || /^total(?:\s+100%)?$/i.test(label)
    || /^(?:gst|cgst|sgst|igst|tax|vat)\s*(?:(?:@|at)\s*)?\d+(?:\.\d+)?%?$/i.test(label);
}

function normalizeComparableAmount(value: string): string | null {
  const normalized = value.replace(/[^\d.]/g, "");
  return normalized && Number.isFinite(Number(normalized)) ? normalized : null;
}

function normalizeComparableText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}
