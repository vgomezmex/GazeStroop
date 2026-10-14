import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const [totalParticipants, totalSessions, completedSessions, excludedSessions] =
      await Promise.all([
        db.participant.count(),
        db.session.count(),
        db.session.count({ where: { completedAt: { not: null } } }),
        db.session.count({ where: { excludedFromAnalysis: true } }),
      ]);

    return NextResponse.json({
      totalParticipants,
      totalSessions,
      completedSessions,
      excludedSessions,
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
