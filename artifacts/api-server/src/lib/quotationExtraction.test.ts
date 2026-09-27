import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTextFromPopplerBboxLayout,
  normalizeQuotationResult,
  parsePaymentMilestoneAmounts,
  parsePaymentMilestonePercentages,
} from "./quotationExtraction";
import { analyzeQuotation } from "./quoteIntelligence";

const arithmeticSource = [
  "1 Kitchen Lump Sum ₹10,000",
  "2 Wardrobe 2 sqft ₹20,000 ₹40,000",
  "Grand Subtotal ₹50,000",
  "GST @ 18% ₹9,000",
  "GRAND TOTAL (Inclusive of GST) ₹59,000",
].join("\n");

function arithmeticRaw(
  items: Array<[string, string | null, string | null, string, string?]>,
  subtotal: string,
  gstAmount: string,
  grandTotal: string,
) {
  return {
    r: true,
    f: {
      subtotalBeforeGst: [subtotal, `Grand Subtotal ₹${subtotal.replace("₹", "")}`, 0.98],
      gstAmount: [gstAmount, `GST @ 18% ${gstAmount}`, 0.98],
      grandTotalInclusiveGst: [grandTotal, `GRAND TOTAL (Inclusive of GST) ${grandTotal}`, 0.98],
      totalQuotationValue: [grandTotal, `GRAND TOTAL (Inclusive of GST) ${grandTotal}`, 0.98],
      gstRate: ["18%", "GST @ 18%", 0.98],
    },
    items: items.map(([description, quantity, unit, amount, evidence], index) => [
      description,
      quantity,
      unit,
      amount,
      null,
      null,
      null,
      evidence ?? `${index + 1} ${description}`,
      0.98,
    ]),
  } satisfies Record<string, unknown>;
}

function mathCategories(
  extraction: Parameters<typeof analyzeQuotation>["0"],
  sourceText: string,
) {
  return analyzeQuotation(extraction, sourceText).then((analysis) =>
    analysis.findings
      .filter((finding) => finding.category === "math_error")
      .map((finding) => finding.title),
  );
}

const warrantySource = [
  "WARRANTY PROJECT TIMELINE",
  "Carpentry & Woodwork: 5 years 60 working days from receipt of material advance,",
  "Hardware (hinges, channels, fittings): 1 year subject to site readiness.",
].join("\n");

function rawWithWarranty(value: string, evidence: string) {
  return {
    r: true,
    f: {
      warranty: [value, evidence, 0.98],
    },
  } satisfies Record<string, unknown>;
}

test("reads two-column prose down each column while preserving ordinary rows", () => {
  const bboxLayout = `
    <html><body><doc>
      <page width="600" height="800">
        <flow><block xMin="50" yMin="30" xMax="210" yMax="40">
          <line xMin="50" yMin="30" xMax="210" yMax="40">
            <word>PAYMENT</word><word>SCHEDULE</word>
          </line>
        </block></flow>
        <flow><block xMin="50" yMin="50" xMax="330" yMax="60">
          <line xMin="50" yMin="50" xMax="330" yMax="60">
            <word>Upon</word><word>order</word><word>confirmation</word>
          </line>
        </block></flow>
        <flow><block xMin="450" yMin="52.8" xMax="500" yMax="62.8">
          <line xMin="450" yMin="52.8" xMax="500" yMax="62.8">
            <word>90%</word>
          </line>
        </block></flow>
        <flow><block xMin="50" yMin="100" xMax="280" yMax="136">
          <line xMin="50" yMin="100" xMax="120" yMax="110">
            <word>WARRANTY</word>
          </line>
          <line xMin="50" yMin="113" xMax="270" yMax="123">
            <word>Carpentry</word><word>and</word><word>woodwork:</word><word>five</word><word>years</word>
          </line>
          <line xMin="50" yMin="126" xMax="100" yMax="136">
            <word>Hardware</word><word>and</word><word>fittings:</word><word>one</word><word>year</word>
          </line>
        </block></flow>
        <flow><block xMin="310" yMin="100" xMax="550" yMax="136">
          <line xMin="310" yMin="100" xMax="380" yMax="110">
            <word>TIMELINE</word>
          </line>
          <line xMin="310" yMin="113" xMax="540" yMax="123">
            <word>Sixty</word><word>working</word><word>days</word><word>from</word><word>receipt</word><word>of</word><word>advance,</word>
          </line>
          <line xMin="310" yMin="126" xMax="380" yMax="136">
            <word>subject</word><word>to</word><word>site</word><word>readiness.</word>
          </line>
        </block></flow>
      </page>
    </doc></body></html>`;

  const text = extractTextFromPopplerBboxLayout(bboxLayout);

  assert.match(text, /Upon order confirmation 90%/);
  assert.match(
    text,
    /WARRANTY\nCarpentry and woodwork: five years\nHardware and fittings: one year\nTIMELINE\nSixty working days from receipt of advance,\nsubject to site readiness\./,
  );
  assert.doesNotMatch(text, /five years Sixty working days/);
});

test("keeps wide table columns in row order instead of treating them as prose", () => {
  const bboxLayout = `
    <page width="600" height="800">
      <flow><block xMin="40" yMin="80" xMax="280" yMax="120">
        <line xMin="40" yMin="80" xMax="150" yMax="90"><word>DESCRIPTION</word></line>
        <line xMin="40" yMin="95" xMax="250" yMax="105"><word>•</word><word>Kitchen</word><word>base</word><word>cabinet</word><word>with</word><word>hardware</word></line>
        <line xMin="40" yMin="110" xMax="250" yMax="120"><word>•</word><word>Bedroom</word><word>wardrobe</word><word>with</word><word>loft</word><word>storage</word></line>
      </block></flow>
      <flow><block xMin="310" yMin="80" xMax="550" yMax="120">
        <line xMin="310" yMin="80" xMax="400" yMax="90"><word>NOTES</word></line>
        <line xMin="310" yMin="95" xMax="530" yMax="105"><word>•</word><word>Premium</word><word>hardware</word><word>included</word><word>in</word><word>price</word></line>
        <line xMin="310" yMin="110" xMax="530" yMax="120"><word>•</word><word>Selected</word><word>finish</word><word>included</word><word>in</word><word>price</word></line>
      </block></flow>
    </page>`;

  assert.equal(
    extractTextFromPopplerBboxLayout(bboxLayout),
    [
      "DESCRIPTION NOTES",
      "• Kitchen base cabinet with hardware • Premium hardware included in price",
      "• Bedroom wardrobe with loft storage • Selected finish included in price",
    ].join("\n"),
  );
});

test("returns no text for malformed Poppler bbox output", () => {
  assert.equal(
    extractTextFromPopplerBboxLayout("<page width=\"600\"><broken>"),
    "",
  );
});

test("grounds a two-character quantity against its source row", () => {
  const evidence = "Base Cabinets 38 sqft ₹1,550 ₹58,900";
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Base Cabinets",
        "38",
        "sqft",
        "₹58,900",
        null,
        null,
        null,
        evidence,
        0.94,
      ]],
    },
    `1 ${evidence}`,
  );

  assert.equal(normalized.lineItems[0]?.quantity.value, "38");
  assert.equal(normalized.lineItems[0]?.quantity.evidence, evidence);
});

