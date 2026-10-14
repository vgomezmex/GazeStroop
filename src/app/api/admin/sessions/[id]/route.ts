import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

// PATCH /api/admin/sessions/[id] — Marcar/desmarcar una sesión como excluida
// del análisis, con motivo. Antes no existía ninguna forma de escribir estos
// campos (excludedFromAnalysis/exclusionReason existían en la BD y se
// mostraban en el panel, pero nunca se podían establecer) — el tester lo
// reportó como "excluido_analisis permanece en 0, razon_exclusion vacío".
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params
    const body = await request.json()
    const { excludedFromAnalysis, exclusionReason } = body as {
      excludedFromAnalysis?: boolean
      exclusionReason?: string | null
    }

    if (typeof excludedFromAnalysis !== 'boolean') {
      return NextResponse.json({ error: 'excludedFromAnalysis (boolean) es requerido' }, { status: 400 })
    }
    // Si se marca como excluida, exigir un motivo — evita que
    // razon_exclusion vuelva a quedar vacío por descuido.
    if (excludedFromAnalysis && !exclusionReason?.trim()) {
      return NextResponse.json({ error: 'Debes indicar un motivo para excluir la sesión' }, { status: 400 })
    }

    const existing = await db.session.findUnique({ where: { id }, select: { id: true, studyCode: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const updated = await db.session.update({
      where: { id },
      data: {
        excludedFromAnalysis,
        exclusionReason: excludedFromAnalysis ? exclusionReason!.trim() : null,
      },
      select: { id: true, excludedFromAnalysis: true, exclusionReason: true },
    })

    await db.auditLog.create({
      data: {
        sessionId: id,
        action: excludedFromAnalysis ? 'session_exclude' : 'session_include',
        details: excludedFromAnalysis
          ? `Sesión ${existing.studyCode} excluida del análisis: ${exclusionReason}`
          : `Sesión ${existing.studyCode} reincluida en el análisis`,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error actualizando exclusión de sesión:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE /api/admin/sessions/[id] — Delete a session and all related data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params

    const session = await db.session.findUnique({
      where: { id },
      select: { id: true, studyCode: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    // Delete in correct order to handle foreign key constraints:
    // 1. FeatureStore (no cascade, required FK)
    // 2. AuditLog (null out sessionId)
    // 3. EyeTrackingSample (cascade, but delete explicitly for safety)
    // 4. Trial (cascade, but delete explicitly for safety)
    // 5. Session
    await db.$transaction([
      // Null out sessionId in audit logs
      db.auditLog.updateMany({
        where: { sessionId: id },
        data: { sessionId: null },
      }),
      // Delete feature store entries
      db.featureStore.deleteMany({
        where: { sessionId: id },
      }),
      // Delete eye tracking samples
      db.eyeTrackingSample.deleteMany({
        where: { sessionId: id },
      }),
      // Delete trials
      db.trial.deleteMany({
        where: { sessionId: id },
      }),
      // Delete the session itself
      db.session.delete({
        where: { id },
      }),
    ])

    // Audit log for the deletion (after the transaction)
    await db.auditLog.create({
      data: {
        action: 'session_delete',
        details: `Sesión eliminada: ${session.studyCode}`,
      },
    })

    return NextResponse.json({ success: true, studyCode: session.studyCode })
  } catch (error) {
    console.error('Error eliminando sesión:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
