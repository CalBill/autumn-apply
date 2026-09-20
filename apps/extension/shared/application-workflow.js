import { simpleHash } from "./job.js";

function questionId(jobId, category, subject) {
  return `question-${simpleHash(`${jobId}|${category}|${subject}`)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function requirementQuestions(profile, assessment) {
  const text = `${assessment.job.title} ${assessment.job.description}`;
  const definitions = [
    { pattern: /中共党员|党员/, value: profile.qualifications?.politicalStatus, subject: "政治面貌", prompt: "请确认你的政治面貌；该岗位可能包含党员要求。" },
    { pattern: /法律职业资格|司法考试|法考|A证/i, value: (profile.qualifications?.certificates ?? []).join(" "), subject: "法律职业资格", prompt: "请确认你是否持有岗位要求的法律职业资格，并填写证书名称。" },
    { pattern: /英语六级|CET-?6|雅思|托福/i, value: (profile.qualifications?.languages ?? []).join(" "), subject: "语言能力", prompt: "请补充可以证明语言水平的考试、分数或使用经历。" },
  ];
  return definitions
    .filter((item) => item.pattern.test(text) && !item.value)
    .map((item) => ({
      id: questionId(assessment.job.id, "requirement", item.subject), category: "requirement", subject: item.subject,
      prompt: item.prompt, reason: "岗位出现相关硬性条件，但个人事实库中没有对应信息。", answer: "", confirmed: false,
    }));
}

export function createPreparationQuestions(profile, assessment) {
  const questions = requirementQuestions(profile, assessment);
  for (const skill of unique(assessment.missingSkills ?? []).slice(0, 6)) {
    questions.push({
      id: questionId(assessment.job.id, "skill", skill), category: "skill", subject: skill,
      prompt: `你是否有与“${skill}”相关的课程、项目、实习或社团经历？请只填写真实例子和结果。`,
      reason: "岗位提及了这项能力，但当前简历没有明确证据。", answer: "", confirmed: false,
    });
  }
  if (!(profile.experiences?.length || profile.projects?.length)) {
    questions.push({
      id: questionId(assessment.job.id, "story", "经历"), category: "story", subject: "相关经历",
      prompt: "请补充一段与该岗位最相关的课程、项目、社团或实践经历，并说明你的行动和结果。",
      reason: "当前资料库没有可用于岗位版简历的经历。", answer: "", confirmed: false,
    });
  }
  return questions;
}

export function mergePreparationQuestions(existing = [], generated = []) {
  const previous = new Map(existing.map((item) => [item.id, item]));
  return generated.map((item) => previous.has(item.id) ? { ...item, ...previous.get(item.id) } : item);
}

export function preparationReadiness(application) {
  const questions = application.preparation?.questions ?? [];
  const unanswered = questions.filter((item) => !item.confirmed || !String(item.answer ?? "").trim());
  const blockers = [];
  if (!application.preparation?.resumeVariant?.markdown?.trim()) blockers.push("尚未生成或保存岗位版简历");
  if (unanswered.length) blockers.push(`还有 ${unanswered.length} 个缺失信息问题未确认`);
  return { ready: blockers.length === 0, blockers, unanswered };
}