test("keeps grounded multi-fragment material, brand, and hardware values", () => {
  const source = [
    "1 Shoe Unit 12 sqft ₹17,995",
    "Carcass: MR Grade Plywood with selected laminate. Shutter T/ Super Matt made with HDHMR Board with selected laminate.",
    "Hettich soft-close hinges",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Shoe Unit",
        "12",
        "sqft",
        "₹17,995",
        "Carcass: MR Grade Plywood with selected laminate; Shutter made with HDHMR Board with selected laminate",
        "Hettich",
        "soft-close hinges; Hettich",
        "Shoe Unit 12 sqft ₹17,995",
        0.94,
      ]],
    },
    source,
  );

  assert.equal(
    normalized.lineItems[0]?.material.value,
    "Carcass: MR Grade Plywood with selected laminate; Shutter made with HDHMR Board with selected laminate",
  );
  assert.equal(normalized.lineItems[0]?.brand.value, "Hettich");
  assert.equal(normalized.lineItems[0]?.hardware.value, "soft-close hinges; Hettich");
});

test("rejects a multi-fragment line-item specification with unsupported words", () => {
  const source = [
    "1 Shoe Unit 12 sqft ₹17,995",
    "Carcass: MR Grade Plywood with selected laminate. Shutter T/ Super Matt made with HDHMR Board.",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Shoe Unit",
        "12",
        "sqft",
        "₹17,995",
        "Carcass: MR Grade Plywood with selected laminate; Shutter made with solid teak wood",
        null,
        null,
        "Shoe Unit 12 sqft ₹17,995",
        0.94,
      ]],
    },
    source,
  );

  assert.equal(normalized.lineItems[0]?.material.value, null);
});

test("keeps representative Rakesh rows when item evidence uses explicit omissions", () => {
  const source = [
    "BEDROOM - 02",
    "1 Wardrobe box (Swing Century MR Ply sq ft 72.80 1700 123760.0",
    "Door) back Side 0.8mm fabric laminate.",
    "2 Loft Unit Century MR Ply sq ft 31.20 1000 31200.0",
    "3 Dressing Unit Century MR Ply sq ft 14.00 1650 23100.0",
    "KITCHEN & UTILITY AREA (BWP 710 GRADE)",
    "1 Kitchen Base Unit 16mm Century BWP Ply Action Tesa HDHMR GProfile Handle are used sq ft 51.00 2050 104550.0",
    "4 Utility Wall Unit Carcass 16mm Century BWP Ply sq ft 6.00 1700 10200.0",
    "ACCESSORIES FOR KITCHEN AND WARDROBES (HETTICH)",
    "1 Tandom Box Tandom with gallery - 4 Unit 4.00 7000 28000.0",
    "WALLPAPER",
    "1 Wall Paper Wall Paper Start from 150 RS sq ft",
    "ELECTRIC WORK",
    "1 Electric Work Per point, Switches, Socket and GM Lights 1450 Rs (As Per design) Unit",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [
        [
          "Wardrobe box (Swing Door)",
          "72.80",
          "sq ft",
          "123760.0",
          "Century MR Ply",
          "Century",
          null,
          "Wardrobe Box ... Century MR Ply ... sq ft 72.80 1700 123760.0",
          0.9,
        ],
        [
          "Dressing Unit",
          "14.00",
          "sq ft",
          "23100.0",
          "Century MR Ply",
          "Century",
          null,
          "BEDROOM-02 Dressing Unit ... sq ft 14.00 1650 23100.0",
          0.88,
        ],
        [
          "Kitchen Base Unit",
          "51.00",
          "sq ft",
          "104550.0",
          "16mm Century BWP Ply; Action Tesa HDHMR",
          "Century; Action Tesa",
          "GProfile Handle",
          "Kitchen Base Unit ... 16mm Century BWP Ply ... Action Tesa HDHMR ... sq ft 51.00 2050 104550.0",
          0.9,
        ],
        [
          "Utility Wall Unit",
          "6.00",
          "sq ft",
          "10200.0",
          "16mm Century BWP Ply",
          "Century",
          null,
          "Utility Wall Unit ... 16mm Century BWP Ply ... sq ft 6.00 1700 10200.0",
          0.9,
        ],
        [
          "Tandom Box",
          "4.00",
          "Unit",
          "28000.0",
          null,
          "Hettich",
          "Tandom with gallery",
          "Tandom Box Tandom with gallery - 4 Unit 4.00 7000 28000.0",
          0.88,
        ],
        [
          "Wall Paper",
          null,
          "sq ft",
          null,
          null,
          null,
          null,
          "Wall Paper Wall Paper Start from 150 RS sq ft",
          0.8,
        ],
        [
          "Electric Work",
          null,
          "Unit",
          null,
          null,
          null,
          "Switches, Socket and GM Lights",
          null,
          "Per point, Switches, Socket and GM Lights 1450 Rs (As Per design) Unit",
          0.75,
        ],
      ],
    },
    source,
  );

  assert.deepEqual(
    normalized.lineItems.map((item) => item.description.value),
    [
      "Wardrobe box (Swing Door)",
      "Dressing Unit",
      "Kitchen Base Unit",
      "Utility Wall Unit",
      "Tandom Box",
      "Wall Paper",
      "Electric Work",
    ],
  );
});

test("keeps uniquely grounded unpriced scope rows when row evidence is missing or extends into a section total", async () => {
  const source = [
    "WALLPAPER",
    "1 Wall Paper Wall Paper Start from 150 RS sq ft",
    "WALLPAPER TOTAL AMOUNT 0.0",
    "ELECTRIC WORK",
    "1 Electric Work Per point, Switches, Socket and GM Lights 1450 Rs (As Per design) Unit",
    "ELECTRIC WORK TOTAL AMOUNT 0.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        [
          "Wall Paper",
          "",
          "",
          "0.0",
          null,
          null,
          null,
          "Wall Paper Wall Paper Start from 150 RS sq ft WALLPAPER TOTAL AMOUNT 0.0",
          0.7,
        ],
        [
          "Electric Work",
          "",
          "Unit",
          "0.0",
          null,
          null,
          "Switches, Socket and GM Lights",
          null,
          0.7,
        ],
      ],
    },
    source,
  );

  assert.deepEqual(
    extraction.lineItems.map((item) => item.description.value),
    ["Wall Paper", "Electric Work"],
  );
  assert.equal(
    extraction.lineItems[1]?.evidence?.endsWith(source.split("\n")[4]),
    true,
  );
  assert.equal(source.includes(extraction.lineItems[1]?.evidence ?? ""), true);

  const findings = (await analyzeQuotation(extraction, source)).findings;
  for (const label of ["Wall Paper", "Electric Work"]) {
    const finding = findings.find(
      (candidate) =>
        candidate.category === "hidden_cost" &&
        candidate.title === `Amount is missing for ${label}`,
    );
    assert.ok(finding);
    assert.equal(source.includes(finding.evidence), true);
  }
  assert.equal(
    findings.some((finding) => finding.category === "math_error"),
    false,
  );
});

test("does not recover missing evidence from an ambiguous repeated scope row", () => {
  const source = [
    "BEDROOM - 01",
    "1 Wardrobe 10 sq ft",
    "BEDROOM - 02",
    "1 Wardrobe 12 sq ft",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [["Wardrobe", null, "sq ft", null, null, null, null, null, 0.8]],
    },
    source,
  );

  assert.equal(normalized.lineItems.length, 0);
});

test("rejects omitted line-item evidence when an asserted token is unsupported", () => {
  const source = "1 Kitchen Base Unit 16mm Century BWP Ply sq ft 51.00 2050 104550.0";
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Kitchen Base Unit",
        "51.00",
        "sq ft",
        "104550.0",
        "16mm Century BWP Ply",
        "Century",
        null,
        "Kitchen Base Unit ... solid teak ... 104550.0",
        0.9,
      ]],
    },
    source,
  );

  assert.equal(normalized.lineItems.length, 0);
});

