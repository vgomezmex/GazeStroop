import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function generateStudyCode(): string {
  const now = Date.now();
  const last4 = String(now).slice(-4);
  const random3 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `P-${last4}-${random3}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studyCode: providedStudyCode,
      researcherCode,
      fullName, age, sex, education, computerHoursPerDay,
      glassesUse, visualDifficulty, visualDifficultyDesc,
      hoursSleepLastNight, sleepQuality, currentRestLevel, currentFatigueLevel,
      stateFatigue, stateStress, stateSleepiness, stateMotivation, stateConcentration,
      caffeineLast3h, caffeineType, caffeineAmount, caffeineTime,
      alcoholLast12h, exerciseLast3h,
      lastMealTime, locationComfort,
      consentVersion,
      calibrationStatus, calibrationErrorDeg, calibrationTimestamp,
    } = body;

    // Generate a unique study code
    let studyCode = providedStudyCode || generateStudyCode();
    let existing = await db.participant.findUnique({ where: { studyCode } });
    let attempts = 0;
    while (existing && attempts < 5) {
      studyCode = generateStudyCode();
      existing = await db.participant.findUnique({ where: { studyCode } });
      attempts++;
    }

    // Use transaction to ensure participant + session are created atomically
    const result = await db.$transaction(async (tx) => {
      const participant = await tx.participant.create({
        data: {
          studyCode,
          fullName: fullName || '',
          age: Number(age),
          sex,
          education,
          computerHoursPerDay,
          glassesUse: glassesUse || 'No',
          visualDifficulty: visualDifficulty || 'No',
          visualDifficultyDesc: visualDifficultyDesc || null,
          hoursSleepLastNight: Number(hoursSleepLastNight),
          sleepQuality: Number(sleepQuality),
          currentRestLevel: Number(currentRestLevel),
          currentFatigueLevel: Number(currentFatigueLevel),
          stateFatigue: Number(stateFatigue),
          stateStress: Number(stateStress),
          stateSleepiness: Number(stateSleepiness),
          stateMotivation: Number(stateMotivation),
          stateConcentration: Number(stateConcentration),
          caffeineLast3h: caffeineLast3h || 'No',
          caffeineType: caffeineType || null,
          caffeineAmount: caffeineAmount || null,
          caffeineTime: caffeineTime || null,
          alcoholLast12h: alcoholLast12h || 'No',
          exerciseLast3h: exerciseLast3h || 'No',
          lastMealTime: lastMealTime || null,
          locationComfort: locationComfort || 'Sí',
          consentVersion: consentVersion || '1.0',
          consentAcceptedAt: new Date(),
        },
      });

      const session = await tx.session.create({
        data: {
          participantId: participant.id,
          studyCode,
          researcherCode: researcherCode || '',
          calibrationStatus: calibrationStatus || 'pending',
          calibrationErrorDeg: calibrationErrorDeg != null ? Number(calibrationErrorDeg) : null,
          calibrationTimestamp: calibrationTimestamp ? new Date(calibrationTimestamp) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          participantId: participant.id,
          sessionId: session.id,
          action: 'participant_create',
          details: `Participante creado: ${studyCode}`,
        },
      });

      return { participantId: participant.id, sessionId: session.id, studyCode };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error creando participante:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
