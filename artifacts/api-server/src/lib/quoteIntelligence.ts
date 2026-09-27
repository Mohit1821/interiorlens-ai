import {
  hasCompleteLineItemExtraction,
  parsePaymentMilestoneAmounts,
  parsePaymentMilestonePercentages,
  paymentMilestoneClauses,
  type QuotationExtractionResult,
} from "./quotationExtraction";

export const INTELLIGENCE_MODEL = "deterministic-evidence-rules-v1";

export const FINDING_CATEGORIES = [
  "missing_item", "hidden_cost", "material_ambiguity", "brand_ambiguity",
  "hardware_ambiguity", "quantity_anomaly", "price_anomaly", "labour_ambiguity",
  "timeline_concern", "warranty_gap", "payment_risk", "tax_ambiguity",
  "contract_risk", "exclusions", "lump_sum", "vague_spec", "missing_grade",
  "math_error", "duplicate", "timeline_risk", "hidden_exclusion", "other",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type QuoteFinding = {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
};
export type QuoteIntelligenceResult = {
  findings: QuoteFinding[];
  documentationCompletenessScore: number;
  verdictSummary?: string;
};

export function sanitizeQuoteFindings(value: unknown): QuoteFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter((finding): finding is QuoteFinding => {
    if (!finding || typeof finding !== "object") return false;
    const candidate = finding as Record<string, unknown>;
    return typeof candidate.category === "string"
      && candidate.category !== "price_high"
      && (FINDING_CATEGORIES as readonly string[]).includes(candidate.category)
      && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(candidate.severity))
      && typeof candidate.title === "string"
      && typeof candidate.description === "string"
      && typeof candidate.evidence === "string"
      && typeof candidate.recommendation === "string"
      && candidate.title.trim().length > 0
      && candidate.description.trim().length > 0
      && candidate.evidence.trim().length > 0
      && candidate.recommendation.trim().length > 0;
  });
}