test("does not combine a description from one row with another row's evidence", () => {
  const source = [
    "1 Kitchen Base Unit Century BWP Ply sq ft 10.00 1000 10000.0",
    "2 Utility Wall Unit solid teak sq ft 5.00 2000 10000.0",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Kitchen Base Unit",
        "10.00",
        "sq ft",
        "10000.0",
        "solid teak",
        null,
        null,
        "Kitchen Base Unit ... solid teak ... 10000.0",
        0.9,
      ]],
    },
    source,
  );

  assert.equal(normalized.lineItems.length, 0);
});

test("uses source row context instead of the header for multi-line finding evidence", async () => {
  const source = [
    "RAVI KUMAR WOOD WORKS QUOTATION",
    "Proprietor: R. Ravi Kumar Quote No: RKWW/091",
    "1 Base Cabinets 38 sqft ₹1,550 ₹58,900",
    "Century BWP 710 marine plywood, Ebco hinges",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Base Cabinets",
        null,
        "sqft",
        "₹58,900",
        null,
        null,
        null,
        "Base Cabinets 38 sqft ₹1,550 ₹58,900 Century BWP 710 marine plywood, Ebco hinges",
        0.94,
      ]],
    },
    source,
  );

  const analysis = await analyzeQuotation(extraction, source);
  const quantityFinding = analysis.findings.find(
    (finding) => finding.category === "quantity_anomaly",
  );

  assert.equal(
    quantityFinding?.evidence,
    "1 Base Cabinets 38 sqft ₹1,550 ₹58,900\nCentury BWP 710 marine plywood, Ebco hinges",
  );
  assert.equal(quantityFinding?.evidence.includes("RAVI KUMAR WOOD WORKS"), false);
});

test("includes continuation lines when item evidence exactly matches the pricing row", async () => {
  const source = [
    "QUOTATION",
    "1 Living TV Storage 7 sqft ₹10,497",
    "Carcass: MR Grade Plywood with selected laminate. Shutter made with HDHMR Board.",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [[
        "Living TV Storage",
        null,
        "sqft",
        "₹10,497",
        null,
        null,
        null,
        "Living TV Storage 7 sqft ₹10,497",
        0.94,
      ]],
    },
    source,
  );

  const analysis = await analyzeQuotation(extraction, source);
  const quantityFinding = analysis.findings.find(
    (finding) => finding.category === "quantity_anomaly",
  );

  assert.equal(
    quantityFinding?.evidence,
    "1 Living TV Storage 7 sqft ₹10,497\nCarcass: MR Grade Plywood with selected laminate. Shutter made with HDHMR Board.",
  );
});

test("does not claim source-visible materials or irrelevant wallpaper hardware are missing", async () => {
  const source = [
    "BEDROOM - 01",
    "3 Dressing Unit Century MR Ply, front selected 1mm Color laminates, sq ft 7 2 14.00 1650 23100.0",
    "back Side 0.8mm fabric laminate.",
    "WALLPAPER",
    "1 Wall Paper Wall Paper Start from 150 RS sq ft",
    "TERMS AND CONDITIONS",
    "All Drawer Channels are Hettich & Ebco Regular Close only.",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Dressing Unit", "14", "sq ft", "23100.0", null, null, null, source.split("\n")[1], 0.96],
        ["Wall Paper", null, "sq ft", null, null, null, null, source.split("\n")[4], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "material_ambiguity" &&
        finding.title.includes("Dressing Unit"),
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "brand_ambiguity" &&
        finding.title.includes("Dressing Unit"),
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "hardware_ambiguity" &&
        finding.title.includes("Wall Paper"),
    ),
    false,
  );
});

test("does not claim a mirror is missing material or hardware", async () => {
  const source = [
    "BEDROOM - 01",
    "4 Mirror (Dressing) Providing and fixing of Mirror MODIGUARD Brand Unit 1.00 3000 3000.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Mirror (Dressing)", "1.00", "Unit", "3000.0", null, "MODIGUARD", null, source.split("\n")[1], 0.97],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        (finding.category === "material_ambiguity" ||
          finding.category === "hardware_ambiguity") &&
        finding.title.includes("Mirror"),
    ),
    false,
  );
});

test("does not require separate hardware for accessory products", async () => {
  const source = [
    "ACCESSORIES FOR KITCHEN AND WARDROBES",
    "1 Thali Tray 1 SET Unit 1.00 3000 3000.0",
    "2 BPO 1 SET Unit 1.00 4500 4500.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Thali Tray", "1.00", "Unit", "3000.0", null, null, null, source.split("\n")[1], 0.96],
        ["BPO", "1.00", "Unit", "4500.0", null, null, null, source.split("\n")[2], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "hardware_ambiguity"),
    false,
  );
});

test("uses explicit source terms when normalized document fields are missing", async () => {
  const source = [
    "Quote Date 24/8/2026",
    "Delivery within 5 weeks from the date of confirmation.",
    "10 years warranty",
    "10% advance amount.",
    "60% at the time of construction.",
    "20% at delivery of material.",
    "10% after completion.",
  ].join("\n");
  const extraction = normalizeQuotationResult({ r: true }, source);

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "timeline_risk"),
    false,
  );
  assert.equal(
    findings.some((finding) => finding.category === "warranty_gap"),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "payment_risk" &&
        finding.title === "Payment terms are not stated",
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "contract_risk" &&
        finding.title === "Quotation number is missing",
    ),
    true,
  );
});

test("does not borrow material from the next numbered item", async () => {
  const source = [
    "ACCESSORIES",
    "1 Tandom Box Tandom with gallery Unit 4.00 7000 28000.0",
    "2 Cutlery Tray PVC CUTLERY TRAY Unit 1.00 3000 3000.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Tandom Box", "4.00", "Unit", "28000.0", null, null, null, source.split("\n")[1], 0.96],
        ["Cutlery Tray", "1.00", "Unit", "3000.0", "PVC", null, null, source.split("\n")[2], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "material_ambiguity" &&
        finding.title.includes("Tandom Box"),
    ),
    true,
  );
});

test("does not treat an unpriced Kitchen item row as the next item's section", async () => {
  const source = [
    "1 Kitchen Cabinet Century MR Ply",
    "2 Study Table Unit 1 ₹4000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Study Table", "1", "Unit", "₹4000", null, null, null, source.split("\n")[1], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "material_ambiguity" &&
        finding.title.includes("Study Table"),
    ),
    true,
  );
});

test("does not apply one item's hardware to every item in the document", async () => {
  const source = [
    "BEDROOM - 01",
    "1 Wardrobe Hettich hinges Unit 1 ₹5000",
    "2 Dressing Unit Century MR Ply Unit 1 ₹4000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Wardrobe", "1", "Unit", "₹5000", null, null, null, source.split("\n")[1], 0.96],
        ["Dressing Unit", "1", "Unit", "₹4000", null, null, null, source.split("\n")[2], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "hardware_ambiguity" &&
        finding.title.includes("Wardrobe"),
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "hardware_ambiguity" &&
        finding.title.includes("Dressing Unit"),
    ),
    true,
  );
});

test("describes unmapped global hardware truthfully instead of claiming it is absent", async () => {
  const source = [
    "BEDROOM - 01",
    "1 Dressing Unit Century MR Ply Unit 1 ₹4000",
    "TERMS AND CONDITIONS",
    "All Drawer Channels are Hettich and Ebco Regular Close only.",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Dressing Unit", "1", "Unit", "₹4000", null, null, null, source.split("\n")[1], 0.96],
      ],
    },
    source,
  );

  const hardwareFindings = (await analyzeQuotation(extraction, source)).findings
    .filter((finding) => finding.category === "hardware_ambiguity");

  assert.equal(hardwareFindings.length, 1);
  assert.equal(
    hardwareFindings[0]?.title,
    "Hardware is not mapped to Dressing Unit",
  );
  assert.equal(
    hardwareFindings[0]?.description.includes("general hardware terms"),
    true,
  );
});

