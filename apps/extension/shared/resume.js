import { simpleHash } from "./job.js";

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase();
}

function storyScore(story, job, matchedSkills) {
  const text = normalize([story.title, story.organization, story.summary, ...story.highlights, ...story.keywords].join(" "));
  const jobText = normalize(`${job.title} ${job.description}`);
  const directKeywords = [...story.keywords, ...matchedSkills];
  return directKeywords.reduce((score, keyword) => {
    const value = normalize(keyword);
    return score + (value && text.includes(value) && jobText.includes(value) ? 3 : 0);
  }, jobText.includes(normalize(story.title)) ? 5 : 0);
}

function ranked(items, job, matchedSkills) {
  return items
    .map((item, index) => ({ item, index, score: storyScore(item, job, matchedSkills) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

function dateRange(item) {
  return [item.startDate, item.endDate || "至今"].filter(Boolean).join(" — ");
}

function storyLines(item) {
  const lines = item.highlights.length ? item.highlights : item.summary ? [item.summary] : [];
  return lines.map((text) => ({ text, sourceId: item.id, requiresReview: false }));
}

export function createResumeVariant(profile, assessment) {
  const { job, matchedSkills } = assessment;
  const experiences = ranked(profile.experiences, job, matchedSkills).slice(0, 4);
  const projects = ranked(profile.projects, job, matchedSkills).slice(0, 4);
  const skills = [
    ...matchedSkills,
    ...profile.skills.filter((skill) => !matchedSkills.includes(skill)),
  ];
  const variant = {
    id: `resume-${simpleHash(`${profile.id}|${job.id}|${Date.now()}`)}`,
    profileId: profile.id,
    jobId: job.id,
    target: `${job.company} · ${job.title}`,
    sections: {
      education: profile.education.map((item) => ({ ...item, sourceId: item.id })),
      experiences: experiences.map((item) => ({ ...item, bullets: storyLines(item), sourceId: item.id })),
      projects: projects.map((item) => ({ ...item, bullets: storyLines(item), sourceId: item.id })),
      skills,
    },
    createdAt: new Date().toISOString(),
  };
  return { ...variant, markdown: renderResumeMarkdown(profile, variant) };
}

export function renderResumeMarkdown(profile, variant) {
  const lines = [
    `# ${profile.personal.fullName}`,
    "",
    [profile.personal.email, profile.personal.phone, profile.personal.city].filter(Boolean).join(" · "),
    [profile.personal.github, profile.personal.website].filter(Boolean).join(" · "),
    "",
    `> 目标岗位：${variant.target}`,
    "",
    "## 教育经历",
  ];

  for (const item of variant.sections.education) {
    lines.push(`### ${item.school} · ${item.degree} · ${item.major}`);
    lines.push([item.startDate, item.graduationDate, item.gpa && `GPA ${item.gpa}`].filter(Boolean).join(" · "));
    lines.push("");
  }

  if (variant.sections.experiences.length) {
    lines.push("## 实习与工作经历");
    for (const item of variant.sections.experiences) {
      lines.push(`### ${item.organization} · ${item.title}`);
      lines.push(dateRange(item));
      for (const bullet of item.bullets) lines.push(`- ${bullet.text}`);
      lines.push("");
    }
  }

  if (variant.sections.projects.length) {
    lines.push("## 项目经历");
    for (const item of variant.sections.projects) {
      lines.push(`### ${item.title}${item.organization ? ` · ${item.organization}` : ""}`);
      lines.push(dateRange(item));
      for (const bullet of item.bullets) lines.push(`- ${bullet.text}`);
      lines.push("");
    }
  }

  lines.push("## 技能", "", variant.sections.skills.join("、"), "");
  return lines.join("\n");
}
