import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/researchers — List active researchers
export async function GET() {
  try {
    const researchers = await db.researcher.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        institution: true,
        active: true,
      },
    })
    return NextResponse.json(researchers)
  } catch (error) {
    console.error('Error obteniendo investigadores:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST /api/researchers — Create researcher with auto-incremental code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, phone, institution } = body as {
      name?: string
      email?: string
      phone?: string
      institution?: string
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    // Generate auto-incremental code based on count
    const count = await db.researcher.count()
    const code = `INV-${String(count + 1).padStart(3, '0')}`

    const researcher = await db.researcher.create({
      data: {
        code,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        institution: institution?.trim() || null,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'researcher_create',
        details: `Investigador creado: ${code} — ${name.trim()}`,
      },
    })

    return NextResponse.json(researcher, { status: 201 })
  } catch (error) {
    console.error('Error creando investigador:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