test("cites broad general hardware coverage once instead of repeating item warnings", async () => {
  const source = [
    "BEDROOM - 01",
    "1 Wardrobe Unit 1 ₹5000",
    "2 Dressing Unit Unit 1 ₹4000",
    "KITCHEN",
    "3 Kitchen Base Unit Unit 1 ₹6000",
    "TERMS AND CONDITIONS",
    "Channels: Hettich / Ebco regular close only.",
    "Locks: Europa locks.",
    "Hinges: 110 degree hinges.",
    "Handles: handle limits apply.",
    "Accessories included as listed.",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Wardrobe", "1", "Unit", "₹5000", null, null, null, source.split("\n")[1], 0.96],
        ["Dressing Unit", "1", "Unit", "₹4000", null, null, null, source.split("\n")[2], 0.96],
        ["Kitchen Base Unit", "1", "Unit", "₹6000", null, null, null, source.split("\n")[4], 0.96],
      ],
    },
    source,
  );

  const hardwareFindings = (await analyzeQuotation(extraction, source)).findings
    .filter((finding) => finding.category === "hardware_ambiguity");

  assert.equal(hardwareFindings.length, 1);
  assert.equal(
    hardwareFindings[0]?.title,
    "General hardware coverage is not mapped to line items",
  );
  assert.equal(
    hardwareFindings[0]?.evidence.includes("Channels: Hettich / Ebco"),
    true,
  );
  assert.equal(hardwareFindings[0]?.evidence.includes("Locks: Europa locks."), true);
  assert.equal(
    hardwareFindings[0]?.evidence.includes("Hinges: 110 degree hinges."),
    true,
  );
  assert.equal(hardwareFindings[0]?.evidence.includes("Handles: handle limits apply."), true);
  assert.equal(hardwareFindings[0]?.title.includes("Wardrobe"), false);
});

for (const generalClause of [
  "All hardware will be Hettich.",
  "Hardware will be provided by the vendor.",
]) {
  test(`consolidates universal hardware wording: ${generalClause}`, async () => {
    const source = [
      "1 Wardrobe Unit 1 ₹5000",
      "2 Dressing Unit Unit 1 ₹4000",
      "TERMS AND CONDITIONS",
      generalClause,
    ].join("\n");
    const extraction = normalizeQuotationResult(
      {
        r: true,
        items: [
          ["Wardrobe", "1", "Unit", "₹5000", null, null, null, source.split("\n")[0], 0.96],
          ["Dressing Unit", "1", "Unit", "₹4000", null, null, null, source.split("\n")[1], 0.96],
        ],
      },
      source,
    );

    const hardwareFindings = (await analyzeQuotation(extraction, source)).findings
      .filter((finding) => finding.category === "hardware_ambiguity");

    assert.equal(hardwareFindings.length, 1);
    assert.equal(
      hardwareFindings[0]?.title,
      "General hardware coverage is not mapped to line items",
    );
    assert.equal(hardwareFindings[0]?.evidence, generalClause);
  });
}

test("applies Homez-style global material and hardware specifications", async () => {
  const source = [
    "LIVING & DINING",
    "1 Shoe Unit Unit 1 ₹17995",
    "2 False Ceiling- Living & Dining Sqft 356.25 ₹32063",
    "3 G-Profile for kitchen Sqft 1 ₹15000",
    "MATERIAL SPECIFICATIONS",
    "Dry Areas : MR Ply,18mm includes laminate finish; Century Maxima Plywood",
    "Wet Areas : BWP Ply,18mm includes laminate finish; Century Maxima Plywood",
    "Colour Laminate : 1 mm thickness Brand: Century / Airolam / Stylam",
    "Hardware's : Hettich / Ebco",
    "Handles : Selected Standard SS handles are considered for all cabinets",
    "False ceiling : Saint Gobain Gyproc 12.5mm thickness board",
    "Shutters / Expo panel : HDHMR 18 mm",
    "SCOPE OF WORK",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Shoe Unit", "1", "Unit", "₹17995", null, null, null, source.split("\n")[1], 0.96],
        ["False Ceiling- Living & Dining", "356.25", "Sqft", "₹32063", null, null, null, source.split("\n")[2], 0.96],
        ["G-Profile for kitchen", "1", "Sqft", "₹15000", null, null, null, source.split("\n")[3], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "brand_ambiguity" &&
        (finding.title.includes("Shoe Unit") ||
          finding.title.includes("False Ceiling")),
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "material_ambiguity" &&
        (finding.title.includes("Shoe Unit") ||
          finding.title.includes("False Ceiling") ||
          finding.title.includes("G-Profile")),
    ),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "missing_grade" &&
        finding.title.includes("False Ceiling"),
    ),
    false,
  );
  const hardwareFindings = findings.filter(
    (finding) => finding.category === "hardware_ambiguity",
  );
  assert.equal(hardwareFindings.length, 1);
  assert.equal(
    hardwareFindings[0]?.title,
    "General hardware coverage is not mapped to line items",
  );
  assert.equal(
    hardwareFindings[0]?.evidence.includes("Hardware's : Hettich / Ebco"),
    true,
  );
});

test("does not require product specifications for service-only rows", async () => {
  const source = [
    "SERVICES",
    "1 Full Project Cleaning-Upto 2BHK Unit 1 ₹10000",
    "2 Debris Disposal within apartment premises Unit 1 ₹5000",
    "3 Transportation, Packing & Unloading Unit 1 ₹8000",
    "MATERIAL SPECIFICATIONS",
    "Hardware's : Hettich / Ebco",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Full Project Cleaning-Upto 2BHK", "1", "Unit", "₹10000", null, null, null, source.split("\n")[1], 0.96],
        ["Debris Disposal within apartment premises", "1", "Unit", "₹5000", null, null, null, source.split("\n")[2], 0.96],
        ["Transportation, Packing & Unloading", "1", "Unit", "₹8000", null, null, null, source.split("\n")[3], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;
  const irrelevantCategories = new Set([
    "brand_ambiguity",
    "material_ambiguity",
    "hardware_ambiguity",
  ]);

  assert.equal(
    findings.some((finding) => irrelevantCategories.has(finding.category)),
    false,
  );
});

test("recognizes abbreviated room headings when checking duplicates", async () => {
  const source = [
    "MBR",
    "1 Wardrobe Unit 1 ₹5000",
    "2 Loft Sqft 20 ₹4000",
    "GBR",
    "1 Wardrobe Unit 1 ₹6000",
    "2 Loft Sqft 15 ₹3000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Wardrobe", "1", "Unit", "₹5000", null, null, null, source.split("\n")[1], 0.96],
        ["Loft", "20", "Sqft", "₹4000", null, null, null, source.split("\n")[2], 0.96],
        ["Wardrobe", "1", "Unit", "₹6000", null, null, null, source.split("\n")[4], 0.96],
        ["Loft", "15", "Sqft", "₹3000", null, null, null, source.split("\n")[5], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "duplicate"),
    false,
  );
});

test("does not flag same-section descriptions with different quantities as duplicates", async () => {
  const source = [
    "MBR",
    "1 Plain Mirror with Back Panel Sqft 10 ₹8249",
    "2 Plain Mirror with Back Panel Sqft 2.25 ₹1856",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Plain Mirror with Back Panel", "10", "Sqft", "₹8249", "12 mm MR Grade Plywood", "Saint Gobain", null, source.split("\n")[1], 0.96],
        ["Plain Mirror with Back Panel", "2.25", "Sqft", "₹1856", "12 mm MR Grade Plywood", "Saint Gobain", null, source.split("\n")[2], 0.96],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "duplicate"),
    false,
  );
});

