/**
 * A fictional, text-based PDF that goes through the same upload and extraction
 * path as a visitor's own quotation. Keep it ASCII so PDF text extraction works.
 */
export function createSampleQuote(): File {
  const lines = [
    "SAMPLE QUOTATION - FICTIONAL DEMO DOCUMENT",
    "All names, prices and project details below are invented for testing.",
    "",
    "Maple & Stone Interiors (fictional vendor)",
    "Quote no: DEMO-2026-001    Date: 15 September 2026",
    "Project: Apartment interior renovation, Bengaluru",
    "",
    "ITEM  DESCRIPTION                            QTY     RATE (INR)     AMOUNT (INR)",
    "1     Modular kitchen cabinetry             100 sqft     2,500          250,000",
    "2     Bedroom wardrobe                       80 sqft     2,000          160,000",
    "3     Living room false ceiling              200 sqft       300           60,000",
    "4     Wall painting                          300 sqft       100           30,000",
    "",
    "Subtotal before GST: INR 500,000",
    "GST at 18%: INR 90,000",
    "Grand total including GST: INR 590,000",
    "",
    "Payment terms: 80% advance on acceptance; 20% at handover.",
    "Estimated timeline: 12 weeks after advance payment.",
    "Material brand, board grade and hardware model: to be finalized later.",
    "Warranty terms: not specified.",
    "",
    "DEMO ONLY - not a real vendor offer or a price benchmark.",
  ];

  const escape = (text: string) => text.replace(/[\\()]/g, "\\$&");
  const content = [
    "BT",
    "/F1 10 Tf",
    "40 790 Td",
    "13 TL",
    ...lines.flatMap((line, index) => [
      ...(index === 0 ? [] : ["T*"]),
      `(${escape(line)}) Tj`,
    ]),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new File([pdf], "InteriorLens-Synthetic-Sample-Quote.pdf", {
    type: "application/pdf",
  });
}