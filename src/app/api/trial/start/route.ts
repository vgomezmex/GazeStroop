import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/trial/start — Create the Trial row the moment a stimulus is
// presented, *before* the participant responds. This is what makes it
// possible to attach real-time eye-tracking samples (captured while the
// trial is still in progress) to a real trialId via foreign key.
//
// The row is completed/updated later, either by /api/session/complete
// (normal end-of-session flush) or implicitly if the session is abandoned
// (in which case the trial simply stays without a response — still useful
// data since eye-tracking samples were preserved).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      blockOrder,
      condition,
      congruency,
      stimulusWord,
      stimulusInkColorHex,
      stimulusInkColorName,
      correctAnswer,
      correctRoiPosition,
      distractorColors,
      isPractice,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
    }

    // Practice trials are never persisted (matches session/complete behavior).
    if (isPractice) {
      return NextResponse.json({ success: true, trialId: null, skipped: true });
    }

    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
    }

    const trial = await db.trial.create({
      data: {
        sessionId,
        blockOrder: Number(blockOrder) || 0,
        condition: condition || '',
        congruency: congruency || '',
        stimulusWord: stimulusWord || '',
        stimulusInkColorHex: stimulusInkColorHex || '',
        stimulusInkColorName: stimulusInkColorName || '',
        correctAnswer: correctAnswer || '',
        correctRoiPosition: correctRoiPosition || '',
        distractorColors: distractorColors
          ? typeof distractorColors === 'string'
            ? distractorColors
            : JSON.stringify(distractorColors)
          : '[]',
        isPractice: false,
        accuracy: 'pending',
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, trialId: trial.id });
  } catch (error) {
    console.error('Error creando trial:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