function quoteExcerpt(
  sourceText: string,
  preferred?: string | null,
  includeContinuationLines = false,
): string | null {
  const candidate = preferred?.trim();
  const sourceLines = sourceText.split(/\r?\n/);
  if (candidate && sourceText.includes(candidate)) {
    if (!includeContinuationLines) return candidate;

    const firstCandidateLine = candidate.split(/\r?\n/)[0]?.trim() ?? candidate;
    const exactLineIndex = sourceLines.findIndex((line) =>
      line.includes(firstCandidateLine),
    );
    if (exactLineIndex >= 0) {
      return sourceLines
        .slice(exactLineIndex, exactLineIndex + 3)
        .join("\n")
        .trim() || candidate;
    }
    return candidate;
  }
  if (!candidate) {
    const documentExcerpt = sourceText.trim().slice(0, 180);
    return documentExcerpt || null;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  for (let wordCount = Math.min(5, words.length); wordCount >= 3; wordCount -= 1) {
    const fragment = words.slice(0, wordCount).join(" ");
    const lineIndex = sourceLines.findIndex((line) => line.includes(fragment));
    if (lineIndex < 0) continue;

    return sourceLines
      .slice(lineIndex, lineIndex + 3)
      .join("\n")
      .trim() || null;
  }

  return null;
}

function parseIndianAmount(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parsePositiveItemAmount(value: string | null): number | null {
  const amount = parseIndianAmount(value);
  return amount !== null && amount > 0 ? amount : null;
}

function parsePercentage(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!match) return null;
  const rate = Number(match[1]);
  return Number.isFinite(rate) ? rate : null;
}

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function findPrintedGstRate(sourceText: string): number | null {
  const match = sourceText.match(/\bGST\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*%/i);
  return match ? Number(match[1]) : null;
}

function normalizedDescription(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type LocatedLineItemContext = {
  section: string | null;
  excerpt: string | null;
  confidentlyLocated: boolean;
  sourceLineIndex: number | null;
};

function locateLineItemContexts(
  extraction: QuotationExtractionResult,
  sourceText: string,
): LocatedLineItemContext[] {
  const sourceLines = sourceText.split(/\r?\n/);
  let cursor = 0;

  return extraction.lineItems.map((item) => {
    const evidence = item.evidence?.trim() ?? "";
    const description = item.description.value?.trim() ?? "";
    const evidenceLead = evidence.split(/\s+/).slice(0, 6).join(" ");
    const candidates = [evidence, evidenceLead, description]
      .filter((candidate, index, values) =>
        candidate.length >= 3 && values.indexOf(candidate) === index,
      );

    let position = -1;
    let matchedCandidate = "";
    for (const candidate of candidates) {
      position = sourceText.indexOf(candidate, cursor);
      if (position >= 0) {
        matchedCandidate = candidate;
        break;
      }
    }
    if (position < 0) {
      for (const candidate of candidates) {
        position = sourceText.indexOf(candidate);
        if (position >= 0) {
          matchedCandidate = candidate;
          break;
        }
      }
    }
    if (position < 0) {
      return {
        section: null,
        excerpt: quoteExcerpt(sourceText, item.evidence, true),
        confidentlyLocated: false,
        sourceLineIndex: null,
      };
    }

    const confidentlyLocated = position >= cursor;
    cursor = position + Math.max(matchedCandidate.length, 1);
    const lineIndex = sourceText.slice(0, position).split(/\r?\n/).length - 1;
    const excerpt =
      sourceLines.slice(lineIndex, lineIndex + 3).join("\n").trim() || null;
    const section =
      sourceLines
        .slice(0, lineIndex)
        .reverse()
        .map((line) => line.trim())
        .find((line) => isLocationSectionHeading(line)) ?? null;

    return { section, excerpt, confidentlyLocated, sourceLineIndex: lineIndex };
  });
}

function isLocationSectionHeading(line: string): boolean {
  if (
    !line ||
    line.length > 100 ||
    /\bTOTAL AMOUNT\b|₹|\b(?:RS|INR)\b/i.test(line) ||
    isLikelyLineItemRow(line) ||
    /\b(?:providing|fixing|cabinet|wardrobe|ply(?:wood)?|laminate|acrylic|hdhmr|hinges?|channels?|handles?)\b/i.test(
      line,
    )
  ) return false;
  return containsLocationSectionLabel(line);
}

function containsLocationSectionLabel(value: string): boolean {
  return /\b(?:GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH)[-\s]*FLOOR\b|\b(?:MBR|GBR|KBR|PBR|BEDROOM|MASTER\s+(?:BED)?ROOM|KIDS?\s+(?:BED)?ROOM|GUEST\s+(?:BED)?ROOM|KITCHEN|UTILITY|FOYER|LIVING|DINN?ING|STUDY|POOJA|PUJA|BALCONY|BATHROOM|TOILET|ENTRY|ENTRANCE|ACCESSORIES|WALL\s*PAPER|FALSE\s+CEILING|ELECTRIC(?:AL)?\s+WORK)\b/i.test(
    value,
  );
}

function sourceContextHasMaterialSpecification(context: string): boolean {
  return /\b(?:\d+(?:\.\d+)?\s*mm|bwp|mr\s+grade|mr\s+ply|ply(?:wood)?|mdf|hdhmr|laminate|acrylic|veneer|solid\s+wood|marble|granite|steel|glass|fabric\s+laminate|pvc|gypsum|gyp|board|channel|aluminium|pwb|wooden\s+frame|ss)\b/i.test(
    context,
  );
}

function isServiceOnlyItem(label: string): boolean {
  return /\b(?:clean(?:ing|up)?|debris|disposal|transport(?:ation)?|packing|unloading|labou?r|supervision|site\s+measurement|consult(?:ation)?|service|visit)\b/i.test(
    label,
  );
}

function isHardwareAccessoryItem(label: string): boolean {
  return /\b(?:channel|tand[eo]m|tray|basket|wicker|g-?profile|pull\s*out|hinge|lock|handle|hardware)\b/i.test(
    label,
  );
}

function isFinishedHardwareProduct(label: string): boolean {
  return /\b(?:g-?profile|wicker|telescopic\s+channel)\b/i.test(label);
}

function materialReviewApplies(label: string): boolean {
  return !isServiceOnlyItem(label) &&
    !isFinishedHardwareProduct(label) &&
    !/\b(?:wall\s*paper|mirror|glass|paint(?:ing)?|electric(?:al)?|civil|plumbing)\b/i.test(
    label,
  );
}

function materialGradeReviewApplies(label: string): boolean {
  return materialReviewApplies(label);
}

function brandReviewApplies(label: string): boolean {
  return !isServiceOnlyItem(label);
}

function sourceContextHasBrand(context: string): boolean {
  return /\b(?:brand|century|maxima|airolam|stylam|rehau|saint\s+gobain|gyproc|action\s+tesa|hettich|ebco|europa|modiguard)\b/i.test(
    context,
  );
}

type GlobalMaterialSpecification = {
  evidence: string;
  hasCabinetMaterial: boolean;
  hasCabinetBrand: boolean;
  hasHardwareBrand: boolean;
  hasFalseCeilingMaterial: boolean;
  hasFalseCeilingBrand: boolean;
};

function isGlobalMaterialSpecificationHeading(line: string): boolean {
  return /^MATERIAL\s+SPECIFICATIONS?\b/i.test(line.trim());
}

function isGlobalMaterialSpecificationEnd(line: string): boolean {
  return /^(?:SCOPE\s+OF\s+WORK|PAYMENT\s+(?:DETAILS|TERMS|SCHEDULE)|TERMS\s+AND\s+CONDITIONS|NOTES?|WARRANTY|EXCLUSIONS?)\b/i.test(
    line.trim(),
  );
}

function globalMaterialSpecificationCoverage(
  sourceText: string,
): GlobalMaterialSpecification | null {
  let inSpecificationSection = false;
  const specificationLines: string[] = [];

  for (const rawLine of sourceText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isGlobalMaterialSpecificationHeading(line)) {
      inSpecificationSection = true;
      continue;
    }
    if (inSpecificationSection && isGlobalMaterialSpecificationEnd(line)) break;
    if (inSpecificationSection) specificationLines.push(line);
  }

  if (specificationLines.length === 0) return null;
  const evidence = [...new Set(specificationLines)].join("\n");
  return {
    evidence,
    hasCabinetMaterial: specificationLines.some((line) =>
      /^(?:dry|wet)\s+areas?\b/i.test(line) &&
      /\b(?:ply|plywood|bwp|mr|century|maxima)\b/i.test(line),
    ),
    hasCabinetBrand: specificationLines.some((line) =>
      /^(?:dry|wet)\s+areas?\b|^colour\s+laminate\b|^shutters?\s*\/?\s*expo\s+panel\b/i.test(
        line,
      ) &&
      /\b(?:century|maxima|airolam|stylam|hdhmr)\b/i.test(line),
    ),
    hasHardwareBrand: specificationLines.some((line) =>
      /^hardware'?s?\b/i.test(line) &&
      /\b(?:hettich|ebco)\b/i.test(line),
    ),
    hasFalseCeilingMaterial: specificationLines.some((line) =>
      /^false\s+ceiling\b/i.test(line) &&
      /\b(?:saint|gyp|board|mm)\b/i.test(line),
    ),
    hasFalseCeilingBrand: specificationLines.some((line) =>
      /^false\s+ceiling\b/i.test(line) &&
      /\b(?:saint\s+gobain|gyproc)\b/i.test(line),
    ),
  };
}

function globalSpecificationCoversMaterial(
  label: string,
  specification: GlobalMaterialSpecification | null,
): boolean {
  if (!specification || isServiceOnlyItem(label)) return false;
  if (/\bfalse\s+ceiling\b/i.test(label)) {
    return specification.hasFalseCeilingMaterial;
  }
  if (
    /\b(?:wall\s*paper|mirror|glass|paint(?:ing)?|electric(?:al)?|civil|plumbing|tand[eo]m|tray|basket|channel|g-?profile|shutter|door)\b/i.test(
      label,
    )
  ) {
    return false;
  }
  return specification.hasCabinetMaterial;
}

function globalSpecificationCoversBrand(
  label: string,
  specification: GlobalMaterialSpecification | null,
): boolean {
  if (!specification || isServiceOnlyItem(label)) return false;
  if (/\bfalse\s+ceiling\b/i.test(label)) {
    return specification.hasFalseCeilingBrand;
  }
  if (/\b(?:wall\s*paper|electric(?:al)?|civil|plumbing)\b/i.test(label)) {
    return false;
  }
  if (isHardwareAccessoryItem(label)) {
    return specification.hasHardwareBrand;
  }
  return specification.hasCabinetBrand;
}

function currentItemSpecificationContext(
  section: string | null | undefined,
  excerpt: string | null | undefined,
): string {
  const currentItemLines = section ? [section] : [];
  const excerptLines = excerpt?.split(/\r?\n/) ?? [];
  for (let index = 0; index < excerptLines.length; index += 1) {
    const line = excerptLines[index];
    if (
      index > 0 &&
      (
        isLikelyLineItemRow(line) ||
        isDocumentSectionHeading(line)
      )
    ) break;
    currentItemLines.push(line);
  }
  return currentItemLines.join("\n");
}

function isDocumentSectionHeading(line: string): boolean {
  return (
    isLocationSectionHeading(line.trim()) ||
    /^(?:TERMS(?:\s+AND\s+CONDITIONS)?|PROCEDURE\s+OF\s+PAYMENT|PAYMENT\s+(?:TERMS|SCHEDULE)|COMPLETION\s+TIMELINE|WARRANTY|NOTES?|EXCLUSIONS?)\b/i.test(
      line.trim(),
    )
  );
}

function isLikelyLineItemRow(line: string): boolean {
  const trimmed = line.trim();
  if (
    /^(?:\d{1,3}[.)\-:]?\s+|[ivxlcdm]+[.)\-:]\s*)[a-z]/i.test(trimmed)
  ) return true;
  return (
    /\b(?:sq\.?\s*ft|sqft|unit|nos?\.?|set)\b/i.test(trimmed) &&
    /(?:₹|(?:rs\.?|inr)\s*)?[\d,]+(?:\.\d+)?\s*$/i.test(trimmed)
  );
}

