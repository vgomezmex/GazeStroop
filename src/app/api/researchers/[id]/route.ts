import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/researchers/[id] — Update researcher
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const researcherId = parseInt(id, 10)
    if (isNaN(researcherId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { name, email, phone, institution, active } = body as {
      name?: string
      email?: string | null
      phone?: string | null
      institution?: string | null
      active?: boolean
    }

    const existing = await db.researcher.findUnique({ where: { id: researcherId } })
    if (!existing) {
      return NextResponse.json({ error: 'Investigador no encontrado' }, { status: 404 })
    }

    const updated = await db.researcher.update({
      where: { id: researcherId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(institution !== undefined ? { institution: institution?.trim() || null } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'researcher_update',
        details: `Investigador actualizado: ${existing.code}`,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error actualizando investigador:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE /api/researchers/[id] — Soft delete (set active=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const researcherId = parseInt(id, 10)
    if (isNaN(researcherId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.researcher.findUnique({ where: { id: researcherId } })
    if (!existing) {
      return NextResponse.json({ error: 'Investigador no encontrado' }, { status: 404 })
    }

    // Soft delete: set active = false
    const updated = await db.researcher.update({
      where: { id: researcherId },
      data: { active: false },
    })

    await db.auditLog.create({
      data: {
        action: 'researcher_soft_delete',
        details: `Investigador desactivado: ${existing.code} — ${existing.name}`,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error desactivando investigador:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
