import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/adminAuth'

const BACKUPS_DIR = path.join(process.cwd(), 'backups')

// GET /api/admin/experiment/backup/[filename] — Download a backup file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const { filename } = await params

    if (!/^backup-[^/]+\.json$/.test(filename)) {
      return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 })
    }

    const filepath = path.join(BACKUPS_DIR, filename)
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: 'Respaldo no encontrado' }, { status: 404 })
    }

    const fileBuffer = fs.readFileSync(filepath)
    const stat = fs.statSync(filepath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size),
      },
    })
  } catch (error) {
    console.error('Error downloading backup:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE /api/admin/experiment/backup/[filename] — Delete a backup file
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const { filename } = await params

    if (!/^backup-[^/]+\.json$/.test(filename)) {
      return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 })
    }

    const filepath = path.join(BACKUPS_DIR, filename)
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: 'Respaldo no encontrado' }, { status: 404 })
    }

    fs.unlinkSync(filepath)
    return NextResponse.json({ success: true, message: `Respaldo ${filename} eliminado` })
  } catch (error) {
    console.error('Error deleting backup:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
