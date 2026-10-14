import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/session/abandon — El participante puede abandonar el
// experimento en cualquier momento (derecho a retirarse del consentimiento
// informado). Ruta pública (sin requireAdmin): la llama el propio
// participante, no un investigador autenticado.
//
// Si ya existe una sesión (se crea desde /api/participant, antes de
// calibración), se marca como completada-pero-excluida — así el
// investigador SÍ la ve en su lista de sesiones (sabe que alguien empezó y
// se retiró), pero queda automáticamente señalada para excluirse de
// cualquier análisis, sin necesidad de que nadie la revise manualmente.
// Si todavía no existe sesión (el participante se retira desde la pantalla
// de consentimiento, antes de llenar el formulario), no hay nada que
// marcar en la base de datos — la petición simplemente no hace nada.
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()
    if (!sessionId) {
      // Se retiró antes de que existiera una sesión — no es un error.
      return NextResponse.json({ ok: true, marked: false })
    }

    const session = await db.session.findUnique({ where: { id: sessionId } })
    if (!session) {
      return NextResponse.json({ ok: true, marked: false })
    }
    if (session.completedAt) {
      // Ya se había completado normalmente antes de que este botón se
      // presionara (carrera improbable, pero por si acaso) — no la tocamos.
      return NextResponse.json({ ok: true, marked: false })
    }

    await db.session.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        excludedFromAnalysis: true,
        exclusionReason: 'Abandonado por el participante durante la sesión',
      },
    })

    await db.auditLog.create({
      data: {
        sessionId,
        action: 'session_abandoned',
        details: `Sesión ${sessionId} abandonada por el participante`,
      },
    })

    return NextResponse.json({ ok: true, marked: true })
  } catch (error) {
    console.error('Error marcando sesión como abandonada:', error)
    // No bloqueamos la salida del participante aunque falle el guardado.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
