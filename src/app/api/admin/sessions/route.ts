import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    const where: Record<string, unknown> = {};

    if (search) {
      where.studyCode = { contains: search };
    }

    if (from || to) {
      where.startedAt = {} as Record<string, Date>;
      if (from) {
        (where.startedAt as Record<string, Date>).gte = new Date(from);
      }
      if (to) {
        (where.startedAt as Record<string, Date>).lte = new Date(to);
      }
    }

    const sessions = await db.session.findMany({
      where,
      include: { participant: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error obteniendo sesiones:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