function hardwareReviewApplies(label: string): boolean {
  return !isServiceOnlyItem(label) && !/\b(?:wall\s*paper|mirror|glass|paint(?:ing)?|electric(?:al)?|civil|plumbing|false\s+ceiling|tand[eo]m\s+box|cutlery\s+tray|thali\s+tray|\bbpo\b|wicker\s+basket)\b/i.test(
    label,
  );
}

function sourceContextHasHardwareSpecification(context: string): boolean {
  return /\b(?:hinges?|drawer\s+channels?|soft\s+close|regular\s+close|locks?|handles?|knobs?|g-?profile|tandem|tandom|cutlery\s+tray|wicker\s+basket)\b/i.test(
    context,
  );
}

type HardwareCategory = "channels" | "hinges" | "locks" | "handles" | "accessories";

const HARDWARE_CATEGORIES: HardwareCategory[] = [
  "channels",
  "hinges",
  "locks",
  "handles",
  "accessories",
];

function hardwareCategoriesInText(value: string): Set<HardwareCategory> {
  const categories = new Set<HardwareCategory>();
  if (/\b(?:drawer\s+)?channels?\b|\b(?:tandem|tandom)\b/i.test(value)) {
    categories.add("channels");
  }
  if (/\bhinges?\b/i.test(value)) categories.add("hinges");
  if (/\blocks?\b/i.test(value)) categories.add("locks");
  if (/\b(?:handles?|knobs?|g-?profile)\b/i.test(value)) {
    categories.add("handles");
  }
  if (/\baccessor(?:y|ies)\b/i.test(value)) categories.add("accessories");
  return categories;
}

function isGlobalHardwareSectionHeading(line: string): boolean {
  return /^(?:GENERAL\s+)?(?:HARDWARE|TERMS(?:\s+AND\s+CONDITIONS)?|GENERAL\s+TERMS|(?:MATERIAL\s+)?SPECIFICATIONS?)\b/i.test(
    line.trim(),
  );
}

function isGlobalHardwareClause(
  line: string,
  inGlobalSection: boolean,
): boolean {
  if (isLikelyLineItemRow(line)) return false;
  const hasHardwareTerm =
    hardwareCategoriesInText(line).size > 0 ||
    /\bhardware\b/i.test(line);
  if (!hasHardwareTerm) return false;

  const hasExplicitGlobalScope =
    /\b(?:all|for\s+all|other\s+units|general|each|every)\b/i.test(line) ||
    /\b(?:are|will\s+be|shall\s+be|to\s+be)\s+(?:used|provided|included|fixed|installed|done)\b/i.test(
      line,
    ) ||
    /\b(?:included|provided|only|limit(?:ed)?|maximum|max\.?)\b/i.test(line);

  return inGlobalSection || hasExplicitGlobalScope;
}

