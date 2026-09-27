export type AnalysisStatus =
  | "draft"
  | "processing"
  | "quote-ready"
  | "vendor-matching"
  | "complete";

export type Analysis = {
  id: string;
  name: string;
  room: string;
  status: AnalysisStatus;
  createdAt: string;
  progress: number;
  address?: string | null;
  fileName?: string | null;
  sourceAnalysisId: string | null;
  replacementAnalysisId: string | null;
};

export type Quote = {
  id: string;
  analysisId: string;
  vendorName: string;
  category: string;
  amount: number;
  status: string;
  note: string;
  evidence: EvidenceRecord[];
};

export type EvidenceVerificationStatus =
  | "VERIFIED"
  | "CROSS_VERIFIED"
  | "PUBLICLY_FOUND"
  | "PARTIALLY_VERIFIED"
  | "UNVERIFIED"
  | "CONFLICT"
  | "NOT_AVAILABLE"
  | "USER_VERIFICATION_REQUIRED";

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
};

export type Vendor = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  rating: number;
  verified: boolean;
  responseTime: string;
  evidence: EvidenceRecord[];
};

export type Insight = {
  id: string;
  title: string;
  category: string;
  severity: string;
  detail: string;
  evidence: string;
  evidenceRecords: EvidenceRecord[];
  estimate?: number | null;
};