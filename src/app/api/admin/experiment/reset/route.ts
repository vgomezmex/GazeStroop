import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/adminAuth'

const BACKUPS_DIR = path.join(process.cwd(), 'backups')

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  }
}

// GET /api/admin/experiment/reset — Preview what would be backed up + reset
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const [participantCount, sessionCount, completedCount, trialCount, sampleCount, backups] = await Promise.all([
      db.participant.count(),
      db.session.count(),
      db.session.count({ where: { completedAt: { not: null } } }),
      db.trial.count(),
      db.eyeTrackingSample.count(),
      getBackupsList(),
    ])

    return NextResponse.json({
      currentData: {
        participants: participantCount,
        sessions: sessionCount,
        completedSessions: completedCount,
        trials: trialCount,
        eyeTrackingSamples: sampleCount,
      },
      backups,
      hasData: participantCount > 0 || sessionCount > 0,
    })
  } catch (error) {
    console.error('Error getting experiment info:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST /api/admin/experiment/reset — Backup and reset experiment data
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await request.json()
    const { experimentName } = body as { experimentName?: string }

    const name = experimentName?.trim() || `Experimento ${new Date().toLocaleDateString('es-MX')}`

    // 1. Export all experiment data before clearing
    ensureBackupsDir()

    const participants = await db.participant.findMany({
      include: {
        sessions: {
          include: {
            trials: {
              include: {
                eyeTrackingSamples: true,
                features: true,
              },
            },
            researcher: { select: { code: true, name: true } },
          },
        },
        features: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const trialCount = participants.reduce((sum, p) =>
      sum + p.sessions.reduce((s2, sess) => s2 + sess.trials.length, 0), 0)
    const sampleCount = participants.reduce((sum, p) =>
      sum + p.sessions.reduce((s2, sess) =>
        s2 + sess.trials.reduce((s3, t) => s3 + t.eyeTrackingSamples.length, 0), 0), 0)
    const completedSessions = participants.reduce((sum, p) =>
      sum + p.sessions.filter(s => s.completedAt !== null).length, 0)

    // 2. Create backup file
    const backupId = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${backupId}.json`
    const filepath = path.join(BACKUPS_DIR, filename)

    const backupData = {
      _meta: {
        id: backupId,
        name,
        exportedAt: new Date().toISOString(),
        version: '1.0',
        stats: {
          participants: participants.length,
          sessions: participants.reduce((s, p) => s + p.sessions.length, 0),
          completedSessions,
          trials: trialCount,
          eyeTrackingSamples: sampleCount,
        },
      },
      participants,
    }

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8')
    const sizeBytes = fs.statSync(filepath).size

    // 3. Clear experiment data in correct order (respect FK constraints)
    await db.featureStore.deleteMany({})
    await db.eyeTrackingSample.deleteMany({})
    await db.trial.deleteMany({})
    await db.session.deleteMany({})
    await db.participant.deleteMany({})

    // 4. Null out experiment FKs in audit log
    await db.auditLog.updateMany({
      data: { participantId: null, sessionId: null },
    })

    // 5. Log the reset action
    await db.auditLog.create({
      data: {
        action: 'experiment_reset',
        details: `Nuevo experimento: \"${name}\" — Respaldo: ${filename} (${participants.length} participantes, ${trialCount} ensayos)`,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Experimento reiniciado. Respaldo guardado como "${name}"`,
      backup: {
        id: backupId,
        name,
        filename,
        sizeBytes,
        stats: {
          participants: participants.length,
          sessions: participants.reduce((s, p) => s + p.sessions.length, 0),
          completedSessions,
          trials: trialCount,
          eyeTrackingSamples: sampleCount,
        },
      },
    })
  } catch (error) {
    console.error('Error resetting experiment:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al reiniciar experimento' },
      { status: 500 }
    )
  }
}

// Helper: list available backups
async function getBackupsList() {
  try {
    ensureBackupsDir()
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20)

    const backups: Array<{
      id: string
      name: string
      createdAt: string
      stats: { participants: number; sessions: number; completedSessions: number; trials: number; eyeTrackingSamples: number }
      filename: string
      sizeBytes: number
    }> = []
    for (const file of files) {
      try {
        const filepath = path.join(BACKUPS_DIR, file)
        const stat = fs.statSync(filepath)
        const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
        const meta = raw._meta || {}
        backups.push({
          id: meta.id || file,
          name: meta.name || file,
          createdAt: meta.exportedAt || stat.mtime.toISOString(),
          stats: meta.stats || { participants: 0, sessions: 0, completedSessions: 0, trials: 0, eyeTrackingSamples: 0 },
          filename: file,
          sizeBytes: stat.size,
        })
      } catch {
        // skip corrupted
      }
    }
    return backups
  } catch {
    return []
  }
}