test("does not treat the same item in different room sections as a duplicate", async () => {
  const source = [
    "BEDROOM - 01",
    "4 Mirror (Dressing) MODIGUARD Brand Unit 1.00 3000 3000.0",
    "BEDROOM - 02",
    "4 Mirror (Dressing) MODIGUARD Brand Unit 1.00 3000 3000.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Mirror (Dressing)", "1.00", "Unit", "3000.0", "Mirror", "MODIGUARD", null, source.split("\n")[1], 0.97],
        ["Mirror (Dressing)", "1.00", "Unit", "3000.0", "Mirror", "MODIGUARD", null, source.split("\n")[3], 0.97],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "duplicate"),
    false,
  );
});

test("still flags an identical item repeated within the same section", async () => {
  const source = [
    "BEDROOM - 01",
    "1 Bedside Table Unit 1 ₹5000",
    "2 Bedside Table Unit 1 ₹5000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Bedside Table", "1", "Unit", "₹5000", null, null, null, source.split("\n")[1], 0.97],
        ["Bedside Table", "1", "Unit", "₹5000", null, null, null, source.split("\n")[2], 0.97],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.filter((finding) => finding.category === "duplicate").length,
    1,
  );
});

test("recognizes client-at-actuals wording as an explicit exclusion", async () => {
  const source = [
    "TERMS AND CONDITIONS",
    "Cost of civil and electrical charges to be done by the client at Actuals.",
    "This price includes labour cost and transport cost.",
  ].join("\n");
  const extraction = normalizeQuotationResult({ r: true }, source);

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "hidden_exclusion"),
    false,
  );
});

test("does not treat a generic inclusion or bare actuals wording as an exclusion", async () => {
  const source = [
    "TERMS AND CONDITIONS",
    "This price includes labour cost and transport cost.",
    "Additional polishing will be charged at actuals.",
  ].join("\n");
  const extraction = normalizeQuotationResult({ r: true }, source);

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "hidden_exclusion"),
    true,
  );
});

test("does not call priced work unreconcilable when printed section totals match subtotal", async () => {
  const source = [
    "BEDROOM - 01",
    "1 Wardrobe 10 sq ft ₹10000",
    "BEDROOM - 01 TOTAL AMOUNT 10000.0",
    "WALLPAPER",
    "1 Wall Paper Start from 150 RS sq ft",
    "WALLPAPER TOTAL AMOUNT 0.0",
    "TOTAL AMOUNT 10000.0",
    "18% GST 1800.0",
    "AFTER GST TOTAL AMOUNT 11800.0",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      f: {
        subtotalBeforeGst: ["10000.0", "TOTAL AMOUNT 10000.0", 0.99],
        gstAmount: ["1800.0", "18% GST 1800.0", 0.99],
        gstRate: ["18%", "18% GST 1800.0", 0.99],
        grandTotalInclusiveGst: ["11800.0", "AFTER GST TOTAL AMOUNT 11800.0", 0.99],
        totalQuotationValue: ["11800.0", "AFTER GST TOTAL AMOUNT 11800.0", 0.99],
      },
      items: [
        ["Wardrobe", "10", "sq ft", "₹10000", null, null, null, source.split("\n")[1], 0.98],
        ["Wall Paper", null, "sq ft", null, null, null, null, source.split("\n")[4], 0.98],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "price_anomaly"),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "hidden_cost" &&
        finding.title.includes("Wall Paper"),
    ),
    true,
  );
});

test("reconciles currency-spaced totals for broader room headings", async () => {
  const source = [
    "MASTER BEDROOM",
    "1 Wardrobe 10 sq ft ₹10,000",
    "MASTER BEDROOM TOTAL AMOUNT ₹ 10,000",
    "WALLPAPER",
    "1 Wall Paper Start from 150 RS sq ft",
    "WALLPAPER TOTAL AMOUNT ₹ 0",
    "TOTAL AMOUNT ₹ 10,000",
    "18% GST ₹ 1,800",
    "AFTER GST TOTAL AMOUNT ₹ 11,800",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      f: {
        subtotalBeforeGst: ["10,000", "TOTAL AMOUNT ₹ 10,000", 0.99],
        gstAmount: ["1,800", "18% GST ₹ 1,800", 0.99],
        gstRate: ["18%", "18% GST ₹ 1,800", 0.99],
        grandTotalInclusiveGst: ["11,800", "AFTER GST TOTAL AMOUNT ₹ 11,800", 0.99],
        totalQuotationValue: ["11,800", "AFTER GST TOTAL AMOUNT ₹ 11,800", 0.99],
      },
      items: [
        ["Wardrobe", "10", "sq ft", "₹10,000", null, null, null, source.split("\n")[1], 0.98],
        ["Wall Paper", null, "sq ft", null, null, null, null, source.split("\n")[4], 0.98],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "price_anomaly"),
    false,
  );
});

test("reconciles the pre-tax subtotal before later separately added work", async () => {
  const source = [
    "FOYER, LIVING & DINNING AREA",
    "1 TV Unit 1 Unit ₹10,000",
    "FOYER, LIVING & DINNING AREA TOTAL AMOUNT ₹ 10,000",
    "TOTAL AMOUNT ₹ 10,000",
    "AFTER GST TOTAL AMOUNT ₹ 11,800",
    "20% DISCOUNT ₹ 2,360",
    "AFTER DISCOUNT TOTAL AMOUNT ₹ 9,440",
    "ELECTRIC WORK",
    "1 Electric Work APPORX Unit",
    "ELECTRIC WORK TOTAL AMOUNT ₹ 1,000",
    "FINAL TOTAL AMOUNT ₹ 10,440",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      f: {
        subtotalBeforeGst: ["10,000", "TOTAL AMOUNT ₹ 10,000", 0.99],
        grandTotalInclusiveGst: ["10,440", "FINAL TOTAL AMOUNT ₹ 10,440", 0.99],
        totalQuotationValue: ["10,440", "FINAL TOTAL AMOUNT ₹ 10,440", 0.99],
      },
      items: [
        ["TV Unit", "1", "Unit", "₹10,000", null, null, null, source.split("\n")[1], 0.98],
        ["Electric Work", null, "Unit", null, null, null, null, source.split("\n")[8], 0.98],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some((finding) => finding.category === "price_anomaly"),
    false,
  );
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "hidden_cost" &&
        finding.title.includes("Electric Work"),
    ),
    false,
  );
});

test("flags a sole line item that contradicts its section total", async () => {
  const source = [
    "FALSE CEILING",
    "1 Full House False Ceiling APPORX sq ft 0.00 0.0",
    "FALSE CEILING TOTAL AMOUNT ₹ 100,000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      items: [
        ["Full House False Ceiling", "0.00", "sq ft", "0.0", null, null, null, source.split("\n")[1], 0.98],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;

  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "math_error" &&
        finding.title.includes("False Ceiling"),
    ),
    true,
  );
});

const paymentScheduleSource = [
  "PAYMENT SCHEDULE",
  "On order confirmation 50% ₹5,31,000 60 working days from receipt of material advance,",
  "On material delivery 40% ₹4,24,800 subject to site readiness.",
  "On completion 10% ₹1,06,200",
  "PROJECT TIMELINE",
].join("\n");

function rawWithPaymentTerms(value: string, evidence: string) {
  return {
    r: true,
    f: {
      paymentTerms: [value, evidence, 0.98],
    },
  } satisfies Record<string, unknown>;
}

