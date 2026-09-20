export const PROFILE_VERSION = 2;

export function newId(prefix = "item") {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function createEmptyProfile() {
  return {
    version: PROFILE_VERSION,
    id: newId("profile"),
    personal: {
      fullName: "",
      email: "",
      phone: "",
      city: "",
      github: "",
      linkedin: "",
      website: "",
    },
    education: [],
    experiences: [],
    projects: [],
    skills: [],
    qualifications: {
      politicalStatus: "",
      certificates: [],
      languages: [],
    },
    commonAnswers: [],
    preferences: {
      roles: [],
      locations: [],
      industries: [],
      companyTypes: [],
      requiredKeywords: [],
      excludedKeywords: [],
      campusOnly: true,
      graduationYear: "",
      experienceYears: 0,
      minimumScore: 60,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[、，,;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeEducation(item = {}) {
  return {
    id: cleanText(item.id) || newId("education"),
    school: cleanText(item.school),
    degree: cleanText(item.degree),
    major: cleanText(item.major),
    gpa: cleanText(item.gpa),
    startDate: cleanText(item.startDate),
    graduationDate: cleanText(item.graduationDate),
  };
}

function normalizeStory(item = {}, prefix) {
  return {
    id: cleanText(item.id) || newId(prefix),
    title: cleanText(item.title),
    organization: cleanText(item.organization),
    startDate: cleanText(item.startDate),
    endDate: cleanText(item.endDate),
    summary: cleanText(item.summary),
    highlights: splitList(item.highlights),
    keywords: splitList(item.keywords),
  };
}

export function normalizeProfile(input = {}) {
  const empty = createEmptyProfile();
  const personal = input.personal ?? {};
  const preferences = input.preferences ?? {};
  const qualifications = input.qualifications ?? {};

  return {
    version: PROFILE_VERSION,
    id: cleanText(input.id) || empty.id,
    personal: {
      fullName: cleanText(personal.fullName),
      email: cleanText(personal.email),
      phone: cleanText(personal.phone),
      city: cleanText(personal.city),
      github: cleanText(personal.github),
      linkedin: cleanText(personal.linkedin),
      website: cleanText(personal.website),
    },
    education: Array.isArray(input.education) ? input.education.map(normalizeEducation) : [],
    experiences: Array.isArray(input.experiences)
      ? input.experiences.map((item) => normalizeStory(item, "experience"))
      : [],
    projects: Array.isArray(input.projects)
      ? input.projects.map((item) => normalizeStory(item, "project"))
      : [],
    skills: splitList(input.skills),
    qualifications: {
      politicalStatus: cleanText(qualifications.politicalStatus),
      certificates: splitList(qualifications.certificates),
      languages: splitList(qualifications.languages),
    },
    commonAnswers: Array.isArray(input.commonAnswers)
      ? input.commonAnswers.map((item) => ({
          id: cleanText(item.id) || newId("answer"),
          question: cleanText(item.question),
          answer: cleanText(item.answer),
        }))
      : [],
    preferences: {
      roles: splitList(preferences.roles),
      locations: splitList(preferences.locations),
      industries: splitList(preferences.industries),
      companyTypes: splitList(preferences.companyTypes),
      requiredKeywords: splitList(preferences.requiredKeywords),
      excludedKeywords: splitList(preferences.excludedKeywords),
      campusOnly: preferences.campusOnly !== false,
      graduationYear: cleanText(preferences.graduationYear),
      experienceYears: Math.min(50, Math.max(0, Number(preferences.experienceYears) || 0)),
      minimumScore: Math.min(100, Math.max(0, Number(preferences.minimumScore) || 60)),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object") return ["资料格式无效"];
  if (!profile.personal?.fullName) errors.push("请填写姓名");
  if (!profile.personal?.email && !profile.personal?.phone) errors.push("邮箱和手机号至少填写一项");
  if (profile.personal?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.personal.email)) {
    errors.push("邮箱格式无效");
  }
  if (!Array.isArray(profile.education) || profile.education.length === 0) errors.push("请至少填写一段教育经历");
  if (!Array.isArray(profile.skills) || profile.skills.length === 0) errors.push("请至少填写一项技能");
  return errors;
}

export function profileHasUsefulData(profile) {
  return validateProfile(profile).length === 0;
}
