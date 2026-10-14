import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface IncomingSample {
  timestamp: number // tracker-relative seconds (TIME field from Gazepoint)
  timestampSystem?: number | null
  timestampTracker?: number | null // CNT field
  gazeX?: number | null
  gazeY?: number | null
  gazeValid?: boolean
  fpogX?: number | null
  fpogY?: number | null
  fpogS?: number | null
  fpogD?: number | null
  fpogValid?: boolean
  pupilDiameterLeft?: number | null
  pupilDiameterRight?: number | null
  pupilValid?: boolean
  lpmmValid?: boolean
  rpmmValid?: boolean
  lpcX?: number | null
  lpcY?: number | null
  lpd?: number | null
  lps?: number | null
  lpv?: boolean
  rpcX?: number | null
  rpcY?: number | null
  rpd?: number | null
  rps?: number | null
  rpv?: boolean
  eventType?: string
  fixationId?: number | null
  bkid?: number | null
  bkdur?: number | null
  bkpmin?: number | null
  dial?: number | null
  dialValid?: boolean
}

const MAX_BATCH = 5000; // ~80s of data at 60Hz — plenty for any single flush

// POST /api/eyetracking/batch — bulk-insert raw gaze/pupil samples.
// This is the endpoint the browser-side useEyeTracker hook flushes to
// every ~1s (or on trial end). Written this way — batched inserts, not
// one request per 60Hz sample — because a single-row-per-sample approach
// would mean ~60 HTTP requests/sec per participant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, trialId, phase, samples } = body as {
      sessionId: string
      trialId: string | null
      phase: 'trial' | 'baseline' | 'calibration'
      samples: IncomingSample[]
    };

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
    }
    if (!Array.isArray(samples) || samples.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }
    if (samples.length > MAX_BATCH) {
      return NextResponse.json({ error: `Lote demasiado grande (max ${MAX_BATCH})` }, { status: 400 });
    }

    const session = await db.session.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
    }

    // If a trialId was supplied, verify it actually belongs to this session
    // (defense against a stale/mismatched client state writing samples to
    // the wrong trial).
    if (trialId) {
      const trial = await db.trial.findUnique({ where: { id: trialId }, select: { sessionId: true } });
      if (!trial || trial.sessionId !== sessionId) {
        return NextResponse.json({ error: 'trialId inválido para esta sesión' }, { status: 400 });
      }
    }

    const data = samples.map((s) => {
      const left = s.pupilDiameterLeft ?? null;
      const right = s.pupilDiameterRight ?? null;
      const mean =
        left != null && right != null
          ? (left + right) / 2
          : left ?? right ?? null;

      return {
        sessionId,
        trialId: trialId || null,
        phase: phase || 'trial',
        timestamp: Number(s.timestamp),
        timestampSystem: s.timestampSystem != null ? Number(s.timestampSystem) : null,
        timestampTracker: s.timestampTracker != null ? Number(s.timestampTracker) : null,
        gazeX: s.gazeX ?? null,
        gazeY: s.gazeY ?? null,
        gazeValid: s.gazeValid ?? true,
        fpogX: s.fpogX ?? null,
        fpogY: s.fpogY ?? null,
        fpogS: s.fpogS ?? null,
        fpogD: s.fpogD ?? null,
        fpogValid: s.fpogValid ?? true,
        pupilDiameterLeft: left,
        pupilDiameterRight: right,
        pupilDiameter: mean,
        pupilValid: s.pupilValid ?? true,
        lpmmValid: s.lpmmValid ?? true,
        rpmmValid: s.rpmmValid ?? true,
        lpcX: s.lpcX ?? null,
        lpcY: s.lpcY ?? null,
        lpd: s.lpd ?? null,
        lps: s.lps ?? null,
        lpv: s.lpv ?? true,
        rpcX: s.rpcX ?? null,
        rpcY: s.rpcY ?? null,
        rpd: s.rpd ?? null,
        rps: s.rps ?? null,
        rpv: s.rpv ?? true,
        fixationId: s.fixationId ?? null,
        eventType: s.eventType || 'none',
        bkid: s.bkid ?? null,
        bkdur: s.bkdur ?? null,
        bkpmin: s.bkpmin ?? null,
        dial: s.dial ?? null,
        dialValid: s.dialValid ?? false,
      };
    });

    const result = await db.eyeTrackingSample.createMany({ data });

    return NextResponse.json({ success: true, inserted: result.count });
  } catch (error) {
    console.error('Error guardando muestras de eye-tracking:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
