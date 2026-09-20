const STRING = { type: "string" };
const STRING_ARRAY = { type: "array", items: STRING };

export const RESUME_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    personal: {
      type: "object", additionalProperties: false,
      properties: { fullName: STRING, email: STRING, phone: STRING, city: STRING, github: STRING, website: STRING },
      required: ["fullName", "email", "phone", "city", "github", "website"],
    },
    education: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { school: STRING, degree: STRING, major: STRING, gpa: STRING, startDate: STRING, graduationDate: STRING },
        required: ["school", "degree", "major", "gpa", "startDate", "graduationDate"],
      },
    },
    experiences: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { title: STRING, organization: STRING, startDate: STRING, endDate: STRING, summary: STRING, highlights: STRING_ARRAY, keywords: STRING_ARRAY },
        required: ["title", "organization", "startDate", "endDate", "summary", "highlights", "keywords"],
      },
    },
    projects: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { title: STRING, organization: STRING, startDate: STRING, endDate: STRING, summary: STRING, highlights: STRING_ARRAY, keywords: STRING_ARRAY },
        required: ["title", "organization", "startDate", "endDate", "summary", "highlights", "keywords"],
      },
    },
    skills: STRING_ARRAY,
    qualifications: {
      type: "object", additionalProperties: false,
      properties: { politicalStatus: STRING, certificates: STRING_ARRAY, languages: STRING_ARRAY },
      required: ["politicalStatus", "certificates", "languages"],
    },
    preferences: {
      type: "object", additionalProperties: false,
      properties: {
        roles: STRING_ARRAY, locations: STRING_ARRAY, industries: STRING_ARRAY, companyTypes: STRING_ARRAY,
        requiredKeywords: STRING_ARRAY, excludedKeywords: STRING_ARRAY, graduationYear: STRING,
      },
      required: ["roles", "locations", "industries", "companyTypes", "requiredKeywords", "excludedKeywords", "graduationYear"],
    },
  },
  required: ["personal", "education", "experiences", "projects", "skills", "qualifications", "preferences"],
};

export const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: STRING,
    recommendation: { type: "string", enum: ["apply", "conditional", "skip"] },
    hardRequirements: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          requirement: STRING,
          status: { type: "string", enum: ["met", "not_met", "unknown"] },
          candidateEvidence: STRING,
          jobEvidence: STRING,
        },
        required: ["requirement", "status", "candidateEvidence", "jobEvidence"],
      },
    },
    strengths: STRING_ARRAY,
    gaps: STRING_ARRAY,
    warnings: STRING_ARRAY,
  },
  required: ["score", "summary", "recommendation", "hardRequirements", "strengths", "gaps", "warnings"],
};

export const APPLICATION_PACKAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: STRING,
    experiences: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { sourceId: STRING, bullets: STRING_ARRAY, rationale: STRING },
        required: ["sourceId", "bullets", "rationale"],
      },
    },
    projects: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { sourceId: STRING, bullets: STRING_ARRAY, rationale: STRING },
        required: ["sourceId", "bullets", "rationale"],
      },
    },
    missingQuestions: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { subject: STRING, question: STRING, reason: STRING },
        required: ["subject", "question", "reason"],
      },
    },
    openQuestionDrafts: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { question: STRING, answer: STRING, evidenceSourceIds: STRING_ARRAY },
        required: ["question", "answer", "evidenceSourceIds"],
      },
    },
    warnings: STRING_ARRAY,
  },
  required: ["summary", "experiences", "projects", "missingQuestions", "openQuestionDrafts", "warnings"],
};

function text(value, limit = 8_000) {
  return String(value ?? "").trim().slice(0, limit);
}

function strings(values, limit = 20) {
  return Array.isArray(values) ? values.slice(0, limit).map((value) => text(value, 1_000)).filter(Boolean) : [];
}

function stories(values) {
  return Array.isArray(values) ? values.slice(0, 20).map((item) => ({
    id: text(item.id, 200), title: text(item.title, 300), organization: text(item.organization, 300), startDate: text(item.startDate, 30), endDate: text(item.endDate, 30),
    summary: text(item.summary, 2_000), highlights: strings(item.highlights, 12), keywords: strings(item.keywords, 20),
  })) : [];
}