function isUniversalGlobalHardwareClause(line: string): boolean {
  return (
    /^\s*hardware'?s?\s*:/i.test(line) ||
    /\b(?:all|general)\s+hardware\b/i.test(line) ||
    /\bhardware\b[^\n]{0,80}\b(?:will|shall)\s+be\s+(?:used|provided|included|fixed|installed)\b/i.test(
      line,
    )
  );
}

function globalHardwareCoverage(
  sourceText: string,
): {
  evidence: string;
  categories: Set<HardwareCategory>;
  coversAll: boolean;
} | null {
  let inGlobalSection = false;
  const clauses: string[] = [];
  const categories = new Set<HardwareCategory>();
  let coversAll = false;

  for (const rawLine of sourceText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isGlobalHardwareSectionHeading(line)) {
      inGlobalSection = true;
    } else if (
      inGlobalSection &&
      isDocumentSectionHeading(line) &&
      !isGlobalHardwareSectionHeading(line)
    ) {
      inGlobalSection = false;
    }

    if (!isGlobalHardwareClause(line, inGlobalSection)) continue;
    clauses.push(line);
    if (isUniversalGlobalHardwareClause(line)) coversAll = true;
    for (const category of hardwareCategoriesInText(line)) {
      categories.add(category);
    }
  }

  const evidence = [...new Set(clauses)].join("\n");
  return evidence ? { evidence, categories, coversAll } : null;
}

function hardwareCategoriesNeededByItem(label: string): Set<HardwareCategory> {
  const categories = new Set<HardwareCategory>();
  if (/\b(?:drawer|channel|tandem|tandom)\b/i.test(label)) {
    categories.add("channels");
  }
  if (/\bhinges?\b/i.test(label)) categories.add("hinges");
  if (/\blocks?\b/i.test(label)) categories.add("locks");
  if (/\b(?:handles?|knobs?|g-?profile)\b/i.test(label)) {
    categories.add("handles");
  }

  if (categories.size === 0) {
    for (const category of HARDWARE_CATEGORIES) {
      if (category !== "accessories") categories.add(category);
    }
  }
  return categories;
}

function globalHardwareCoversItem(
  label: string,
  categories: Set<HardwareCategory>,
  coversAll: boolean,
): boolean {
  if (coversAll) return true;
  const needed = hardwareCategoriesNeededByItem(label);
  return [...needed].every((category) => categories.has(category));
}

