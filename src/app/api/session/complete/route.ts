import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      participantId,
      sessionId,
      // Participant fields (sections A-F)
      participantData,
      // Trial data
      trials,
      // NASA-TLX
      nasaMentalDemand,
      nasaPhysicalDemand,
      nasaTemporalDemand,
      nasaPerformance,
      nasaEffort,
      nasaFrustration,
      nasaGlobalScore,
      nasaWeightingMethod,
      // Section J
      postDifficultyPerceived,
      postConcentrationReq,
      postFatigue,
      postStress,
      postDifficultyResponding,
      // Section K
      testClear,
      instructionsClear,
      timeSufficient,
      hadDistractions,
      distractionDescription,
      hadTechnicalIssues,
      technicalIssueDesc,
      additionalComments,
      // Section L
      researcherExcessiveHead,
      researcherTrackingProbs,
      researcherCalibStable,
      researcherInterruptions,
      researcherFollowedInstr,
      excludedFromAnalysis,
      exclusionReason,
      // Calibration
      calibrationStatus,
      calibrationErrorDeg,
      calibrationTimestamp,
      // Results summary
      results,
    } = body;

    if (!participantId || !sessionId) {
      return NextResponse.json(
        { error: 'participantId y sessionId requeridos' },
        { status: 400 }
      );
    }

    // Idempotency: if session already completed, return success
    const existingSession = await db.session.findUnique({
      where: { id: sessionId },
      select: { completedAt: true },
    });
    if (!existingSession) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }
    if (existingSession.completedAt) {
      return NextResponse.json({ success: true, sessionId, alreadyCompleted: true });
    }

    // Calculate quality metrics from experimental trials
    const experimentalTrials = (trials || []).filter(
      (t: { isPractice?: boolean }) => !t.isPractice
    );

    const totalTrials = experimentalTrials.length;
    const omissions = experimentalTrials.filter(
      (t: { isOmission?: boolean }) => t.isOmission
    ).length;
    const incorrectTrials = experimentalTrials.filter(
      (t: { accuracy?: string }) => t.accuracy === 'incorrect'
    ).length;
    const trialsExcluded = omissions + incorrectTrials;
    const dataQualityPercent =
      totalTrials > 0
        ? Math.round(
            ((totalTrials - trialsExcluded) / totalTrials) * 10000
          ) / 100
        : 100;
    const dataLostPercent =
      totalTrials > 0
        ? Math.round((trialsExcluded / totalTrials) * 10000) / 100
        : 0;

    // Execute everything inside a transaction — all-or-nothing
    const createdTrialCount = await db.$transaction(async (tx) => {
      // 1. Upsert participant data
      if (participantData) {
        await tx.participant.update({
          where: { id: participantId },
          data: {
            ...(participantData.age != null && { age: Number(participantData.age) }),
            ...(participantData.sex && { sex: participantData.sex }),
            ...(participantData.education && { education: participantData.education }),
            ...(participantData.computerHoursPerDay && { computerHoursPerDay: participantData.computerHoursPerDay }),
            ...(participantData.glassesUse && { glassesUse: participantData.glassesUse }),
            ...(participantData.visualDifficulty && { visualDifficulty: participantData.visualDifficulty }),
            ...(participantData.visualDifficultyDesc != null && { visualDifficultyDesc: participantData.visualDifficultyDesc }),
            ...(participantData.hoursSleepLastNight != null && { hoursSleepLastNight: Number(participantData.hoursSleepLastNight) }),
            ...(participantData.sleepQuality != null && { sleepQuality: Number(participantData.sleepQuality) }),
            ...(participantData.currentRestLevel != null && { currentRestLevel: Number(participantData.currentRestLevel) }),
            ...(participantData.currentFatigueLevel != null && { currentFatigueLevel: Number(participantData.currentFatigueLevel) }),
            ...(participantData.stateFatigue != null && { stateFatigue: Number(participantData.stateFatigue) }),
            ...(participantData.stateStress != null && { stateStress: Number(participantData.stateStress) }),
            ...(participantData.stateSleepiness != null && { stateSleepiness: Number(participantData.stateSleepiness) }),
            ...(participantData.stateMotivation != null && { stateMotivation: Number(participantData.stateMotivation) }),
            ...(participantData.stateConcentration != null && { stateConcentration: Number(participantData.stateConcentration) }),
            ...(participantData.caffeineLast3h && { caffeineLast3h: participantData.caffeineLast3h }),
            ...(participantData.caffeineType != null && { caffeineType: participantData.caffeineType }),
            ...(participantData.caffeineAmount != null && { caffeineAmount: participantData.caffeineAmount }),
            ...(participantData.caffeineTime != null && { caffeineTime: participantData.caffeineTime }),
            ...(participantData.alcoholLast12h && { alcoholLast12h: participantData.alcoholLast12h }),
            ...(participantData.exerciseLast3h && { exerciseLast3h: participantData.exerciseLast3h }),
            ...(participantData.lastMealTime != null && { lastMealTime: participantData.lastMealTime }),
            ...(participantData.locationComfort && { locationComfort: participantData.locationComfort }),
          },
        });
      }

      // 2. Clear FeatureStore (safe to fully rebuild — es una tabla derivada,
      // no datos crudos). Los Trial YA NO se borran aquí: si el eye tracker
      // estuvo activo, las muestras en tiempo real ya se escribieron contra
      // el trialId real creado por /api/trial/start, y EyeTrackingSample.trialId
      // hace cascade on delete de Trial — borrar los trials aquí destruiría
      // silenciosamente esos datos capturados en vivo. En su lugar, se hace
      // upsert por id más abajo.
      await tx.featureStore.deleteMany({ where: { sessionId } });

      // 3. Upsert Trial records (crear si no tiene id todavía — p. ej. si la
      // llamada a /api/trial/start falló del lado del cliente — o actualizar
      // la fila que ya se creó al mostrar el estímulo).
      const createdTrials: { id: string; condition: string; congruency: string; reactionTimeMs: number | null; accuracy: string | null; isOmission: boolean; isPractice: boolean; pupilMean: number | null; pupilMax: number | null; pupilChange: number | null; fixationCount: number | null }[] = [];

      if (trials && Array.isArray(trials)) {
        for (const trial of trials) {
          if (trial.isPractice) continue;

          const trialData = {
              sessionId,
              blockOrder: Number(trial.blockOrder) || 0,
              condition: trial.condition || '',
              congruency: trial.congruency || '',
              stimulusWord: trial.stimulusWord || trial.stimulus?.stimulusWord || '',
              stimulusInkColorHex: trial.stimulusInkColorHex || trial.stimulus?.stimulusInkColorHex || '',
              stimulusInkColorName: trial.stimulusInkColorName || trial.stimulus?.stimulusInkColorName || '',
              correctAnswer: trial.correctAnswer || trial.stimulus?.correctAnswer || '',
              correctRoiPosition: trial.correctRoiPosition || trial.stimulus?.correctRoiPosition || '',
              distractorColors: trial.distractorColors
                ? typeof trial.distractorColors === 'string'
                  ? trial.distractorColors
                  : JSON.stringify(trial.distractorColors)
                : trial.stimulus?.distractorColors
                  ? JSON.stringify(trial.stimulus.distractorColors)
                  : '[]',
              participantResponse: trial.participantResponse || null,
              responseRoiPosition: trial.responseRoiPosition || null,
              reactionTimeMs: trial.reactionTimeMs != null ? Number(trial.reactionTimeMs) : null,
              accuracy: trial.accuracy || null,
              isOmission: Boolean(trial.isOmission),
              isPractice: Boolean(trial.isPractice),
              isValid:
                !trial.isOmission && trial.accuracy !== 'incorrect' && trial.accuracy !== 'pending',
              stimulusOnsetPerfNow: trial.stimulusOnsetPerfNow != null
                ? Number(trial.stimulusOnsetPerfNow)
                : null,
              responsePerfNow: trial.responsePerfNow != null
                ? Number(trial.responsePerfNow)
                : null,
              trialCompletedAt: trial.trialCompletedAt
                ? new Date(trial.trialCompletedAt)
                : new Date(),
          };

          // BUG CORREGIDO: trialStartedAt solo debe fijarse al CREAR una
          // fila nueva (fallback para el caso raro en que /api/trial/start
          // nunca llegó a correr para este ensayo). Al ACTUALIZAR una fila
          // que /api/trial/start ya creó en tiempo real, NO debe tocarse —
          // esa fila ya tiene el timestamp real y correcto desde el momento
          // en que se mostró el estímulo (default(now()) en el schema). Si
          // se sobreescribe aquí con "ahora" (que es lo que hacía antes),
          // todos los ensayos de la sesión terminan con timestamps casi
          // idénticos (los de "ahora", al completar la sesión), rompiendo
          // el orden cronológico que usan las exportaciones para numerar
          // los ensayos dentro de cada bloque.
          const created = trial.id
            ? await tx.trial.update({ where: { id: trial.id }, data: trialData })
            : await tx.trial.create({
                data: {
                  ...trialData,
                  trialStartedAt: trial.trialStartedAt ? new Date(trial.trialStartedAt) : new Date(),
                },
              });

          // Agrega métricas reales de pupila/fijación a partir de las muestras
          // de EyeTrackingSample capturadas en vivo durante este ensayo (si
          // el eye tracker estuvo conectado). Las métricas de sácadas se
          // dejan en null intencionalmente — requieren un algoritmo de
          // detección por umbral de velocidad que todavía no está implementado.
          const samples = await tx.eyeTrackingSample.findMany({
            where: { trialId: created.id, phase: 'trial' },
            select: { pupilDiameter: true, fixationId: true },
          });
          const pupilValues = samples.map((s) => s.pupilDiameter).filter((v): v is number => v != null);
          const fixationIds = new Set(samples.map((s) => s.fixationId).filter((v): v is number => v != null));

          let pupilMean: number | null = null;
          let pupilMax: number | null = null;
          let pupilChange: number | null = null;
          const fixationCount = fixationIds.size > 0 ? fixationIds.size : null;

          if (pupilValues.length > 0) {
            pupilMean = pupilValues.reduce((a, b) => a + b, 0) / pupilValues.length;
            pupilMax = Math.max(...pupilValues);
            pupilChange = pupilValues[pupilValues.length - 1] - pupilValues[0];
            await tx.trial.update({
              where: { id: created.id },
              data: {
                pupilDiameterMean: pupilMean,
                pupilDiameterMax: pupilMax,
                pupilDiameterChange: pupilChange,
                fixationCount,
              },
            });
          }

          createdTrials.push({ ...created, pupilMean, pupilMax, pupilChange, fixationCount });
        }
      }

      // 4. Create FeatureStore entries for each trial
      for (const trial of createdTrials) {
        await tx.featureStore.create({
          data: {
            participantId,
            sessionId,
            trialId: trial.id,
            pupilMean: trial.pupilMean,
            pupilMax: trial.pupilMax,
            pupilChange: trial.pupilChange,
            fixationDuration: null,
            fixationCount: trial.fixationCount,
            saccadeAmplitude: null,
            saccadeVelocity: null,
            gazeEntropy: null,
            rt: trial.reactionTimeMs,
            accuracy:
              trial.accuracy === 'correct'
                ? 1
                : trial.accuracy === 'incorrect' || trial.accuracy === 'pending'
                  ? 0
                  : null,
            cognitiveConditionLabel: trial.condition,
          },
        });
      }

      // 5. Update session with all post-experiment data
      await tx.session.update({
        where: { id: sessionId },
        data: {
          completedAt: new Date(),
          ...(calibrationStatus && { calibrationStatus }),
          ...(calibrationErrorDeg != null && {
            calibrationErrorDeg: Number(calibrationErrorDeg),
          }),
          ...(calibrationTimestamp && {
            calibrationTimestamp: new Date(calibrationTimestamp),
          }),
          ...(nasaMentalDemand != null && {
            nasaMentalDemand: Number(nasaMentalDemand),
          }),
          ...(nasaPhysicalDemand != null && {
            nasaPhysicalDemand: Number(nasaPhysicalDemand),
          }),
          ...(nasaTemporalDemand != null && {
            nasaTemporalDemand: Number(nasaTemporalDemand),
          }),
          ...(nasaPerformance != null && {
            nasaPerformance: Number(nasaPerformance),
          }),
          ...(nasaEffort != null && { nasaEffort: Number(nasaEffort) }),
          ...(nasaFrustration != null && {
            nasaFrustration: Number(nasaFrustration),
          }),
          ...(nasaGlobalScore != null && {
            nasaGlobalScore: Number(nasaGlobalScore),
          }),
          ...(nasaWeightingMethod && { nasaWeightingMethod }),
          ...(postDifficultyPerceived != null && {
            postDifficultyPerceived: Number(postDifficultyPerceived),
          }),
          ...(postConcentrationReq != null && {
            postConcentrationReq: Number(postConcentrationReq),
          }),
          ...(postFatigue != null && { postFatigue: Number(postFatigue) }),
          ...(postStress != null && { postStress: Number(postStress) }),
          ...(postDifficultyResponding != null && {
            postDifficultyResponding: Number(postDifficultyResponding),
          }),
          ...(testClear && { testClear }),
          ...(instructionsClear && { instructionsClear }),
          ...(timeSufficient && { timeSufficient }),
          ...(hadDistractions && { hadDistractions }),
          ...(distractionDescription != null && { distractionDescription }),
          ...(hadTechnicalIssues && { hadTechnicalIssues }),
          ...(technicalIssueDesc != null && { technicalIssueDesc }),
          ...(additionalComments != null && { additionalComments }),
          ...(researcherExcessiveHead && { researcherExcessiveHead }),
          ...(researcherTrackingProbs && { researcherTrackingProbs }),
          ...(researcherCalibStable && { researcherCalibStable }),
          ...(researcherInterruptions && { researcherInterruptions }),
          ...(researcherFollowedInstr && { researcherFollowedInstr }),
          ...(excludedFromAnalysis != null && {
            excludedFromAnalysis: Boolean(excludedFromAnalysis),
          }),
          ...(exclusionReason && { exclusionReason }),
          dataQualityPercent,
          dataLostPercent,
          trialsExcludedCount: trialsExcluded,
        },
      });

      // 6. Audit log entry
      await tx.auditLog.create({
        data: {
          participantId,
          sessionId,
          action: 'session_complete',
          details: `Sesión completada: ${createdTrials.length} ensayos, calidad ${dataQualityPercent}%, excluidos: ${trialsExcluded}`,
        },
      });

      return createdTrials.length;
    });

    return NextResponse.json({ success: true, sessionId, trialCount: createdTrialCount });
  } catch (error) {
    console.error('Error completando sesión:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
