import { normalizeJob } from "./job.js";

const DEGREE_RANK = { 大专: 1, 本科: 2, 硕士: 3, 博士: 4 };

const COMMON_SKILLS = [
  "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust", "SQL", "R",
  "React", "Vue", "Node.js", "Spring", "Django", "FastAPI", "Git", "Linux", "Docker", "Kubernetes",
  "AWS", "Azure", "GCP", "Spark", "Flink", "Hadoop", "Tableau", "Power BI", "Excel", "Pandas",
  "PyTorch", "TensorFlow", "机器学习", "深度学习", "数据分析", "数据结构", "算法", "产品设计",
  "用户研究", "需求分析", "项目管理", "英语", "沟通", "写作",
];

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase().replace(/\s+/g, " ");
}

function includes(text, value) {
  return text.includes(normalize(value));
}

function highestDegree(profile) {
  return Math.max(0, ...profile.education.map((item) => DEGREE_RANK[item.degree] ?? 0));
}

function requiredDegree(text) {
  const match = text.match(/(大专|本科|硕士|博士)(?:及以上|以上)/);
  return match ? { label: match[1], rank: DEGREE_RANK[match[1]] } : null;
}

function requiredGraduationYears(text) {
  return [...text.matchAll(/(20\d{2})(?:\s*[-—~至]\s*(20\d{2}))?\s*届/g)].flatMap((match) => {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    return Array.from({ length: Math.min(8, end - start + 1) }, (_, index) => String(start + index));
  });
}