test("keeps a raw multi-fragment warranty when every fragment is source-grounded", () => {
  const raw = rawWithWarranty(
    "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 1 year",
    "Carpentry & Woodwork: 5 years",
  );

  const normalized = normalizeQuotationResult(raw, warrantySource);

  assert.equal(
    normalized.warranty.value,
    "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 1 year",
  );
  assert.equal(normalized.warranty.evidence, "Carpentry & Woodwork: 5 years");
  assert.equal(normalized.warranty.confidence, 0.98);
});

test("rejects a multi-fragment warranty when any value fragment is unsupported", () => {
  const raw = rawWithWarranty(
    "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 2 years",
    "Carpentry & Woodwork: 5 years",
  );

  const normalized = normalizeQuotationResult(raw, warrantySource);

  assert.deepEqual(normalized.warranty, {
    value: null,
    confidence: 0,
    evidence: null,
  });
});

test("does not report a warranty gap for the normalized multi-fragment warranty", async () => {
  const extraction = normalizeQuotationResult(
    rawWithWarranty(
      "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 1 year",
      "Carpentry & Woodwork: 5 years",
    ),
    warrantySource,
  );

  const analysis = await analyzeQuotation(extraction, warrantySource);

  assert.equal(
    analysis.findings.some((finding) => finding.category === "warranty_gap"),
    false,
  );
});

test("reports a warranty gap when a partially grounded combined value is rejected", async () => {
  const extraction = normalizeQuotationResult(
    rawWithWarranty(
      "Carpentry & Woodwork: 5 years; Hardware (hinges, channels, fittings): 2 years",
      "Carpentry & Woodwork: 5 years",
    ),
    warrantySource,
  );

  const analysis = await analyzeQuotation(extraction, warrantySource);

  assert.equal(
    analysis.findings.some((finding) => finding.category === "warranty_gap"),
    true,
  );
});

test("keeps a payment schedule assembled from separately located rows", () => {
  const raw = rawWithPaymentTerms(
    "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 10% ₹1,06,200",
    "On order confirmation 50% ₹5,31,000",
  );

  const normalized = normalizeQuotationResult(raw, paymentScheduleSource);

  assert.equal(
    normalized.paymentTerms.value,
    "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 10% ₹1,06,200",
  );
  assert.equal(
    normalized.paymentTerms.evidence,
    "On order confirmation 50% ₹5,31,000",
  );
  assert.equal(normalized.paymentTerms.confidence, 0.98);
});

test("retains every grounded payment schedule with its source clause", () => {
  const source = [
    "PAYMENT PROCEDURE",
    "10% on order confirmation",
    "60% after design approval",
    "20% before installation",
    "5% on installation",
    "5% after handover",
    "TERMS AND CONDITIONS",
    "10% on order confirmation",
    "60% after design approval",
    "20% before installation",
    "Final 10% on handover",
  ].join("\n");
  const normalized = normalizeQuotationResult(
    {
      r: true,
      f: {
        paymentTerms: [
          "10% on order confirmation; 60% after design approval; 20% before installation; 5% on installation; 5% after handover",
          "10% on order confirmation",
          0.98,
        ],
      },
      paymentSchedules: [
        [
          "10% on order confirmation; 60% after design approval; 20% before installation; 5% on installation; 5% after handover",
          "10% on order confirmation",
          0.98,
        ],
        [
          "10% on order confirmation; 60% after design approval; 20% before installation; Final 10% on handover",
          "10% on order confirmation",
          0.98,
        ],
      ],
    },
    source,
  );

  assert.equal(normalized.paymentSchedules.length, 2);
  assert.equal(
    normalized.paymentSchedules[0]?.value,
    "10% on order confirmation; 60% after design approval; 20% before installation; 5% on installation; 5% after handover",
  );
  assert.equal(
    normalized.paymentSchedules[1]?.value,
    "10% on order confirmation; 60% after design approval; 20% before installation; Final 10% on handover",
  );
  assert.equal(
    normalized.paymentSchedules[0]?.evidence,
    "10% on order confirmation",
  );
  assert.equal(normalized.paymentSchedules[1]?.evidence, "10% on order confirmation");
});