function hasExplicitInclusionOrExclusionTerms(sourceText: string): boolean {
  return /\b(?:exclusions?|excluded?|not\s+included|to\s+be\s+(?:done|provided|borne|paid)\s+by\s+(?:the\s+)?client|client(?:'s)?\s+scope)\b/i.test(
    sourceText,
  );
}

function sourceStatesTimeline(sourceText: string): boolean {
  return /\b(?:delivery|completion|complete|timeline)\b[^\n]{0,80}\b\d+(?:\.\d+)?\s*(?:working\s+)?(?:days?|weeks?|months?)\b/i.test(
    sourceText,
  );
}

function sourceStatesWarranty(sourceText: string): boolean {
  return /\b(?:\d+(?:\.\d+)?\s*(?:years?|months?)\s+warranty|warranty\b[^\n]{0,60}\b\d+(?:\.\d+)?\s*(?:years?|months?))\b/i.test(
    sourceText,
  );
}

function sourceStatesPaymentTerms(sourceText: string): boolean {
  return /(?:\b\d+(?:\.\d+)?\s*%[^\n]{0,100}\b(?:advance|payment|confirmation|construction|factory|delivery|completion|handover)\b|\b(?:advance|payment|confirmation|construction|factory|delivery|completion|handover)\b[^\n]{0,100}\b\d+(?:\.\d+)?\s*%)/i.test(
    sourceText,
  );
}

function sourceStatesQuotationDate(sourceText: string): boolean {
  return /\b(?:quote|quotation)?\s*date\s*[:#-]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/i.test(
    sourceText,
  );
}

function sourceStatesQuotationNumber(sourceText: string): boolean {
  return /\b(?:quote|quotation)\s*(?:no\.?|number|#)\s*[:#-]?\s*[a-z0-9][a-z0-9/-]*\b/i.test(
    sourceText,
  );
}

function printedSectionTotalsReconcile(
  sourceText: string,
  subtotalAmount: number | null,
): boolean {
  if (subtotalAmount === null) return false;
  const sectionTotals: number[] = [];

  for (const sourceLine of sourceText.split(/\r?\n/)) {
    const match = sourceLine
      .trim()
      .match(/^(.*?)\bTOTAL AMOUNT\s+(?:₹\s*|(?:rs\.?|inr)\s*)?([\d,]+(?:\.\d+)?)\s*$/i);
    if (!match) continue;

    const label = match[1].trim();
    if (!label) break;
    if (
      /^(?:after|final|grand|gst|tax|discount|total)\b/i.test(label) ||
      !containsLocationSectionLabel(label)
    ) {
      continue;
    }

    const amount = parseIndianAmount(match[2]);
    if (amount !== null) sectionTotals.push(amount);
  }

  return (
    sectionTotals.length >= 1 &&
    Math.abs(
      sectionTotals.reduce((sum, amount) => sum + amount, 0) - subtotalAmount,
    ) <= 1
  );
}

function followingSectionTotal(
  sourceText: string,
  sourceLineIndex: number | null | undefined,
): number | null {
  if (sourceLineIndex === null || sourceLineIndex === undefined) return null;
  const sourceLines = sourceText.split(/\r?\n/);
  for (
    let index = sourceLineIndex + 1;
    index < Math.min(sourceLines.length, sourceLineIndex + 12);
    index += 1
  ) {
    const line = sourceLines[index].trim();
    if (!line) continue;
    const totalMatch = line.match(
      /\bTOTAL AMOUNT\s+(?:₹\s*|(?:rs\.?|inr)\s*)?([\d,]+(?:\.\d+)?)\s*$/i,
    );
    if (totalMatch) return parseIndianAmount(totalMatch[1]);
    if (isLocationSectionHeading(line)) return null;
  }
  return null;
}

function sourceSectionLineItemCount(
  sourceText: string,
  sourceLineIndex: number | null | undefined,
): number | null {
  if (sourceLineIndex === null || sourceLineIndex === undefined) return null;
  const sourceLines = sourceText.split(/\r?\n/);
  let sectionStart = sourceLineIndex;
  while (sectionStart > 0) {
    if (isLocationSectionHeading(sourceLines[sectionStart].trim())) break;
    sectionStart -= 1;
  }
  let sectionEnd = sourceLineIndex + 1;
  while (sectionEnd < sourceLines.length) {
    if (isDocumentSectionHeading(sourceLines[sectionEnd])) break;
    sectionEnd += 1;
  }
  return sourceLines
    .slice(sectionStart + 1, sectionEnd)
    .filter((line) => isLikelyLineItemRow(line)).length;
}

function normalizedPaymentMilestoneLabel(clause: string): string {
  return clause
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?/gi, "")
    .replace(/\d+(?:\.\d+)?\s*%/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function completePaymentSchedule(
  value: string,
  grandTotalAmount: number | null,
): {
  clauses: string[];
  allocations: number[];
} | null {
  const clauses = paymentMilestoneClauses(value);
  const percentages = parsePaymentMilestonePercentages(value);
  if (percentages && clauses.length === percentages.length) {
    const total = percentages.reduce((sum, percentage) => sum + percentage, 0);
    if (Math.abs(total - 100) <= 0.001) {
      return { clauses, allocations: percentages };
    }
  }

  const amounts = parsePaymentMilestoneAmounts(value);
  if (
    !amounts ||
    clauses.length !== amounts.length ||
    grandTotalAmount === null ||
    grandTotalAmount <= 0
  ) {
    return null;
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (Math.abs(total - grandTotalAmount) > 1) return null;
  return {
    clauses,
    allocations: amounts.map((amount) => (amount / grandTotalAmount) * 100),
  };
}

function paymentScheduleEvidence(
  sourceText: string,
  schedule: { value: string | null; evidence: string | null },
): string | null {
  const excerpts = schedule.value
    ? paymentMilestoneClauses(schedule.value)
        .map((clause) => quoteExcerpt(sourceText, clause))
        .filter((excerpt): excerpt is string => Boolean(excerpt))
    : [];
  const uniqueExcerpts = [...new Set(excerpts)];
  if (uniqueExcerpts.length > 0) return uniqueExcerpts.join("\n");
  return quoteExcerpt(sourceText, schedule.evidence);
}

function addPaymentScheduleConflictFindings(
  extraction: QuotationExtractionResult,
  sourceText: string,
  add: (
    category: FindingCategory,
    severity: FindingSeverity,
    title: string,
    description: string,
    evidence: string,
    recommendation: string,
  ) => void,
  grandTotalAmount: number | null,
): void {
  const schedules =
    extraction.paymentSchedules?.length > 0
      ? extraction.paymentSchedules
      : extraction.paymentTerms.value
        ? [extraction.paymentTerms]
        : [];
  const completeSchedules = schedules
    .map((schedule) => {
      const parsed = schedule.value
        ? completePaymentSchedule(schedule.value, grandTotalAmount)
        : null;
      return parsed ? { schedule, ...parsed } : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        schedule: (typeof schedules)[number];
        clauses: string[];
        allocations: number[];
      } => entry !== null,
    );

  for (let leftIndex = 0; leftIndex < completeSchedules.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < completeSchedules.length;
      rightIndex += 1
    ) {
      const left = completeSchedules[leftIndex];
      const right = completeSchedules[rightIndex];
      const differs =
        left.allocations.length !== right.allocations.length ||
        left.allocations.some(
          (allocation, index) =>
            Math.abs(allocation - (right.allocations[index] ?? -1)) > 0.001,
        ) ||
        left.clauses.length !== right.clauses.length ||
        left.clauses.some(
          (clause, index) =>
            normalizedPaymentMilestoneLabel(clause) !==
            normalizedPaymentMilestoneLabel(right.clauses[index] ?? ""),
        );
      if (!differs) continue;

      const leftEvidence = paymentScheduleEvidence(sourceText, left.schedule);
      const rightEvidence = paymentScheduleEvidence(sourceText, right.schedule);
      if (!leftEvidence || !rightEvidence) continue;
      add(
        "payment_risk",
        "HIGH",
        "Conflicting payment schedules",
        "The quotation contains complete payment schedules with different milestone timing or wording. Clarify which schedule controls before approval.",
        `${leftEvidence}\n\n${rightEvidence}`,
        "Ask the provider to remove the conflicting clause and confirm one signed payment schedule, including the milestone timing and final balance.",
      );
    }
  }
}

export async function analyzeQuotation(
  extraction: QuotationExtractionResult,
  sourceText: string,
): Promise<QuoteIntelligenceResult> {
  return {
    findings: sanitizeQuoteFindings(baselineFindings(extraction, sourceText)),
    documentationCompletenessScore: calculateDocumentationCompletenessScore(extraction, sourceText),
  };
}

function baselineFindings(extraction: QuotationExtractionResult, sourceText: string): QuoteFinding[] {
  const output: QuoteFinding[] = [];
  const add = (category: FindingCategory, severity: FindingSeverity, title: string, description: string, evidence: string, recommendation: string) =>
    evidence && output.push({ category, severity, title, description, evidence, recommendation });
  const lineItemContexts = locateLineItemContexts(extraction, sourceText);
  const globalHardware = globalHardwareCoverage(sourceText);
  const globalSpecifications = globalMaterialSpecificationCoverage(sourceText);
  let addedGlobalHardwareFinding = false;
  if (extraction.lineItems.length === 0) {
    const evidence = quoteExcerpt(sourceText);
    if (evidence) add("missing_item", "HIGH", "No itemized scope was extracted", "The quotation does not provide usable line items for scope review.", evidence, "Ask for an itemized scope with quantities, units, and amounts.");
  }
  extraction.lineItems.forEach((item, index) => {
    const label = item.description.value ?? `line item ${index + 1}`;
    const locatedContext = lineItemContexts[index];
    const evidence =
      locatedContext?.excerpt ?? quoteExcerpt(sourceText, item.evidence, true);
    const sourceContext = currentItemSpecificationContext(
      locatedContext?.section,
      evidence,
    );
    const sectionTotal = followingSectionTotal(
      sourceText,
      locatedContext?.sourceLineIndex,
    );
    const sourceSectionItemCount = sourceSectionLineItemCount(
      sourceText,
      locatedContext?.sourceLineIndex,
    );
    if (
      !item.material.value &&
      materialReviewApplies(label) &&
      !globalSpecificationCoversMaterial(label, globalSpecifications) &&
      !sourceContextHasMaterialSpecification(sourceContext)
    ) add("material_ambiguity", "MEDIUM", `Material not specified for ${label}`, "This line item does not name a material or specification.", evidence ?? "", "Request the material grade, finish, and specification in writing.");
    if (
      !item.brand.value &&
      brandReviewApplies(label) &&
      !globalSpecificationCoversBrand(label, globalSpecifications) &&
      !sourceContextHasBrand(sourceContext)
    ) add("brand_ambiguity", "LOW", `Brand not specified for ${label}`, "No brand is recorded for this line item.", evidence ?? "", "Ask the vendor to name the proposed brand or confirm that an equivalent is acceptable.");
    if (
      !item.hardware.value &&
      hardwareReviewApplies(label) &&
      !sourceContextHasHardwareSpecification(sourceContext)
    ) {
      if (
        globalHardware &&
        globalHardwareCoversItem(
          label,
          globalHardware.categories,
          globalHardware.coversAll,
        )
      ) {
        if (!addedGlobalHardwareFinding) {
          add(
            "hardware_ambiguity",
            "LOW",
            "General hardware coverage is not mapped to line items",
            "The quotation states general hardware terms, but does not identify the applicable hardware quantity or specification for each covered line item.",
            globalHardware.evidence,
            "Ask the provider to confirm which general hardware terms apply to each line item and state any item-specific exceptions.",
          );
          addedGlobalHardwareFinding = true;
        }
      } else if (globalHardware) {
        add("hardware_ambiguity", "LOW", `Hardware is not mapped to ${label}`, "The quotation contains general hardware terms but does not clearly map a brand, model, finish, and quantity to this line item.", evidence ?? "", "Ask the provider to map the applicable hardware specification to this item.");
      } else {
        add("hardware_ambiguity", "LOW", `Hardware is not defined for ${label}`, "The line item does not identify hardware or fitting specifications.", evidence ?? "", "Request hardware brand, model, finish, and quantity.");
      }
    }
    if (!item.quantity.value || !item.unit.value) add("quantity_anomaly", "MEDIUM", `Quantity is incomplete for ${label}`, "The line item is missing a quantity or unit of measure.", evidence ?? "", "Ask for measurable quantities and units before approving the scope.");
    const statedItemAmount = parseIndianAmount(item.amount.value);
    const itemAmount = parsePositiveItemAmount(item.amount.value);
    if (
      itemAmount === null &&
      !(
        sectionTotal !== null &&
        sectionTotal > 0 &&
        sourceSectionItemCount === 1
      )
    ) add("hidden_cost", "MEDIUM", `Amount is missing for ${label}`, "This scope item has no stated price, so the final charge cannot be verified.", evidence ?? "", "Request a price for this item and confirm whether it is included in the total.");
    if (/labou?r|installation|fitting/i.test(label) && itemAmount === null) add("labour_ambiguity", "MEDIUM", `Labour cost is unclear for ${label}`, "The labour-related scope does not show a separate or included amount.", evidence ?? "", "Ask whether labour, installation, supervision, and transport are included.");
    if (itemAmount !== null && (!item.quantity.value || !item.unit.value)) add("lump_sum", "MEDIUM", `Lump sum is used for ${label}`, "This item has an amount but no measurable quantity or unit breakdown.", evidence ?? "", "Ask for quantity, unit rate, and the total calculation for this item.");
    if (item.material.value && /as per sample|standard quality|good quality|best quality/i.test(item.material.value)) add("vague_spec", "MEDIUM", `Specification is vague for ${label}`, "The material description uses a non-measurable quality or sample reference.", evidence ?? "", "Ask for a measurable grade, finish, thickness, and approved sample reference.");
    if (
      item.material.value &&
      materialGradeReviewApplies(label) &&
      !globalSpecificationCoversMaterial(label, globalSpecifications) &&
      !/\b(grade|mm|thick|ply|laminate|acrylic|solid|veneer|marble|granite|wood|steel|glass)\b/i.test(item.material.value)
    ) add("missing_grade", "LOW", `Material grade is not clear for ${label}`, "The material is named without a grade, thickness, or measurable specification.", evidence ?? "", "Ask for the exact grade, thickness, finish, and specification.");
    if (
      statedItemAmount !== null &&
      sectionTotal !== null &&
      Math.abs(statedItemAmount - sectionTotal) > 1 &&
      sourceSectionItemCount === 1
    ) {
      add("math_error", "HIGH", `${label} amount does not match its section total`, `The stated item amount ${formatAmount(statedItemAmount)} does not match the printed section total ${formatAmount(sectionTotal)}.`, evidence ?? "", "Ask the provider to correct and reconcile the item amount and section total in writing.");
    }
  });
  const documentEvidence = quoteExcerpt(sourceText) ?? "";
  const documentedAmounts = extraction.lineItems.map((item) =>
    parsePositiveItemAmount(item.amount.value),
  );
  const lineItemTotal =
    documentedAmounts.length > 0 &&
    documentedAmounts.every((amount): amount is number => amount !== null)
      ? documentedAmounts.reduce((sum, amount) => sum + amount, 0)
      : null;
  const subtotalAmount = parseIndianAmount(extraction.subtotalBeforeGst?.value ?? null);
  const printedGstAmount = parseIndianAmount(extraction.gstAmount?.value ?? null);
  const grandTotalAmount =
    parseIndianAmount(extraction.grandTotalInclusiveGst?.value ?? null)
    ?? parseIndianAmount(extraction.totalQuotationValue.value);
  const gstRate =
    parsePercentage(extraction.gstRate?.value ?? null)
    ?? findPrintedGstRate(sourceText);
  const completeLineItemExtraction =
    lineItemTotal !== null && hasCompleteLineItemExtraction(extraction, sourceText);
  const printedSectionsReconcile = printedSectionTotalsReconcile(
    sourceText,
    subtotalAmount,
  );
  if (
    extraction.lineItems.length > 0 &&
    grandTotalAmount !== null &&
    documentedAmounts.some((amount) => amount === null) &&
    !printedSectionsReconcile
  ) add("price_anomaly", "MEDIUM", "Line items cannot be reconciled to the total", "Some itemized scope has no stated amount, so the quotation total cannot be checked against the listed work.", documentEvidence, "Request a revised itemized total; no market-price comparison has been made.");
  if (completeLineItemExtraction && subtotalAmount !== null) {
    if (Math.abs(lineItemTotal - subtotalAmount) > 1) {
      add("math_error", "HIGH", "Item totals do not match the quoted subtotal", "The sum of the stated line-item amounts does not match the pre-GST subtotal.", documentEvidence, "Ask the provider to reconcile the line-item total and the pre-GST subtotal in writing.");
    }
  }
  if (
    subtotalAmount !== null &&
    printedGstAmount !== null &&
    grandTotalAmount !== null &&
    Math.abs(subtotalAmount + printedGstAmount - grandTotalAmount) > 1
  ) {
    add("math_error", "HIGH", "Subtotal and GST do not match the quoted total", "The stated subtotal plus the printed GST amount does not match the GST-inclusive grand total.", documentEvidence, "Ask the provider to reconcile the subtotal, GST amount, and grand total in writing.");
  }
  if (completeLineItemExtraction && subtotalAmount === null && grandTotalAmount !== null && gstRate !== null) {
    const expectedGrandTotal = Math.round(lineItemTotal * (1 + gstRate / 100));
    if (Math.abs(expectedGrandTotal - grandTotalAmount) > 1) {
      add("math_error", "HIGH", "Item totals do not match the GST-inclusive total", "The line-item sum plus the printed GST rate does not match the GST-inclusive grand total.", documentEvidence, "Ask the provider to reconcile the line-item sum, GST rate, and grand total in writing.");
    }
  }
  const descriptions = new Map<string, Array<{
    index: number;
    section: string | null;
    confidentlyLocated: boolean;
    quantity: string | null;
    unit: string | null;
    amount: number | null;
  }>>();
  extraction.lineItems.forEach((item, index) => {
    const normalized = normalizedDescription(item.description.value);
    if (!normalized) return;
    const context = lineItemContexts[index];
    const section = context?.section ?? null;
    const confidentlyLocated = context?.confidentlyLocated ?? false;
    const quantity = item.quantity.value?.trim().toLowerCase() ?? null;
    const unit = item.unit.value?.trim().toLowerCase() ?? null;
    const amount = parseIndianAmount(item.amount.value);
    const hasCommercialIdentity = quantity !== null || amount !== null;
    const previousEntries = descriptions.get(normalized) ?? [];
    const previousEntry = previousEntries.find(
      (entry) =>
        entry.confidentlyLocated &&
        confidentlyLocated &&
        entry.section !== null &&
        entry.section === section &&
        hasCommercialIdentity &&
        entry.quantity === quantity &&
        entry.unit === unit &&
        entry.amount === amount,
    );
    if (previousEntry) {
      const evidence =
        lineItemContexts[index]?.excerpt ??
        quoteExcerpt(sourceText, item.evidence) ??
        documentEvidence;
      add("duplicate", "MEDIUM", `Potential duplicate line item: ${item.description.value}`, `This description also appears in line item ${previousEntry.index + 1} within the same quotation section.`, evidence, "Ask whether these entries refer to distinct work and request separate quantities or locations.");
    }
    previousEntries.push({
      index,
      section,
      confidentlyLocated,
      quantity,
      unit,
      amount,
    });
    descriptions.set(normalized, previousEntries);
  });
  addPaymentScheduleConflictFindings(
    extraction,
    sourceText,
    add,
    grandTotalAmount,
  );
  if (!extraction.timeline.value && !sourceStatesTimeline(sourceText)) add("timeline_risk", "MEDIUM", "Project timeline is not stated", "No completion timeline was found in the quotation.", documentEvidence, "Request start date, completion date, milestones, and delay handling.");
  if (!extraction.warranty.value && !sourceStatesWarranty(sourceText)) add("warranty_gap", "MEDIUM", "Warranty terms are not stated", "No warranty terms were found in the quotation.", documentEvidence, "Request workmanship and product warranty duration, coverage, and claim process.");
  if (!extraction.paymentTerms.value) {
    if (sourceStatesPaymentTerms(sourceText)) {
      add("payment_risk", "MEDIUM", "Payment schedule could not be verified", "Payment terms are visible in the quotation, but a complete grounded schedule could not be structured for reconciliation.", documentEvidence, "Ask for one clear milestone schedule whose percentages total 100% and whose amounts reconcile to the quotation total.");
    } else {
      add("payment_risk", "HIGH", "Payment terms are not stated", "No payment schedule or payment conditions were found.", documentEvidence, "Request a milestone-based payment schedule and retainage/acceptance terms.");
    }
  } else if (extraction.paymentTerms.value) {
    const milestonePercentages = parsePaymentMilestonePercentages(extraction.paymentTerms.value);
    if (milestonePercentages) {
      const milestoneTotal = milestonePercentages.reduce((sum, percentage) => sum + percentage, 0);
      if (Math.abs(milestoneTotal - 100) > 0.001) {
        const formattedTotal = Number.isInteger(milestoneTotal)
          ? String(milestoneTotal)
          : milestoneTotal.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        add(
          "payment_risk",
          "HIGH",
          `Payment milestones total ${formattedTotal}% instead of 100%`,
          `The explicitly stated payment milestones add up to ${formattedTotal}%, so the payment schedule does not reconcile to the full quoted amount.`,
          quoteExcerpt(sourceText, extraction.paymentTerms.evidence) ?? documentEvidence,
          "Ask the provider to reconcile every payment milestone to 100% and document when the remaining balance is due.",
        );
      } else {
        const preCompletionMilestones = milestonePercentages.slice(0, -1);
        const largestPreCompletionMilestone = Math.max(...preCompletionMilestones, 0);
        if (largestPreCompletionMilestone >= 50) {
          const severity: FindingSeverity =
            largestPreCompletionMilestone >= 70 ? "HIGH" : "MEDIUM";
          const milestoneIndex = preCompletionMilestones.indexOf(
            largestPreCompletionMilestone,
          );
          const milestoneClause = paymentMilestoneClauses(
            extraction.paymentTerms.value,
          )[milestoneIndex];
          const evidence =
            quoteExcerpt(sourceText, milestoneClause) ??
            quoteExcerpt(sourceText, extraction.paymentTerms.evidence) ??
            documentEvidence;
          add(
            "payment_risk",
            severity,
            `${largestPreCompletionMilestone}% payment is due before project completion`,
            `A single pre-completion milestone requires ${largestPreCompletionMilestone}% of the quoted amount.`,
            evidence,
            "Ask for the payment to be spread across smaller, verifiable work milestones with a meaningful balance retained until final acceptance.",
          );
        }
      }
    }
    const milestoneAmounts = parsePaymentMilestoneAmounts(extraction.paymentTerms.value);
    if (milestoneAmounts && grandTotalAmount !== null) {
      const milestoneTotal = milestoneAmounts.reduce((sum, amount) => sum + amount, 0);
      if (Math.abs(milestoneTotal - grandTotalAmount) > 1) {
        add(
          "payment_risk",
          "HIGH",
          "Payment milestone amounts do not match the quoted total",
          `The explicitly stated payment milestones add up to ${formatAmount(milestoneTotal)}, but the quoted grand total is ${formatAmount(grandTotalAmount)}.`,
          quoteExcerpt(sourceText, extraction.paymentTerms.evidence) ?? documentEvidence,
          "Ask the provider to reconcile every payment amount to the quoted grand total and document any remaining balance.",
        );
      }
    }
  }
  if (!/\b(gst|tax|vat|cgst|sgst|igst)\b/i.test(sourceText)) add("tax_ambiguity", "MEDIUM", "Tax treatment is not clear", "The quotation text does not clearly state tax treatment.", documentEvidence, "Ask whether taxes are included, excluded, and which rate applies.");
  if (!hasExplicitInclusionOrExclusionTerms(sourceText)) add("hidden_exclusion", "MEDIUM", "Exclusions are not stated", "The quotation does not clearly list excluded work or materials.", documentEvidence, "Request a written exclusions list, including site preparation, disposal, transport, and permits.");
  const hasQuotationNumber =
    Boolean(extraction.quotationNumber.value) ||
    sourceStatesQuotationNumber(sourceText);
  const hasQuotationDate =
    Boolean(extraction.quotationDate.value) ||
    sourceStatesQuotationDate(sourceText);
  if (!hasQuotationNumber || !hasQuotationDate) {
    const missingReference =
      !hasQuotationNumber && !hasQuotationDate
        ? "Quotation number and date are missing"
        : !hasQuotationNumber
          ? "Quotation number is missing"
          : "Quotation date is missing";
    add("contract_risk", "LOW", missingReference, "The quotation is missing reference information needed for document traceability.", documentEvidence, "Ask for a dated, numbered quotation and written acceptance terms.");
  }
  return output;
}

export function calculateDocumentationCompletenessScore(
  extraction: QuotationExtractionResult,
  sourceText: string,
): number {
  let total = 0;
  let documented = 0;
  const check = (value: unknown) => {
    total += 1;
    if (typeof value === "string" ? value.trim().length > 0 : Boolean(value)) documented += 1;
  };
  check(extraction.lineItems.length > 0);
  extraction.lineItems.forEach((item) => {
    check(item.description.value);
    check(item.quantity.value);
    check(item.unit.value);
    check(item.amount.value);
    check(item.material.value);
    check(item.brand.value);
    check(item.hardware.value);
  });
  check(extraction.timeline.value);
  check(extraction.warranty.value);
  check(extraction.paymentTerms.value);
  check(/\b(gst|tax|vat|cgst|sgst|igst)\b/i.test(sourceText));
  check(/\b(exclusion|exclude|not included)\b/i.test(sourceText));
  check(extraction.quotationNumber.value);
  check(extraction.quotationDate.value);
  return total === 0 ? 0 : Math.round((documented / total) * 100);
}
