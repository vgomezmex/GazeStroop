import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'admin_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    // Fail loudly rather than silently signing tokens with a guessable default.
    throw new Error(
      'ADMIN_SESSION_SECRET no está configurado. Define esta variable en .env antes de usar el panel de administración.'
    )
  }
  return secret
}

interface SessionPayload {
  adminId: string
  code: string
  name: string
  role: string
  exp: number // epoch ms
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function createSessionToken(admin: { id: string; code: string; name: string; role: string }): string {
  const payload: SessionPayload = {
    adminId: admin.id,
    code: admin.code,
    name: admin.name,
    role: admin.role,
    exp: Date.now() + SESSION_TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(body)
  return `${body}.${sig}`
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expectedSig = sign(body)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function getAdminSession(request: NextRequest): SessionPayload | null {
  const token = request.cookies.get(COOKIE_NAME)?.value
  return verifySessionToken(token)
}

/**
 * Guard for admin API routes. Returns the verified session, or an
 * already-built 401 NextResponse to return immediately from the route.
 *
 * Usage:
 *   const auth = requireAdmin(request)
 *   if (auth instanceof NextResponse) return auth
 *   // auth is now the verified SessionPayload
 */
export function requireAdmin(request: NextRequest): SessionPayload | NextResponse {
  const session = getAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado. Inicia sesión como administrador.' }, { status: 401 })
  }
  return session
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export type { SessionPayload }
