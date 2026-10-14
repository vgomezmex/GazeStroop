import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/calibration/points — persist the real per-point calibration
// error reported by the Gazepoint GP3 (one row per calibration target).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, points } = body as {
      sessionId: string
      points: Array<{ pointIndex: number; targetX: number; targetY: number; errorDeg: number | null }>
    };

    if (!sessionId || !Array.isArray(points)) {
      return NextResponse.json({ error: 'sessionId y points requeridos' }, { status: 400 });
    }

    const session = await db.session.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
    }

    // Replace any prior attempt's points (e.g. after a "Recalibrar")
    await db.calibrationPoint.deleteMany({ where: { sessionId } });
    await db.calibrationPoint.createMany({
      data: points.map((p) => ({
        sessionId,
        pointIndex: p.pointIndex,
        targetX: p.targetX,
        targetY: p.targetY,
        errorDeg: p.errorDeg ?? null,
      })),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error guardando puntos de calibración:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
