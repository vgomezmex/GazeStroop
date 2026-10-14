import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

// ============================================================
// Helper stats functions
// ============================================================
function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function computeStd(arr: number[], mean: number): number {
  if (arr.length <= 1) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1));
}

function computeIqr(arr: number[]): number {
  if (arr.length < 2) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)];
}

function computeCv(std: number, mean: number): number {
  return mean > 0 ? (std / mean) * 100 : 0;
}

// ============================================================
// GET /api/admin/sessions/[id]/detail
// Returns full results for a session: block summaries, interference, NASA-TLX, quality
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;

    const session = await db.session.findUnique({
      where: { id },
      include: {
        participant: true,
        researcher: true,
        trials: { orderBy: { trialStartedAt: 'asc' } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
    }

    // Get anticipatory threshold from config
    let anticipatoryThreshold = 200;
    try {
      const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
      if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
    } catch { /* use default */ }

    const trials = session.trials.filter((t) => !t.isPractice);

    // ---- Block summaries ----
    const conditionLabel: Record<string, string> = {
      WORD: 'Word Test',
      NEUTRAL: 'Neutral',
      COLOR: 'Color Test',
      REVERSE_STROOP: 'Reverse Stroop',
      STROOP: 'Stroop Test',
    };

    const congruencyMap: Record<string, string> = {
      WORD: 'congruent',
      NEUTRAL: 'neutral',
      COLOR: 'congruent',
      REVERSE_STROOP: 'incongruent',
      STROOP: 'incongruent',
    };

    // Group trials by condition in the order they appear
    const blockOrder: string[] = [];
    const blockTrials: Record<string, typeof trials> = {};

    for (const trial of trials) {
      const cond = trial.condition;
      if (!blockTrials[cond]) {
        blockTrials[cond] = [];
        blockOrder.push(cond);
      }
      blockTrials[cond].push(trial);
    }

    const blockSummaries = blockOrder.map((condition) => {
      const bTrials = blockTrials[condition];
      const correct = bTrials.filter((t) => t.accuracy === 'correct').length;
      const incorrect = bTrials.filter((t) => t.accuracy === 'incorrect').length;
      const omissions = bTrials.filter((t) => t.isOmission).length;
      const total = bTrials.length;

      const validRts = bTrials
        .filter((t) => t.reactionTimeMs != null && t.reactionTimeMs >= anticipatoryThreshold && !t.isOmission)
        .map((t) => t.reactionTimeMs!);

      const rtMean = validRts.length > 0 ? validRts.reduce((a, b) => a + b, 0) / validRts.length : 0;
      const rtMedian = computeMedian(validRts);
      const rtStd = computeStd(validRts, rtMean);
      const rtIqr = computeIqr(validRts);
      const rtCv = computeCv(rtStd, rtMean);

      const anticipatory = bTrials.filter(
        (t) => t.reactionTimeMs != null && t.reactionTimeMs < anticipatoryThreshold
      ).length;

      return {
        condition,
        label: conditionLabel[condition] || condition,
        congruency: congruencyMap[condition] || 'neutral',
        totalTrials: total,
        correctCount: correct,
        incorrectCount: incorrect,
        omissionCount: omissions,
        accuracy: total > 0 ? correct / total : 0,
        accuracyPercent: total > 0 ? (correct / total) * 100 : 0,
        rtMean,
        rtMedian,
        rtStd,
        rtIqr,
        rtCv,
        anticipatoryCount: anticipatory,
      };
    });

    // ---- Interference metrics ----
    const allCongruentRts: number[] = [];
    const allIncongruentRts: number[] = [];
    const allCongruentAcc: number[] = [];
    const allIncongruentAcc: number[] = [];

    for (const trial of trials) {
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      if (isAnt || trial.isOmission) continue;

      if (trial.congruency === 'congruent') {
        if (trial.reactionTimeMs != null) allCongruentRts.push(trial.reactionTimeMs);
        allCongruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      } else if (trial.congruency === 'incongruent') {
        if (trial.reactionTimeMs != null) allIncongruentRts.push(trial.reactionTimeMs);
        allIncongruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      }
    }

    const congruentMeanRt = allCongruentRts.length > 0
      ? allCongruentRts.reduce((a, b) => a + b, 0) / allCongruentRts.length : 0;
    const incongruentMeanRt = allIncongruentRts.length > 0
      ? allIncongruentRts.reduce((a, b) => a + b, 0) / allIncongruentRts.length : 0;
    const interferenceIndex = incongruentMeanRt - congruentMeanRt;
    const relativeInterference = congruentMeanRt > 0
      ? ((incongruentMeanRt - congruentMeanRt) / congruentMeanRt) * 100 : 0;
    const congruentAccPct = allCongruentAcc.length > 0
      ? allCongruentAcc.reduce((a, b) => a + b, 0) / allCongruentAcc.length * 100 : 0;
    const incongruentAccPct = allIncongruentAcc.length > 0
      ? allIncongruentAcc.reduce((a, b) => a + b, 0) / allIncongruentAcc.length * 100 : 0;
    const accuracyCost = congruentAccPct - incongruentAccPct;

    // ---- NASA-TLX ----
    const nasaTlx = session.nasaMentalDemand != null
      ? {
          mentalDemand: session.nasaMentalDemand,
          physicalDemand: session.nasaPhysicalDemand,
          temporalDemand: session.nasaTemporalDemand,
          performance: session.nasaPerformance,
          effort: session.nasaEffort,
          frustration: session.nasaFrustration,
          globalScore: session.nasaGlobalScore,
        }
      : null;

    // ---- Data quality ----
    const validTrials = trials.filter((t) => t.isValid).length;
    const totalTrials = trials.length;
    const excludedTrials = totalTrials - validTrials;

    // ---- Post-experiment evaluation ----
    const postEval = {
      difficultyPerceived: session.postDifficultyPerceived,
      concentrationReq: session.postConcentrationReq,
      fatigue: session.postFatigue,
      stress: session.postStress,
      difficultyResponding: session.postDifficultyResponding,
    };

    // ---- Experience ----
    const experience = {
      testClear: session.testClear,
      instructionsClear: session.instructionsClear,
      timeSufficient: session.timeSufficient,
      hadDistractions: session.hadDistractions,
      distractionDescription: session.distractionDescription,
      hadTechnicalIssues: session.hadTechnicalIssues,
      technicalIssueDesc: session.technicalIssueDesc,
      additionalComments: session.additionalComments,
    };

    // ---- Researcher notes ----
    const researcherNotes = {
      excessiveHead: session.researcherExcessiveHead,
      trackingProbs: session.researcherTrackingProbs,
      calibStable: session.researcherCalibStable,
      interruptions: session.researcherInterruptions,
      followedInstr: session.researcherFollowedInstr,
    };

    return NextResponse.json({
      session: {
        id: session.id,
        studyCode: session.studyCode,
        researcherCode: session.researcherCode,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        calibrationStatus: session.calibrationStatus,
        calibrationErrorDeg: session.calibrationErrorDeg,
        excludedFromAnalysis: session.excludedFromAnalysis,
        exclusionReason: session.exclusionReason,
        dataQualityPercent: session.dataQualityPercent,
        dataLostPercent: session.dataLostPercent,
        trialsExcludedCount: session.trialsExcludedCount,
      },
      participant: {
        id: session.participant?.id,
        studyCode: session.participant?.studyCode,
      },
      researcher: session.researcher
        ? { id: session.researcher.id, code: session.researcher.code, name: session.researcher.name }
        : null,
      blockSummaries,
      interference: {
        interferenceIndex,
        relativeInterference,
        accuracyCost,
      },
      nasaTlx,
      dataQuality: {
        totalTrials,
        validTrials,
        excludedTrials,
        dataQualityPercent: session.dataQualityPercent ?? (totalTrials > 0 ? (validTrials / totalTrials) * 100 : 100),
      },
      postEval,
      experience,
      researcherNotes,
    });
  } catch (error) {
    console.error('Error obteniendo detalle de sesión:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
