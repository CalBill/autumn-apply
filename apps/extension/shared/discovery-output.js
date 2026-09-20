export function createAiDiscoveryOutput(output, instructions) {
  return {
    instructions,
    results: (output.opportunities ?? []).map((item) => {
      const job = {
        id: item.id,
        providerId: item.sourceUrl,
        title: item.title,
        company: item.company,
        location: item.location,
        description: item.description,
        sourceUrl: item.sourceUrl,
        sourcePlatform: `AI联网检索 · ${item.verification.status}`,
        sourceType: "ai-web-search",
        sourceVerified: item.verification.status === "verified",
        publishedAt: item.publishedAt,
      };
      return {
        job,
        assessment: {
          job,
          score: item.matchScore,
          strengths: [item.matchReason],
          gaps: item.hardRequirementRisk ? [item.hardRequirementRisk] : [],
          matchedSkills: [],
          missingSkills: [],
          hardRequirementsMet: true,
          passedThreshold: item.matchScore >= instructions.minimumScore,
          warnings: item.verification.status === "verified"
            ? []
            : [item.verification.status === "reachable"
              ? "来源页面可达，但正文信号尚未完全核验"
              : "来源页面当前无法访问，投递前必须人工核对"],
        },
      };
    }),
    sourceStats: [{ id: "ai-web-search", name: "AI联网搜索", fetched: output.opportunities?.length ?? 0 }],
    errors: [],
    searchedAt: output.searchedAt,
  };
}

export function mergeDiscoveryOutputs(base, supplement) {
  if (!base?.results) return supplement;
  const results = [...new Map(
    [...base.results, ...supplement.results].map((entry) => [entry.job.id, entry]),
  ).values()].sort((a, b) => b.assessment.score - a.assessment.score);
  const sourceStats = [...new Map(
    [...(base.sourceStats ?? []), ...(supplement.sourceStats ?? [])]
      .map((source) => [source.id ?? source.name, source]),
  ).values()];
  return {
    ...base,
    ...supplement,
    instructions: supplement.instructions ?? base.instructions,
    results,
    sourceStats,
    errors: [...(base.errors ?? []), ...(supplement.errors ?? [])],
  };
}