test("flags conflicting complete schedules even when both total 100%", async () => {
  const source = [
    "PAYMENT PROCEDURE",
    "10% on order confirmation",
    "60% after design approval",
    "20% before installation",
    "5% on installation",
    "5% after handover",
    "TERMS AND CONDITIONS",
    "10% on order confirmation",
    "60% after design approval",
    "20% before installation",
    "Final 10% on handover",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      f: {
        paymentTerms: [
          "10% on order confirmation; 60% after design approval; 20% before installation; 5% on installation; 5% after handover",
          "10% on order confirmation",
          0.98,
        ],
      },
      paymentSchedules: [
        [
          "10% on order confirmation; 60% after design approval; 20% before installation; 5% on installation; 5% after handover",
          "10% on order confirmation",
          0.98,
        ],
        [
          "10% on order confirmation; 60% after design approval; 20% before installation; Final 10% on handover",
          "10% on order confirmation",
          0.98,
        ],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;
  const conflict = findings.find(
    (finding) =>
      finding.category === "payment_risk" &&
      finding.title === "Conflicting payment schedules",
  );

  assert.ok(conflict);
  assert.match(conflict.description, /different milestone timing or wording/);
  assert.match(conflict.evidence, /5% on installation/);
  assert.match(conflict.evidence, /Final 10% on handover/);
  assert.equal(
    findings.filter(
      (finding) =>
        finding.category === "payment_risk" &&
        finding.title === "60% payment is due before project completion",
    ).length,
    1,
  );
});

test("flags conflicting amount-only schedules that both reconcile to the quote", async () => {
  const source = [
    "PAYMENT PROCEDURE",
    "On order confirmation ₹1,00,000",
    "Before installation ₹6,00,000",
    "On installation ₹2,00,000",
    "On handover ₹1,00,000",
    "TERMS AND CONDITIONS",
    "On order confirmation ₹1,00,000",
    "Before installation ₹6,00,000",
    "On installation ₹2,00,000",
    "Before final handover ₹50,000",
    "After final handover ₹50,000",
    "GRAND TOTAL (Inclusive of GST) ₹10,00,000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      r: true,
      f: {
        paymentTerms: [
          "On order confirmation ₹1,00,000; Before installation ₹6,00,000; On installation ₹2,00,000; On handover ₹1,00,000",
          "On order confirmation ₹1,00,000",
          0.98,
        ],
        grandTotalInclusiveGst: [
          "₹10,00,000",
          "GRAND TOTAL (Inclusive of GST) ₹10,00,000",
          0.98,
        ],
      },
      paymentSchedules: [
        [
          "On order confirmation ₹1,00,000; Before installation ₹6,00,000; On installation ₹2,00,000; On handover ₹1,00,000",
          "On order confirmation ₹1,00,000",
          0.98,
        ],
        [
          "On order confirmation ₹1,00,000; Before installation ₹6,00,000; On installation ₹2,00,000; Before final handover ₹50,000; After final handover ₹50,000",
          "On order confirmation ₹1,00,000",
          0.98,
        ],
      ],
    },
    source,
  );

  const findings = (await analyzeQuotation(extraction, source)).findings;
  const conflict = findings.find(
    (finding) =>
      finding.category === "payment_risk" &&
      finding.title === "Conflicting payment schedules",
  );

  assert.ok(conflict);
  assert.match(conflict.evidence, /On handover ₹1,00,000/);
  assert.match(conflict.evidence, /Before final handover ₹50,000/);
  assert.match(conflict.evidence, /After final handover ₹50,000/);
  assert.equal(
    findings.some(
      (finding) =>
        finding.category === "payment_risk" &&
        finding.title === "Payment milestone amounts do not match the quoted total",
    ),
    false,
  );
});

test("rejects an unsupported payment milestone before quote intelligence runs", async () => {
  const extraction = normalizeQuotationResult(
    rawWithPaymentTerms(
      "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On final handover 10% ₹1,06,200",
      "On order confirmation 50% ₹5,31,000",
    ),
    paymentScheduleSource,
  );

  assert.deepEqual(extraction.paymentTerms, {
    value: null,
    confidence: 0,
    evidence: null,
  });

  const analysis = await analyzeQuotation(extraction, paymentScheduleSource);

  assert.equal(
    analysis.findings.some((finding) => finding.category === "payment_risk"),
    true,
  );
});

test("reports medium payment risk for a complete schedule with a 50% pre-completion milestone", async () => {
  const extraction = normalizeQuotationResult(
    rawWithPaymentTerms(
      "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 10% ₹1,06,200",
      "On order confirmation 50% ₹5,31,000",
    ),
    paymentScheduleSource,
  );

  const analysis = await analyzeQuotation(extraction, paymentScheduleSource);
  const paymentRisks = analysis.findings.filter(
    (finding) => finding.category === "payment_risk",
  );

  assert.equal(paymentRisks.length, 1);
  assert.equal(paymentRisks[0].severity, "MEDIUM");
  assert.match(paymentRisks[0].title, /50% payment is due before project completion/);
  assert.equal(paymentRisks[0].evidence, "On order confirmation 50% ₹5,31,000");
});

test("reports high payment risk at 70% and 90% without relying on advance wording", async () => {
  for (const percentage of [70, 90]) {
    const remainder = 100 - percentage;
    const value = `Upon quotation acceptance ${percentage}%; Upon completion of work ${remainder}%`;
    const source = `PAYMENT SCHEDULE\n${value.replace("; ", "\n")}`;
    const extraction = normalizeQuotationResult(
      rawWithPaymentTerms(value, `Upon quotation acceptance ${percentage}%`),
      source,
    );

    const paymentRisks = (await analyzeQuotation(extraction, source)).findings.filter(
      (finding) => finding.category === "payment_risk",
    );

    assert.equal(paymentRisks.length, 1);
    assert.equal(paymentRisks[0].severity, "HIGH");
    assert.match(paymentRisks[0].title, new RegExp(`^${percentage}% payment`));
    assert.equal(paymentRisks[0].evidence, `Upon quotation acceptance ${percentage}%`);
  }
});

test("cites the qualifying intermediate milestone instead of the first payment row", async () => {
  const value =
    "On order confirmation 10%; On material delivery 70%; Upon completion of work 20%";
  const source = `PAYMENT SCHEDULE\n${value.replaceAll("; ", "\n")}`;
  const extraction = normalizeQuotationResult(
    rawWithPaymentTerms(value, "On order confirmation 10%"),
    source,
  );

  const paymentRisks = (await analyzeQuotation(extraction, source)).findings.filter(
    (finding) => finding.category === "payment_risk",
  );

  assert.equal(paymentRisks.length, 1);
  assert.equal(paymentRisks[0].severity, "HIGH");
  assert.equal(paymentRisks[0].evidence, "On material delivery 70%");
});

test("does not flag a large final milestone or a pre-completion milestone below 50%", async () => {
  for (const value of [
    "On order confirmation 10%; Upon completion of work 90%",
    "On order confirmation 49%; On material delivery 41%; Upon completion of work 10%",
  ]) {
    const fragments = value.split("; ");
    const source = `PAYMENT SCHEDULE\n${fragments.join("\n")}`;
    const extraction = normalizeQuotationResult(
      rawWithPaymentTerms(value, fragments[0]),
      source,
    );

    const paymentRisks = (await analyzeQuotation(extraction, source)).findings.filter(
      (finding) => finding.category === "payment_risk",
    );

    assert.equal(paymentRisks.length, 0);
  }
});

test("parses only complete explicit payment milestones", () => {
  assert.deepEqual(
    parsePaymentMilestonePercentages(
      "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 10% ₹1,06,200",
    ),
    [50, 40, 10],
  );
  assert.deepEqual(
    parsePaymentMilestonePercentages(
      "On order confirmation 50%; Balance on completion",
    ),
    null,
  );
  assert.deepEqual(
    parsePaymentMilestonePercentages(
      "On order confirmation 50%; On completion 40%; Total 90%",
    ),
    [50, 40],
  );
});

test("parses only complete unambiguous payment milestone amounts", () => {
  assert.deepEqual(
    parsePaymentMilestoneAmounts(
      "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; On completion ₹1,06,200; Payment Schedule Total ₹10,62,000",
    ),
    [531000, 424800, 106200],
  );
  assert.deepEqual(
    parsePaymentMilestoneAmounts(
      "On order confirmation ₹5,31,000; Balance on completion",
    ),
    null,
  );
  assert.deepEqual(
    parsePaymentMilestoneAmounts(
      "On order confirmation ₹5,31,000 plus GST ₹95,580; On completion ₹5,31,000",
    ),
    null,
  );
});

test("reports a payment risk when grounded milestone percentages do not total 100%", async () => {
  const source = paymentScheduleSource.replace(
    "On completion 10% ₹1,06,200",
    "On completion 5% ₹53,100",
  );
  const extraction = normalizeQuotationResult(
    rawWithPaymentTerms(
      "On order confirmation 50% ₹5,31,000; On material delivery 40% ₹4,24,800; On completion 5% ₹53,100",
      "On order confirmation 50% ₹5,31,000",
    ),
    source,
  );

  const paymentRisks = (await analyzeQuotation(extraction, source)).findings.filter(
    (finding) => finding.category === "payment_risk",
  );

  assert.equal(paymentRisks.length, 1);
  assert.match(paymentRisks[0].title, /total 95% instead of 100%/);
  assert.match(paymentRisks[0].description, /does not reconcile/);
  assert.doesNotMatch(paymentRisks[0].title, /payment is due before project completion/);
});

test("reports a payment risk when grounded milestone amounts do not match the quoted total", async () => {
  const source = [
    "PAYMENT SCHEDULE",
    "On order confirmation ₹5,31,000",
    "On material delivery ₹4,24,800",
    "On completion ₹1,06,200",
    "GRAND TOTAL (Inclusive of GST) ₹11,00,000",
    "PROJECT TIMELINE",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      ...rawWithPaymentTerms(
        "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; On completion ₹1,06,200",
        "On order confirmation ₹5,31,000",
      ),
      f: {
        paymentTerms: [
          "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; On completion ₹1,06,200",
          "On order confirmation ₹5,31,000",
          0.98,
        ],
        grandTotalInclusiveGst: [
          "₹11,00,000",
          "GRAND TOTAL (Inclusive of GST) ₹11,00,000",
          0.98,
        ],
        totalQuotationValue: [
          "₹11,00,000",
          "GRAND TOTAL (Inclusive of GST) ₹11,00,000",
          0.98,
        ],
      },
    },
    source,
  );

  const paymentRisks = (await analyzeQuotation(extraction, source)).findings.filter(
    (finding) => finding.category === "payment_risk",
  );

  assert.equal(paymentRisks.length, 1);
  assert.equal(paymentRisks[0].title, "Payment milestone amounts do not match the quoted total");
  assert.match(paymentRisks[0].description, /₹10,62,000/);
  assert.match(paymentRisks[0].description, /₹11,00,000/);
});

