import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studyCode } = body;

    // Only update an existing participant — never create one.
    // Participants are created exclusively by POST /api/participant.
    if (!studyCode) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const existing = await db.participant.findUnique({
      where: { studyCode },
    });

    if (!existing) {
      // No participant yet — skip silently.
      // The participant will be created on final form submission.
      return NextResponse.json({ success: true, skipped: true });
    }

    // Update existing participant draft data
    const {
      fullName, age, sex, education, computerHoursPerDay,
      glassesUse, visualDifficulty, visualDifficultyDesc,
      hoursSleepLastNight, sleepQuality, currentRestLevel, currentFatigueLevel,
      stateFatigue, stateStress, stateSleepiness, stateMotivation, stateConcentration,
      caffeineLast3h, caffeineType, caffeineAmount, caffeineTime,
      alcoholLast12h, exerciseLast3h,
      lastMealTime, locationComfort,
    } = body;

    await db.participant.update({
      where: { studyCode },
      data: {
        ...(fullName && { fullName }),
        ...(age != null && { age: Number(age) }),
        ...(sex && { sex }),
        ...(education && { education }),
        ...(computerHoursPerDay && { computerHoursPerDay }),
        ...(glassesUse && { glassesUse }),
        ...(visualDifficulty && { visualDifficulty }),
        ...(visualDifficultyDesc != null && { visualDifficultyDesc }),
        ...(hoursSleepLastNight != null && { hoursSleepLastNight: Number(hoursSleepLastNight) }),
        ...(sleepQuality != null && { sleepQuality: Number(sleepQuality) }),
        ...(currentRestLevel != null && { currentRestLevel: Number(currentRestLevel) }),
        ...(currentFatigueLevel != null && { currentFatigueLevel: Number(currentFatigueLevel) }),
        ...(stateFatigue != null && { stateFatigue: Number(stateFatigue) }),
        ...(stateStress != null && { stateStress: Number(stateStress) }),
        ...(stateSleepiness != null && { stateSleepiness: Number(stateSleepiness) }),
        ...(stateMotivation != null && { stateMotivation: Number(stateMotivation) }),
        ...(stateConcentration != null && { stateConcentration: Number(stateConcentration) }),
        ...(caffeineLast3h && { caffeineLast3h }),
        ...(caffeineType != null && { caffeineType }),
        ...(caffeineAmount != null && { caffeineAmount }),
        ...(caffeineTime != null && { caffeineTime }),
        ...(alcoholLast12h && { alcoholLast12h }),
        ...(exerciseLast3h && { exerciseLast3h }),
        ...(lastMealTime != null && { lastMealTime }),
        ...(locationComfort && { locationComfort }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error guardando borrador:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
