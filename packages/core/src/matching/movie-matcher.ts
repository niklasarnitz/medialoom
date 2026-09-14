import type {
  CandidateMatchEvaluation,
  MatchDecision,
  MovieMetadataCandidate,
  ScoreComponents,
} from '@medialoom/contracts';

export interface LocalMovieMetadata {
  title: string;
  year?: number | null;
  runtimeMinutes?: number | null;
}

export interface ScoringConfig {
  titleWeight: number;
  yearWeight: number;
  runtimeWeight: number;
  providerRankWeight: number;
  autoMatchThreshold: number;
  reviewRequiredThreshold: number;
  ambiguityMargin: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  titleWeight: 0.6,
  yearWeight: 0.25,
  runtimeWeight: 0.1,
  providerRankWeight: 0.05,
  autoMatchThreshold: 0.9,
  reviewRequiredThreshold: 0.65,
  ambiguityMargin: 0.05,
};

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingArticle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').trim();
}

function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let prevRow = new Array<number>(s2.length + 1);
  let currRow = new Array<number>(s2.length + 1);

  for (let j = 0; j <= s2.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 0; i < s1.length; i++) {
    currRow[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      currRow[j + 1] = Math.min(
        (currRow[j] ?? 0) + 1,
        (prevRow[j + 1] ?? 0) + 1,
        (prevRow[j] ?? 0) + cost,
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[s2.length] ?? 0;
}

function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

function calculateTitleSimilarity(localTitle: string, candidateTitle: string): number {
  const normLocal = normalizeTitle(localTitle);
  const normCand = normalizeTitle(candidateTitle);

  if (normLocal === normCand) return 1.0;
  if (!normLocal || !normCand) return 0.0;

  // Direct string similarity
  const directSim = stringSimilarity(normLocal, normCand);

  // Article-stripped similarity (e.g. "The Matrix" vs "Matrix")
  const strippedLocal = stripLeadingArticle(normLocal);
  const strippedCand = stripLeadingArticle(normCand);
  let strippedSim = 0.0;
  if (strippedLocal && strippedCand) {
    if (strippedLocal === strippedCand) {
      strippedSim = 0.95;
    } else {
      strippedSim = stringSimilarity(strippedLocal, strippedCand) * 0.95;
    }
  }

  // Word token overlap (Jaccard)
  const tokensLocal = new Set(normLocal.split(' ').filter(Boolean));
  const tokensCand = new Set(normCand.split(' ').filter(Boolean));
  let intersectionCount = 0;
  for (const token of tokensLocal) {
    if (tokensCand.has(token)) intersectionCount++;
  }
  const unionCount = new Set([...tokensLocal, ...tokensCand]).size;
  const jaccardSim = unionCount > 0 ? intersectionCount / unionCount : 0.0;

  return Math.max(directSim, strippedSim, jaccardSim * 0.9);
}

export class MovieMatcher {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
  }

  evaluateCandidate(
    local: LocalMovieMetadata,
    candidate: MovieMetadataCandidate,
    rank: number,
  ): CandidateMatchEvaluation {
    const reasons: string[] = [];

    // 1. Title Similarity (max 0.60)
    let bestTitleSim = calculateTitleSimilarity(local.title, candidate.title);
    if (candidate.originalTitle) {
      const origSim = calculateTitleSimilarity(local.title, candidate.originalTitle);
      if (origSim > bestTitleSim) {
        bestTitleSim = origSim;
      }
    }
    const titleScore = round2(bestTitleSim * this.config.titleWeight);
    reasons.push(
      `Title similarity: ${(bestTitleSim * 100).toFixed(1)}% -> ${titleScore.toFixed(2)} / ${this.config.titleWeight.toFixed(2)}`,
    );

    // 2. Year Similarity (max 0.25) & Contradiction Penalty
    let yearScore = 0.0;
    let yearPenalty = 0.0;

    if (
      local.year !== undefined &&
      local.year !== null &&
      candidate.year !== undefined &&
      candidate.year !== null
    ) {
      const delta = Math.abs(local.year - candidate.year);
      if (delta === 0) {
        yearScore = this.config.yearWeight;
        reasons.push(
          `Year exact match: ${local.year} -> ${yearScore.toFixed(2)} / ${this.config.yearWeight.toFixed(2)}`,
        );
      } else if (delta === 1) {
        yearScore = round2(this.config.yearWeight * 0.8);
        reasons.push(
          `Year off by 1: local ${local.year}, candidate ${candidate.year} -> ${yearScore.toFixed(2)}`,
        );
      } else if (delta === 2) {
        yearScore = round2(this.config.yearWeight * 0.4);
        reasons.push(
          `Year off by 2: local ${local.year}, candidate ${candidate.year} -> ${yearScore.toFixed(2)}`,
        );
      } else if (delta === 3) {
        yearPenalty = -0.1;
        reasons.push(
          `Year contradiction: local ${local.year}, candidate ${candidate.year} (diff 3) -> penalty ${yearPenalty.toFixed(2)}`,
        );
      } else if (delta === 4) {
        yearPenalty = -0.2;
        reasons.push(
          `Year contradiction: local ${local.year}, candidate ${candidate.year} (diff 4) -> penalty ${yearPenalty.toFixed(2)}`,
        );
      } else {
        yearPenalty = -0.35;
        reasons.push(
          `Year severe contradiction: local ${local.year}, candidate ${candidate.year} (diff ${delta}) -> penalty ${yearPenalty.toFixed(2)}`,
        );
      }
    } else {
      reasons.push('Year missing on local file or candidate -> 0.00');
    }

    // 3. Runtime Similarity (max 0.10) & Contradiction Penalty
    let runtimeScore = 0.0;
    let runtimePenalty = 0.0;

    if (
      local.runtimeMinutes !== undefined &&
      local.runtimeMinutes !== null &&
      candidate.runtimeMinutes !== undefined &&
      candidate.runtimeMinutes !== null
    ) {
      const diff = Math.abs(local.runtimeMinutes - candidate.runtimeMinutes);
      if (diff <= 3) {
        runtimeScore = this.config.runtimeWeight;
        reasons.push(
          `Runtime match: ${local.runtimeMinutes}m vs ${candidate.runtimeMinutes}m (diff ${diff}m) -> ${runtimeScore.toFixed(2)} / ${this.config.runtimeWeight.toFixed(2)}`,
        );
      } else if (diff <= 10) {
        runtimeScore = round2(this.config.runtimeWeight * 0.7);
        reasons.push(
          `Runtime close: ${local.runtimeMinutes}m vs ${candidate.runtimeMinutes}m (diff ${diff}m) -> ${runtimeScore.toFixed(2)}`,
        );
      } else if (diff <= 15) {
        runtimeScore = round2(this.config.runtimeWeight * 0.4);
        reasons.push(
          `Runtime fair: ${local.runtimeMinutes}m vs ${candidate.runtimeMinutes}m (diff ${diff}m) -> ${runtimeScore.toFixed(2)}`,
        );
      } else if (diff > 45) {
        runtimePenalty = -0.2;
        reasons.push(
          `Runtime severe contradiction: ${local.runtimeMinutes}m vs ${candidate.runtimeMinutes}m (diff ${diff}m) -> penalty ${runtimePenalty.toFixed(2)}`,
        );
      } else if (diff > 25) {
        runtimePenalty = -0.1;
        reasons.push(
          `Runtime contradiction: ${local.runtimeMinutes}m vs ${candidate.runtimeMinutes}m (diff ${diff}m) -> penalty ${runtimePenalty.toFixed(2)}`,
        );
      } else {
        reasons.push(`Runtime neutral divergence (${diff}m) -> 0.00`);
      }
    } else {
      reasons.push('Runtime missing on local technical metadata or candidate -> 0.00');
    }

    // 4. Provider Rank (max 0.05)
    let providerRankScore = 0.0;
    if (rank === 0) providerRankScore = 0.05;
    else if (rank === 1) providerRankScore = 0.03;
    else if (rank === 2) providerRankScore = 0.02;
    else if (rank === 3) providerRankScore = 0.01;
    else providerRankScore = 0.0;

    reasons.push(`Provider rank #${rank + 1} -> ${providerRankScore.toFixed(2)}`);

    const totalPenalty = round2(yearPenalty + runtimePenalty);
    const rawTotal = titleScore + yearScore + runtimeScore + providerRankScore + totalPenalty;
    const finalScore = Math.max(0, Math.min(1, round2(rawTotal)));

    const components: ScoreComponents = {
      title: titleScore,
      year: yearScore,
      runtime: runtimeScore,
      providerRank: providerRankScore,
      penalty: totalPenalty,
    };

    return {
      candidate,
      score: finalScore,
      components,
      rank,
      reasons,
    };
  }

  evaluateCandidates(
    local: LocalMovieMetadata,
    candidates: MovieMetadataCandidate[],
  ): {
    decision: MatchDecision;
    evaluations: CandidateMatchEvaluation[];
    selectedCandidate: MovieMetadataCandidate | null;
    topScore: number | null;
    components: ScoreComponents | null;
  } {
    if (candidates.length === 0) {
      return {
        decision: 'UNMATCHED',
        evaluations: [],
        selectedCandidate: null,
        topScore: null,
        components: null,
      };
    }

    const evaluations = candidates.map((candidate, rank) =>
      this.evaluateCandidate(local, candidate, rank),
    );

    // Sort evaluations by score descending
    evaluations.sort((a, b) => b.score - a.score);

    const top = evaluations[0];
    if (!top) {
      return {
        decision: 'UNMATCHED',
        evaluations: [],
        selectedCandidate: null,
        topScore: null,
        components: null,
      };
    }

    const runnerUp = evaluations[1];

    let decision: MatchDecision;

    if (top.score >= this.config.autoMatchThreshold) {
      // Check ambiguity: runnerUp exists and score difference is within ambiguity margin
      if (runnerUp && round2(top.score - runnerUp.score) < this.config.ambiguityMargin) {
        decision = 'REVIEW_REQUIRED';
        top.reasons.push(
          `Ambiguous match: top score (${top.score.toFixed(2)}) is within margin (${this.config.ambiguityMargin}) of runner-up score (${runnerUp.score.toFixed(2)})`,
        );
      } else {
        decision = 'AUTO_MATCH';
      }
    } else if (top.score >= this.config.reviewRequiredThreshold) {
      decision = 'REVIEW_REQUIRED';
    } else {
      decision = 'UNMATCHED';
    }

    return {
      decision,
      evaluations,
      selectedCandidate: decision === 'AUTO_MATCH' ? top.candidate : null,
      topScore: top.score,
      components: top.components,
    };
  }
}

export const defaultMovieMatcher = new MovieMatcher();
