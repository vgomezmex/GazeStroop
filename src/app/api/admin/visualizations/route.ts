import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    // 1. RT by condition (exclude practice and omissions)
    const trialsRt = await db.trial.findMany({
      where: {
        isPractice: false,
        isOmission: false,
        isValid: true,
        reactionTimeMs: { not: null },
      },
      select: {
        condition: true,
        congruency: true,
        reactionTimeMs: true,
        accuracy: true,
        sessionId: true,
      },
    });

    // Average RT per condition
    const rtByCondition: Record<string, { avg: number; count: number }> = {};
    for (const t of trialsRt) {
      if (!rtByCondition[t.condition]) {
        rtByCondition[t.condition] = { avg: 0, count: 0 };
      }
      rtByCondition[t.condition].avg += t.reactionTimeMs!;
      rtByCondition[t.condition].count += 1;
    }
    const rtByConditionResult: Record<string, number> = {};
    for (const [k, v] of Object.entries(rtByCondition)) {
      rtByConditionResult[k] = Math.round((v.avg / v.count) * 100) / 100;
    }

    // 2. Accuracy by condition
    const accuracyByCondition: Record<string, { correct: number; total: number }> = {};
    for (const t of trialsRt) {
      if (!accuracyByCondition[t.condition]) {
        accuracyByCondition[t.condition] = { correct: 0, total: 0 };
      }
      accuracyByCondition[t.condition].total += 1;
      if (t.accuracy === 'correct') {
        accuracyByCondition[t.condition].correct += 1;
      }
    }
    const accuracyByConditionResult: Record<string, number> = {};
    for (const [k, v] of Object.entries(accuracyByCondition)) {
      accuracyByConditionResult[k] =
        Math.round((v.correct / v.total) * 10000) / 100;
    }

    // 3. RT distribution histogram buckets
    const rtBuckets = [
      { label: '0-200', min: 0, max: 200 },
      { label: '200-400', min: 200, max: 400 },
      { label: '400-600', min: 400, max: 600 },
      { label: '600-800', min: 600, max: 800 },
      { label: '800-1000', min: 800, max: 1000 },
      { label: '1000+', min: 1000, max: Infinity },
    ];
    const rtDistribution: Record<string, number> = {};
    for (const bucket of rtBuckets) {
      rtDistribution[bucket.label] = 0;
    }
    for (const t of trialsRt) {
      const rt = t.reactionTimeMs!;
      for (const bucket of rtBuckets) {
        if (rt >= bucket.min && rt < bucket.max) {
          rtDistribution[bucket.label] += 1;
          break;
        }
      }
    }

    // 4. NASA-TLX averages across sessions
    const nasaSessions = await db.session.findMany({
      where: {
        completedAt: { not: null },
        nasaMentalDemand: { not: null },
      },
      select: {
        nasaMentalDemand: true,
        nasaPhysicalDemand: true,
        nasaTemporalDemand: true,
        nasaPerformance: true,
        nasaEffort: true,
        nasaFrustration: true,
      },
    });

    const nasaAvg = {
      mentalDemand: 0,
      physicalDemand: 0,
      temporalDemand: 0,
      performance: 0,
      effort: 0,
      frustration: 0,
      count: nasaSessions.length,
    };
    for (const s of nasaSessions) {
      nasaAvg.mentalDemand += s.nasaMentalDemand || 0;
      nasaAvg.physicalDemand += s.nasaPhysicalDemand || 0;
      nasaAvg.temporalDemand += s.nasaTemporalDemand || 0;
      nasaAvg.performance += s.nasaPerformance || 0;
      nasaAvg.effort += s.nasaEffort || 0;
      nasaAvg.frustration += s.nasaFrustration || 0;
    }
    if (nasaAvg.count > 0) {
      nasaAvg.mentalDemand = Math.round(nasaAvg.mentalDemand / nasaAvg.count);
      nasaAvg.physicalDemand = Math.round(nasaAvg.physicalDemand / nasaAvg.count);
      nasaAvg.temporalDemand = Math.round(nasaAvg.temporalDemand / nasaAvg.count);
      nasaAvg.performance = Math.round(nasaAvg.performance / nasaAvg.count);
      nasaAvg.effort = Math.round(nasaAvg.effort / nasaAvg.count);
      nasaAvg.frustration = Math.round(nasaAvg.frustration / nasaAvg.count);
    }

    // 5. Interference index per session
    const sessionIds = [...new Set(trialsRt.map((t) => t.sessionId))] as string[];
    const interferencePerSession: Array<{
      sessionId: string;
      interferenceIndex: number;
    }> = [];

    for (const sid of sessionIds) {
      const sessionTrials = trialsRt.filter((t) => t.sessionId === sid);
      const congruentRts = sessionTrials
        .filter((t) => t.congruency === 'congruent' && t.reactionTimeMs)
        .map((t) => t.reactionTimeMs!);
      const incongruentRts = sessionTrials
        .filter((t) => t.congruency === 'incongruent' && t.reactionTimeMs)
        .map((t) => t.reactionTimeMs!);

      if (congruentRts.length > 0 && incongruentRts.length > 0) {
        const meanCongruent =
          congruentRts.reduce((a, b) => a + b, 0) / congruentRts.length;
        const meanIncongruent =
          incongruentRts.reduce((a, b) => a + b, 0) / incongruentRts.length;
        interferencePerSession.push({
          sessionId: sid,
          interferenceIndex:
            Math.round((meanIncongruent - meanCongruent) * 100) / 100,
        });
      }
    }

    // 6. RT-Accuracy correlation data (paired per trial for scatter)
    const rtAccuracyScatter = trialsRt.map((t) => ({
      rt: t.reactionTimeMs,
      accuracy: t.accuracy === 'correct' ? 1 : t.accuracy === 'incorrect' ? 0 : null,
      condition: t.condition,
      congruency: t.congruency,
    }));

    return NextResponse.json({
      rtByCondition: rtByConditionResult,
      accuracyByCondition: accuracyByConditionResult,
      rtDistribution,
      nasaTlxAverages: nasaAvg,
      interferencePerSession,
      rtAccuracyScatter,
    });
  } catch (error) {
    console.error('Error obteniendo visualizaciones:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
