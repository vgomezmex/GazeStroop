'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import SessionDetailDialog from './SessionDetailDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { ArrowLeft, Search, Eye, XCircle, Trash2, Loader2, Download } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Matches the raw Prisma Session object returned by /api/admin/sessions
// (with `participant` included via `include: { participant: true }`)
interface SessionRow {
  id: string
  participantId: string
  researcherId: string | null
  studyCode: string
  researcherCode: string
  startedAt: string | Date
  completedAt: string | Date | null
  calibrationStatus: string
  calibrationErrorDeg: number | null
  nasaMentalDemand: number | null
  nasaPhysicalDemand: number | null
  nasaTemporalDemand: number | null
  nasaPerformance: number | null
  nasaEffort: number | null
  nasaFrustration: number | null
  nasaGlobalScore: number | null
  excludedFromAnalysis: boolean
  exclusionReason: string | null
  dataQualityPercent: number | null
  dataLostPercent: number | null
  trialsExcludedCount: number
  createdAt: string | Date
  updatedAt: string | Date
  // Included relation
  participant: {
    id: string
    studyCode: string
    createdAt: string | Date
    updatedAt: string | Date
  } | null
}

export default function AdminSessions() {
  const { goBack } = useAppStore()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/admin/sessions')
        if (!res.ok) throw new Error('Error al cargar sesiones')
        const data = await res.json()
        setSessions(Array.isArray(data) ? data : data.sessions ?? [])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cargar sesiones')
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  const safeFormatDate = (d: string | Date | null) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  const getSessionStatus = (s: SessionRow): string => {
    if (s.completedAt) return 'completed'
    return 'in_progress'
  }

  const filtered = sessions.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const dateStr = safeFormatDate(s.startedAt).toLowerCase()
    const participantCode = s.participant?.studyCode ?? ''
    return (
      s.studyCode.toLowerCase().includes(q) ||
      participantCode.toLowerCase().includes(q) ||
      s.researcherCode.toLowerCase().includes(q) ||
      dateStr.includes(q)
    )
  })

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100">Completada</Badge>
      case 'in_progress':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">En progreso</Badge>
      case 'abandoned':
        return <Badge className="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 hover:bg-stone-100">Abandonada</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const refreshSessions = async () => {
    try {
      const res = await fetch('/api/admin/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(Array.isArray(data) ? data : data.sessions ?? [])
      }
    } catch {}
  }

  const handleDeleteSession = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/sessions/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast.success(`Sesión ${deleteTarget.studyCode} eliminada`)
      setDeleteTarget(null)
      setDialogOpen(false)
      setSelectedSession(null)
      await refreshSessions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar sesión')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Sesiones</h1>
          <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, investigador o fecha…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Código sesión</TableHead>
                    <TableHead className="hidden md:table-cell">Participante</TableHead>
                    <TableHead className="hidden lg:table-cell">Investigador</TableHead>
                    <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Calibración</TableHead>
                    <TableHead className="hidden lg:table-cell">NASA-TLX</TableHead>
                    <TableHead>Excluida</TableHead>
                    <TableHead className="w-[150px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No se encontraron sesiones
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((session) => {
                      const status = getSessionStatus(session)
                      return (
                        <TableRow key={session.id} className={session.excludedFromAnalysis ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}>
                          <TableCell className="font-mono text-xs font-medium">{session.studyCode}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="font-medium font-mono text-xs">{session.participant?.studyCode ?? '—'}</p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <p className="font-mono text-xs text-muted-foreground">{session.researcherCode || '—'}</p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                            {safeFormatDate(session.startedAt)}
                          </TableCell>
                          <TableCell>{statusBadge(status)}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge
                              variant="outline"
                              className={
                                session.calibrationStatus === 'success'
                                  ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                                  : session.calibrationStatus === 'failed'
                                    ? 'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-400'
                                    : ''
                              }
                            >
                              {session.calibrationStatus === 'success'
                                ? `${session.calibrationErrorDeg ?? '—'}°`
                                : session.calibrationStatus || '—'
                              }
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {session.nasaGlobalScore != null ? session.nasaGlobalScore : '—'}
                          </TableCell>
                          <TableCell>
                            {session.excludedFromAnalysis ? (
                              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100">
                                <XCircle className="h-3 w-3 mr-1" />
                                Sí
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setSelectedSession(session)
                                  setDialogOpen(true)
                                }}
                                title="Ver detalle"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={downloadingId === session.id}
                                onClick={async () => {
                                  setDownloadingId(session.id)
                                  try {
                                    const res = await fetch(`/api/admin/export?format=individual&session=${session.id}`)
                                    if (!res.ok) throw new Error('Error al generar CSV')
                                    const blob = await res.blob()
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `${session.studyCode}_individual.csv`
                                    document.body.appendChild(a)
                                    a.click()
                                    document.body.removeChild(a)
                                    URL.revokeObjectURL(url)
                                    toast.success(`CSV de ${session.studyCode} descargado`)
                                  } catch {
                                    toast.error('Error al descargar CSV')
                                  } finally {
                                    setDownloadingId(null)
                                  }
                                }}
                                title="Descargar CSV individual"
                              >
                                {downloadingId === session.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-destructive hover:text-destructive text-xs"
                                onClick={() => setDeleteTarget(session)}
                                title="Eliminar sesión"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Eliminar</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Session Detail Dialog — full results report */}
      <SessionDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sessionId={selectedSession?.id ?? null}
        studyCode={selectedSession?.studyCode ?? ''}
      />

      {/* Delete Session Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la sesión <strong>{deleteTarget?.studyCode}</strong> y toda su
              información asociada (ensayos, datos de seguimiento ocular, etc.).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
