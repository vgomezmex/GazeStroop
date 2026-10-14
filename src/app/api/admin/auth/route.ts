import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '@/lib/adminAuth';

// Basic in-memory rate limiting per IP to slow down code-guessing attempts.
// Not a substitute for a real WAF/rate limiter, but stops trivial brute force.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código requerido' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { code } });

    if (!admin || !admin.active) {
      return NextResponse.json(
        { error: 'Código inválido' },
        { status: 401 }
      );
    }

    await db.admin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'login',
        details: 'Inicio de sesión de administrador',
        ipAddress: ip !== 'unknown' ? ip : null,
      },
    });

    const token = createSessionToken(admin);
    const response = NextResponse.json({
      success: true,
      name: admin.name,
      role: admin.role,
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('Error en admin auth:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // Logout — clears the session cookie. Best-effort audit log if we can
  // still identify the admin from the (about-to-expire) cookie.
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
