function normalize(value) {
  return String(value ?? "").toLocaleLowerCase().replace(/[\s:：()（）_\-\/]/g, "");
}

export const SENSITIVE_LABELS = [
  "密码", "验证码", "短信码", "身份证", "护照", "银行卡", "银行账户", "社保", "公积金",
  "当前薪资", "现薪", "工资流水", "法律声明", "本人承诺", "电子签名", "password", "captcha",
  "verificationcode", "socialsecurity", "bankaccount", "passport",
];

export const FIELD_CATALOG = [
  { key: "fullName", labels: ["姓名", "真实姓名", "中文姓名", "fullname", "candidate name", "name"], excludes: ["公司", "企业", "学校", "用户名", "紧急联系人", "推荐人", "英文"] },
  { key: "email", labels: ["电子邮箱", "邮箱地址", "联系邮箱", "email address", "email", "邮箱"] },
  { key: "phone", labels: ["手机号码", "联系电话", "联系手机", "mobile phone", "phone number", "mobile", "手机号", "电话"], excludes: ["紧急", "联系人", "推荐人"] },
  { key: "city", labels: ["当前城市", "所在城市", "居住城市", "现居地", "current city"] },
  { key: "github", labels: ["github profile", "github地址", "github链接", "github"] },
  { key: "website", labels: ["个人网站", "作品集链接", "portfolio url", "personal website", "website"] },
  { key: "school", labels: ["毕业院校", "学校名称", "就读学校", "university", "college", "school", "学校"] },
  { key: "degree", labels: ["最高学历", "学历层次", "education level", "degree", "学历"] },
  { key: "major", labels: ["所学专业", "专业名称", "field of study", "major", "专业"] },
  { key: "gpa", labels: ["平均绩点", "grade point average", "gpa", "绩点"] },
  { key: "educationStartDate", labels: ["入学时间", "教育开始时间", "education start"] },
  { key: "graduationDate", labels: ["毕业时间", "预计毕业时间", "graduation date", "graduation"] },
  { key: "graduationYear", labels: ["毕业年份", "毕业年度", "graduation year"] },
  { key: "skills", labels: ["专业技能", "技能关键词", "技能特长", "technical skills", "skills", "技能"] },
  { key: "politicalStatus", labels: ["政治面貌", "political status"] },
  { key: "certificates", labels: ["资格证书", "专业证书", "证书", "certifications", "certificates"] },
  { key: "languages", labels: ["语言能力", "外语水平", "language proficiency", "languages"] },
  { key: "experienceSummary", labels: ["实习经历", "工作经历", "实践经历", "work experience", "experience"] },
  { key: "projectSummary", labels: ["项目经历", "项目经验", "project experience", "projects"] },
];

export function isSensitiveLabel(label) {
  const normalized = normalize(label);
  return SENSITIVE_LABELS.some((value) => normalized.includes(normalize(value)));
}

export function matchFieldDefinition(label, catalog = FIELD_CATALOG) {
  const normalized = normalize(label);
  if (!normalized || isSensitiveLabel(normalized)) return null;

  const candidates = [];
  for (const definition of catalog) {
    if ((definition.excludes ?? []).some((value) => normalized.includes(normalize(value)))) continue;
    for (const alias of definition.labels) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias || !normalized.includes(normalizedAlias)) continue;
      const exactBonus = normalized === normalizedAlias ? 100 : 0;
      candidates.push({ definition, score: exactBonus + normalizedAlias.length });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.definition ?? null;
}

function storyText(items) {
  return items.map((item) => {
    const heading = [item.organization, item.title].filter(Boolean).join(" · ");
    const body = item.highlights.length ? item.highlights.join("；") : item.summary;
    return [heading, body].filter(Boolean).join("：");
  }).filter(Boolean).join("\n");
}

export function buildAutofillPayload(profile) {
  const education = profile.education[0] ?? {};
  const values = {
    fullName: profile.personal.fullName,
    email: profile.personal.email,
    phone: profile.personal.phone,
    city: profile.personal.city,
    github: profile.personal.github,
    website: profile.personal.website,
    school: education.school,
    degree: education.degree,
    major: education.major,
    gpa: education.gpa,
    educationStartDate: education.startDate,
    graduationDate: education.graduationDate,
    graduationYear: profile.preferences.graduationYear || String(education.graduationDate ?? "").slice(0, 4),
    skills: profile.skills.join("、"),
    politicalStatus: profile.qualifications?.politicalStatus ?? "",
    certificates: (profile.qualifications?.certificates ?? []).join("、"),
    languages: (profile.qualifications?.languages ?? []).join("、"),
    experienceSummary: storyText(profile.experiences),
    projectSummary: storyText(profile.projects),
  };
  const catalog = [...FIELD_CATALOG];

  for (const answer of profile.commonAnswers) {
    if (!answer.question || !answer.answer) continue;
    const key = `answer:${answer.id}`;
    values[key] = answer.answer;
    catalog.push({ key, labels: [answer.question] });
  }

  return { values, catalog };
}