export function sanitizeProfileForModel(profile = {}) {
  return {
    education: Array.isArray(profile.education) ? profile.education.slice(0, 10).map((item) => ({
      school: text(item.school, 300), degree: text(item.degree, 100), major: text(item.major, 200), gpa: text(item.gpa, 100),
      startDate: text(item.startDate, 30), graduationDate: text(item.graduationDate, 30),
    })) : [],
    experiences: stories(profile.experiences),
    projects: stories(profile.projects),
    skills: strings(profile.skills, 80),
    qualifications: {
      politicalStatus: text(profile.qualifications?.politicalStatus, 100),
      certificates: strings(profile.qualifications?.certificates, 30),
      languages: strings(profile.qualifications?.languages, 30),
    },
    preferences: {
      roles: strings(profile.preferences?.roles, 30), locations: strings(profile.preferences?.locations, 30),
      industries: strings(profile.preferences?.industries, 30), companyTypes: strings(profile.preferences?.companyTypes, 30),
      requiredKeywords: strings(profile.preferences?.requiredKeywords, 30), excludedKeywords: strings(profile.preferences?.excludedKeywords, 30),
      graduationYear: text(profile.preferences?.graduationYear, 10), experienceYears: Number(profile.preferences?.experienceYears) || 0,
    },
  };
}

export function sanitizeJobForModel(job = {}) {
  return {
    title: text(job.title, 300), company: text(job.company, 300), location: text(job.location, 300),
    description: text(job.description, 30_000), publishedAt: text(job.publishedAt, 30), sourceUrl: text(job.sourceUrl, 2_000),
  };
}

export async function structureResumeWithAi({ resumeText, model }) {
  const value = text(resumeText, 80_000);
  if (value.length < 30) throw Object.assign(new Error("简历文字过短，无法结构化"), { statusCode: 400 });
  const result = await model.generateStructured({
    schemaName: "resume_profile",
    schema: RESUME_PROFILE_SCHEMA,
    instructions: "你是严格的中文简历信息抽取器。只提取输入中明确存在的事实，不推测、不美化、不补全。未知字符串填空字符串，未知数组填空数组。日期尽量规范为YYYY-MM，但不得猜测。",
    input: `请把以下简历转换为结构化资料。\n\n${value}`,
  });
  return { profile: result.data, responseId: result.responseId, usage: result.usage };
}

export async function analyzeSemanticMatch({ profile, job, model }) {
  const safeProfile = sanitizeProfileForModel(profile);
  const safeJob = sanitizeJobForModel(job);
  if (!safeJob.title || !safeJob.description) throw Object.assign(new Error("岗位名称和岗位描述不能为空"), { statusCode: 400 });
  const result = await model.generateStructured({
    schemaName: "job_match_assessment",
    schema: MATCH_SCHEMA,
    instructions: "你是谨慎的中国校招岗位匹配分析器。只能依据候选人资料和岗位原文。逐项识别届别、学历、专业、工作经验、证书、政治面貌、语言、地点等硬条件；没有证据必须标为unknown，不能把优先条件误判为强制条件，不能虚构候选人信息。分数不是录取概率。",
    input: JSON.stringify({ candidate: safeProfile, job: safeJob }),
  });
  return { assessment: result.data, disclosedFields: Object.keys(safeProfile), responseId: result.responseId, usage: result.usage };
}

export async function createAiApplicationPackage({ profile, job, supplementalAnswers = [], model }) {
  const safeProfile = sanitizeProfileForModel(profile);
  const safeJob = sanitizeJobForModel(job);
  const answers = Array.isArray(supplementalAnswers) ? supplementalAnswers
    .filter((item) => item?.confirmed === true && text(item.answer, 4_000))
    .slice(0, 20)
    .map((item) => ({ subject: text(item.subject, 300), answer: text(item.answer, 4_000) })) : [];
  if (!safeJob.title || !safeJob.description) throw Object.assign(new Error("岗位名称和岗位描述不能为空"), { statusCode: 400 });
  const result = await model.generateStructured({
    schemaName: "application_package",
    schema: APPLICATION_PACKAGE_SCHEMA,
    instructions: "你是严格、保守的中文校招材料编辑器。只能重组和改写候选人资料及用户明确确认的补充事实，不得增加数字、结果、职责、证书或经历。每组改写必须引用真实存在的sourceId；证据不足时提出问题，不得自行补全。改写使用清晰的行动—方法—结果结构，但原文没有结果时不能虚构结果。开放题草稿也必须列出证据sourceId。所有输出都需要用户最终核对。",
    input: JSON.stringify({ candidate: safeProfile, confirmedSupplementalFacts: answers, job: safeJob }),
  });
  const validIds = new Set([...safeProfile.experiences, ...safeProfile.projects].map((item) => item.id).filter(Boolean));
  const filterStories = (items) => Array.isArray(items)
    ? items.filter((item) => validIds.has(item.sourceId)).map((item) => ({
      ...item, bullets: strings(item.bullets, 12), rationale: text(item.rationale, 1_000),
    }))
    : [];
  const data = {
    ...result.data,
    experiences: filterStories(result.data.experiences),
    projects: filterStories(result.data.projects),
    openQuestionDrafts: (result.data.openQuestionDrafts ?? []).map((item) => ({
      ...item,
      evidenceSourceIds: strings(item.evidenceSourceIds, 20).filter((id) => validIds.has(id)),
    })),
  };
  return { package: data, disclosedFields: Object.keys(safeProfile), responseId: result.responseId, usage: result.usage };
}
