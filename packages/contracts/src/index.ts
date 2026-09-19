export type Identifier = string;

export type EvidenceRef = {
  factId: Identifier;
  note?: string;
};

export type CandidateFact = {
  id: Identifier;
  kind: "education" | "experience" | "project" | "skill" | "credential" | "preference";
  title: string;
  details: string[];
  verifiedAt: string;
};

export type CandidateProfile = {
  id: Identifier;
  displayName: string;
  facts: CandidateFact[];
  updatedAt: string;
};

export type JobRequirement = {
  id: Identifier;
  category: "education" | "graduation" | "location" | "experience" | "skill" | "other";
  text: string;
  required: boolean;
};

export type JobPosting = {
  id: Identifier;
  sourceUrl: string;
  sourcePlatform: string;
  company: string;
  title: string;
  location?: string;
  description: string;
  requirements: JobRequirement[];
  capturedAt: string;
};

export type MatchAssessment = {
  jobId: Identifier;
  profileId: Identifier;
  score: number;
  hardRequirementsMet: boolean;
  strengths: string[];
  gaps: string[];
  warnings: string[];
  evidence: EvidenceRef[];
};

export type ResumeBullet = {
  text: string;
  evidence: EvidenceRef[];
  requiresReview: boolean;
};

export type ResumeVariant = {
  id: Identifier;
  jobId: Identifier;
  profileId: Identifier;
  summary: ResumeBullet[];
  experience: ResumeBullet[];
  projects: ResumeBullet[];
  createdAt: string;
};

export type ApplicationStatus =
  | "discovered"
  | "shortlisted"
  | "prepared"
  | "submitted"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export type ApplicationRecord = {
  id: Identifier;
  jobId: Identifier;
  resumeVariantId?: Identifier;
  status: ApplicationStatus;
  submittedAt?: string;
  updatedAt: string;
};