export function requiredExperienceYears(text) {
  const values = [...String(text).matchAll(/(\d+)(?:\s*[-–—~至]\s*(\d+))?\s*年(?:及以上|以上)?[^，。；;\n]{0,16}经验/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50);
  return values.length ? Math.max(...values) : null;
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function matchPreference(text, values) {
  return values.filter((value) => includes(text, value));
}

function explicitRequirement(text, pattern) {
  return new RegExp(`(?:必须|须|要求|应为|限)[^，。；;\\n]{0,20}${pattern}|${pattern}[^，。；;\\n]{0,12}(?:必须|须|要求|条件)`, "i").test(text)
    && !new RegExp(`${pattern}[^，。；;\\n]{0,8}(?:优先|加分)`, "i").test(text);
}

export function extractRelevantSkills(jobText, profileSkills = []) {
  const candidates = dedupe([...profileSkills, ...COMMON_SKILLS]);
  return candidates.filter((skill) => includes(jobText, skill));
}

export function analyzeJob(rawJob, profile) {
  const job = normalizeJob(rawJob);
  const text = normalize(`${job.title} ${job.company} ${job.location} ${job.description}`);
  const titleText = normalize(job.title);
  const strengths = [];
  const gaps = [];
  const warnings = [];
  const evidence = [];
  let score = 30;
  let hardRequirementsMet = true;

  const roleMatches = profile.preferences.roles.filter((role) => includes(titleText, role) || includes(text, role));
  const wechatQueryMatches = job.sourceType === "wechat-article"
    ? profile.preferences.roles.filter((role) => (job.metadata?.matchedQueries ?? []).some((query) => includes(normalize(query), role)))
    : [];
  if (roleMatches.length) {
    score += 20;
    strengths.push(`目标岗位匹配：${roleMatches.join("、")}`);
  } else if (wechatQueryMatches.length) {
    score += 10;
    strengths.push(`公众号检索词命中：${wechatQueryMatches.join("、")}`);
    warnings.push("搜索结果摘要未直接展示具体岗位，需打开原文确认岗位清单");
  } else if (profile.preferences.roles.length) {
    gaps.push(`岗位名称与目标方向“${profile.preferences.roles.join("、")}”没有直接匹配`);
  }

  const relevantSkills = extractRelevantSkills(text, profile.skills);
  const matchedSkills = profile.skills.filter((skill) => relevantSkills.some((required) => normalize(required) === normalize(skill)));
  const missingSkills = relevantSkills.filter((skill) => !matchedSkills.some((owned) => normalize(owned) === normalize(skill)));
  const skillRatio = relevantSkills.length ? matchedSkills.length / relevantSkills.length : 0;
  score += Math.round(skillRatio * 30);
  if (matchedSkills.length) strengths.push(`技能匹配：${matchedSkills.slice(0, 8).join("、")}`);
  if (missingSkills.length) gaps.push(`JD 提及但资料中未确认：${missingSkills.slice(0, 8).join("、")}`);
  evidence.push(...matchedSkills.map((skill) => ({ kind: "skill", label: skill })));

  const degree = requiredDegree(job.description);
  if (degree) {
    if (highestDegree(profile) >= degree.rank) {
      score += 10;
      strengths.push(`学历满足“${degree.label}及以上”要求`);
    } else {
      hardRequirementsMet = false;
      gaps.push(`学历可能不满足“${degree.label}及以上”要求`);
    }
  }

  const years = dedupe(requiredGraduationYears(job.description));
  if (years.length && profile.preferences.graduationYear) {
    if (years.includes(profile.preferences.graduationYear)) {
      score += 5;
      strengths.push(`毕业年份 ${profile.preferences.graduationYear} 符合要求`);
    } else {
      hardRequirementsMet = false;
      gaps.push(`岗位面向 ${years.join("/")} 届，个人资料为 ${profile.preferences.graduationYear} 届`);
    }
  }

  const experienceYears = requiredExperienceYears(job.description);
  if (experienceYears !== null) {
    if (profile.preferences.experienceYears >= experienceYears) {
      score += 5;
      strengths.push(`全职工作年限满足 ${experienceYears} 年经验要求`);
    } else {
      hardRequirementsMet = false;
      gaps.push(`岗位要求至少 ${experienceYears} 年相关经验，个人资料为 ${profile.preferences.experienceYears} 年`);
    }
  }

  if (profile.preferences.locations.length && job.location) {
    const locationMatches = profile.preferences.locations.some((location) => includes(job.location, location));
    if (locationMatches) {
      score += 5;
      strengths.push(`工作地点符合偏好：${job.location}`);
    } else {
      warnings.push(`工作地点“${job.location}”不在目标城市中`);
    }
  }

  const industryMatches = matchPreference(text, profile.preferences.industries ?? []);
  if (industryMatches.length) {
    score += 5;
    strengths.push(`行业偏好匹配：${industryMatches.join("、")}`);
  }
  const companyTypeMatches = matchPreference(text, profile.preferences.companyTypes ?? []);
  if (companyTypeMatches.length) {
    score += 5;
    strengths.push(`企业性质偏好匹配：${companyTypeMatches.join("、")}`);
  }

  const politicalStatus = normalize(profile.qualifications?.politicalStatus);
  if (explicitRequirement(text, "(?:中共)?党员")) {
    if (politicalStatus.includes("党员")) {
      score += 5;
      strengths.push("政治面貌满足岗位的党员要求");
    } else {
      hardRequirementsMet = false;
      gaps.push("岗位可能要求中共党员，个人资料尚未确认满足");
    }
  }
  const certificates = normalize((profile.qualifications?.certificates ?? []).join(" "));
  if (explicitRequirement(text, "(?:法律职业资格|司法考试|法考|A证)")) {
    if (/法律职业资格|司法考试|法考|a证/i.test(certificates)) {
      score += 5;
      strengths.push("资料库中的法律职业资格与岗位要求匹配");
    } else {
      hardRequirementsMet = false;
      gaps.push("岗位可能要求法律职业资格，资料库中没有对应证书");
    }
  }
  const languages = normalize((profile.qualifications?.languages ?? []).join(" "));
  if (explicitRequirement(text, "(?:英语六级|CET-?6)")) {
    if (/英语六级|cet-?6/i.test(languages)) {
      score += 5;
      strengths.push("语言能力满足英语六级要求");
    } else {
      hardRequirementsMet = false;
      gaps.push("岗位可能要求英语六级，资料库中没有对应证明");
    }
  }

  if (job.sourceType === "wechat-article" && !job.sourceVerified) {
    warnings.push("这是一条公众号招聘线索，请在投递前核对企业官网、届别和截止日期");
    if (job.metadata?.articleType === "roundup") warnings.push("这是岗位汇总类文章，可能包含转载、群聊或失效入口");
  }

  if (job.description.length < 80) warnings.push("页面提取到的岗位描述较短，匹配结果可能不完整");
  if (!hardRequirementsMet) score = Math.min(score, 49);
  score = Math.min(100, Math.max(0, score));

  return {
    job,
    score,
    hardRequirementsMet,
    passedThreshold: hardRequirementsMet && score >= profile.preferences.minimumScore,
    strengths,
    gaps,
    warnings,
    evidence,
    matchedSkills,
    missingSkills,
    analyzedAt: new Date().toISOString(),
  };
}