test("does not count a printed schedule-total row as another milestone", async () => {
  const source = [
    "PAYMENT SCHEDULE",
    "On order confirmation ₹5,31,000",
    "On material delivery ₹4,24,800",
    "On completion ₹1,06,200",
    "Schedule Total ₹10,62,000",
    "GRAND TOTAL (Inclusive of GST) ₹10,62,000",
    "PROJECT TIMELINE",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      f: {
        paymentTerms: [
          "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; On completion ₹1,06,200; Schedule Total ₹10,62,000",
          "On order confirmation ₹5,31,000",
          0.98,
        ],
        grandTotalInclusiveGst: [
          "₹10,62,000",
          "GRAND TOTAL (Inclusive of GST) ₹10,62,000",
          0.98,
        ],
      },
    },
    source,
  );

  const analysis = await analyzeQuotation(extraction, source);

  assert.equal(
    analysis.findings.some(
      (finding) =>
        finding.category === "payment_risk" &&
        finding.title === "Payment milestone amounts do not match the quoted total",
    ),
    false,
  );
});

test("does not guess an incomplete payment milestone amount", async () => {
  const source = [
    "PAYMENT SCHEDULE",
    "On order confirmation ₹5,31,000",
    "On material delivery ₹4,24,800",
    "Balance on completion",
    "GRAND TOTAL (Inclusive of GST) ₹11,00,000",
    "PROJECT TIMELINE",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    {
      ...rawWithPaymentTerms(
        "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; Balance on completion",
        "On order confirmation ₹5,31,000",
      ),
      f: {
        paymentTerms: [
          "On order confirmation ₹5,31,000; On material delivery ₹4,24,800; Balance on completion",
          "On order confirmation ₹5,31,000",
          0.98,
        ],
        grandTotalInclusiveGst: [
          "₹11,00,000",
          "GRAND TOTAL (Inclusive of GST) ₹11,00,000",
          0.98,
        ],
      },
    },
    source,
  );

  const analysis = await analyzeQuotation(extraction, source);

  assert.equal(
    analysis.findings.some(
      (finding) =>
        finding.category === "payment_risk" &&
        finding.title === "Payment milestone amounts do not match the quoted total",
    ),
    false,
  );
});

test("does not guess a missing milestone percentage", async () => {
  const source = [
    "PAYMENT SCHEDULE",
    "On order confirmation 50% ₹5,31,000",
    "On material delivery 40% ₹4,24,800",
    "Balance on completion ₹1,06,200",
    "PROJECT TIMELINE",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    rawWithPaymentTerms(
      "On order confirmation 50%; On material delivery 40%; Balance on completion ₹1,06,200",
      "On order confirmation 50%",
    ),
    source,
  );

  const analysis = await analyzeQuotation(extraction, source);

  assert.equal(
    analysis.findings.some(
      (finding) =>
        finding.category === "payment_risk" &&
        /milestones total/.test(finding.title),
    ),
    false,
  );
});

test("does not report a math error for a complete set of priced rows", async () => {
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Lump Sum", null, null, "₹10,000"],
        ["Wardrobe", "2", "sqft", "₹40,000"],
      ],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    arithmeticSource,
  );

  assert.deepEqual(await mathCategories(extraction, arithmeticSource), []);
});

test("does not treat an omitted priced row as a confirmed math error", async () => {
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [["Kitchen Lump Sum", null, null, "₹10,000"]],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    arithmeticSource,
  );

  assert.deepEqual(await mathCategories(extraction, arithmeticSource), []);
});

test("does not treat a duplicated row plus an omitted row as complete extraction", async () => {
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Lump Sum", null, null, "₹10,000", "1 Kitchen Lump Sum"],
        ["Kitchen Lump Sum", null, null, "₹10,000", "1 Kitchen Lump Sum"],
      ],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    arithmeticSource,
  );

  assert.deepEqual(await mathCategories(extraction, arithmeticSource), []);
});

test("does not treat repeated extraction of one priced row as complete", async () => {
  const source = [
    "1 Kitchen Lump Sum ₹10,000",
    "Grand Subtotal ₹10,000",
    "GST @ 18% ₹1,800",
    "GRAND TOTAL (Inclusive of GST) ₹11,800",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Lump Sum", null, null, "₹10,000", "1 Kitchen Lump Sum"],
        ["Kitchen Lump Sum", null, null, "₹10,000", "1 Kitchen Lump Sum"],
      ],
      "₹10,000",
      "₹1,800",
      "₹11,800",
    ),
    source,
  );

  assert.deepEqual(await mathCategories(extraction, source), []);
});

test("does not treat a numbered subset as complete when a priced row is unnumbered", async () => {
  const source = arithmeticSource.replace(
    "2 Wardrobe 2 sqft ₹20,000 ₹40,000",
    "Wardrobe 2 sqft ₹20,000 ₹40,000",
  );
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [["Kitchen Lump Sum", null, null, "₹10,000"]],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    source,
  );

  assert.deepEqual(await mathCategories(extraction, source), []);
});

test("does not ignore an omitted priced row whose description contains total", async () => {
  const source = arithmeticSource.replace(
    "2 Wardrobe 2 sqft ₹20,000 ₹40,000",
    "2 Total Home Makeover Package ₹40,000",
  );
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [["Kitchen Lump Sum", null, null, "₹10,000"]],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    source,
  );

  assert.deepEqual(await mathCategories(extraction, source), []);
});

test("keeps four lump-sum findings when other priced rows were omitted", async () => {
  const source = [
    "1 Kitchen Complete Setup Lump Sum ₹2,45,000",
    "2 Living Room Complete Setup Lump Sum ₹1,85,000",
    "3 Electrical Work Full Apartment Lump Sum ₹95,000",
    "4 Painting Full Apartment Lump Sum ₹78,000",
    "5 Master Bedroom Itemized Work ₹1,79,000",
    "6 Children Bedroom Itemized Work ₹1,18,000",
    "Grand Subtotal ₹9,00,000",
    "GST @ 18% ₹1,62,000",
    "GRAND TOTAL (Inclusive of GST) ₹10,62,000",
  ].join("\n");
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Complete Setup Lump Sum", null, null, "₹2,45,000"],
        ["Living Room Complete Setup Lump Sum", null, null, "₹1,85,000"],
        ["Electrical Work Full Apartment Lump Sum", null, null, "₹95,000"],
        ["Painting Full Apartment Lump Sum", null, null, "₹78,000"],
      ],
      "₹9,00,000",
      "₹1,62,000",
      "₹10,62,000",
    ),
    source,
  );
  const analysis = await analyzeQuotation(extraction, source);

  assert.equal(
    analysis.findings.filter((finding) => finding.category === "lump_sum").length,
    4,
  );
  assert.equal(
    analysis.findings.some((finding) => finding.category === "math_error"),
    false,
  );
});

test("reports a math error when complete item amounts contradict the subtotal", async () => {
  const source = arithmeticSource.replace("₹40,000", "₹45,000");
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Lump Sum", null, null, "₹10,000"],
        ["Wardrobe", "2", "sqft", "₹45,000"],
      ],
      "₹50,000",
      "₹9,000",
      "₹59,000",
    ),
    source,
  );

  assert.match(
    (await mathCategories(extraction, source)).join("\n"),
    /Item totals do not match the quoted subtotal/,
  );
});

test("reports a math error when printed GST contradicts the quoted total", async () => {
  const source = arithmeticSource.replace("GST @ 18% ₹9,000", "GST @ 18% ₹10,000");
  const extraction = normalizeQuotationResult(
    arithmeticRaw(
      [
        ["Kitchen Lump Sum", null, null, "₹10,000"],
        ["Wardrobe", "2", "sqft", "₹40,000"],
      ],
      "₹50,000",
      "₹10,000",
      "₹59,000",
    ),
    source,
  );

  assert.match(
    (await mathCategories(extraction, source)).join("\n"),
    /Subtotal and GST do not match the quoted total/,
  );
});