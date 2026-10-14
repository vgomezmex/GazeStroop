'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Users,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Settings,
  FileDown,
  BarChart3,
  ScrollText,
  LogOut,
  ArrowLeft,
  Shield,
  UserCog,
  FlaskConical,
  Download,
  Trash2,
  Loader2,
  Archive,
  AlertTriangle,
  Database,
  Eye as EyeIcon,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface DashboardStats {
  totalParticipants: number
  totalSessions: number
  completedSessions: number
  excludedSessions: number
}

interface ExperimentData {
  currentData: {
    participants: number
    sessions: number
    completedSessions: number
    trials: number
    eyeTrackingSamples: number
  }
  backups: BackupItem[]
  hasData: boolean
}

interface BackupItem {
  id: string
  name: string
  createdAt: string
  stats: {
    participants: number
    sessions: number
    completedSessions: number
    trials: number
    eyeTrackingSamples: number
  }
  filename: string
  sizeBytes: number
}

const NAV_ITEMS = [
  { label: 'Investigadores', icon: UserCog, state: 'ADMIN_RESEARCHERS' as const, color: 'text-violet-600 dark:text-violet-400' },
  { label: 'Sesiones', icon: ClipboardList, state: 'ADMIN_SESSIONS' as const, color: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'Configuración', icon: Settings, state: 'ADMIN_CONFIG' as const, color: 'text-amber-600 dark:text-amber-400' },
  { label: 'Exportar datos', icon: FileDown, state: 'ADMIN_EXPORT' as const, color: 'text-rose-600 dark:text-rose-400' },
  { label: 'Visualizaciones', icon: BarChart3, state: 'ADMIN_VISUALIZATIONS' as const, color: 'text-cyan-600 dark:text-cyan-400' },
  { label: 'Auditoría', icon: ScrollText, state: 'ADMIN_AUDIT' as const, color: 'text-stone-600 dark:text-stone-400' },
]

const STAT_CARDS = [
  { key: 'totalParticipants' as const, label: 'Total participantes', icon: Users, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  { key: 'totalSessions' as const, label: 'Total sesiones', icon: ClipboardList, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  { key: 'completedSessions' as const, label: 'Sesiones completadas', icon: CheckCircle2, color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' },
  { key: 'excludedSessions' as const, label: 'Sesiones excluidas', icon: XCircle, color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminDashboard() {
  const { setAppState, logoutAdmin, adminName, adminRole, goBack } = useAppStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // New experiment dialog state
  const [showNewExpDialog, setShowNewExpDialog] = useState(false)
  const [expData, setExpData] = useState<ExperimentData | null>(null)
  const [expName, setExpName] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [resetting, setResetting] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard')
      if (!res.ok) throw new Error('Error al cargar estadísticas')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // fetchStats() solo llama a setState después del `await fetch(...)`, nunca de forma
    // síncrona; es el patrón estándar de "fetch on mount". Falso positivo conocido de esta regla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
  }, [fetchStats])

  const openNewExperiment = async () => {
    try {
      const res = await fetch('/api/admin/experiment/reset')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setExpData(data)
      setExpName(`Experimento ${new Date().toLocaleDateString('es-MX')}`)
      setShowNewExpDialog(true)
    } catch {
      toast.error('Error al cargar información del experimento')
    }
  }

  const handleReset = async () => {
    if (!expData?.hasData) return
    setResetting(true)
    try {
      const res = await fetch('/api/admin/experiment/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimentName: expName || undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al reiniciar')
      }
      const result = await res.json()
      toast.success(result.message)
      setShowConfirmDialog(false)
      setShowNewExpDialog(false)
      fetchStats() // refresh dashboard stats
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setResetting(false)
    }
  }

  const handleDownloadBackup = (filename: string) => {
    const link = document.createElement('a')
    link.href = `/api/admin/experiment/backup/${encodeURIComponent(filename)}`
    link.download = filename
    link.click()
  }

  const handleDeleteBackup = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/experiment/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Respaldo eliminado')
      // Refresh experiment data
      const refresh = await fetch('/api/admin/experiment/reset')
      if (refresh.ok) setExpData(await refresh.json())
    } catch {
      toast.error('Error al eliminar respaldo')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Panel de Administración</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                {adminName} · <Badge variant="secondary" className="text-xs">{adminRole}</Badge>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={openNewExperiment} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <FlaskConical className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo Experimento</span>
            </Button>
            <Button variant="outline" onClick={() => fetch('/api/admin/auth', { method: 'DELETE' }).finally(logoutAdmin)} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-8">
        {/* Stat Cards */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Resumen general</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STAT_CARDS.map((stat) => (
              <Card key={stat.key}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <div className={`rounded-full p-2 ${stat.color}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">
                      {stats?.[stat.key] ?? 0}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Navigation */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Navegación</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {NAV_ITEMS.map((item) => (
              <Card
                key={item.state}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => setAppState(item.state)}
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={`rounded-full p-3 bg-muted ${item.color}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{item.label}</p>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* ===== New Experiment Dialog ===== */}
      <Dialog open={showNewExpDialog} onOpenChange={(open) => { if (!open) setShowNewExpDialog(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-emerald-600" />
              Nuevo Experimento
            </DialogTitle>
            <DialogDescription>
              Respalda los datos actuales y limpia el entorno para comenzar un nuevo experimento.
            </DialogDescription>
          </DialogHeader>

          {expData && (
            <div className="space-y-5">
              {/* Current data summary */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Datos actuales que se respaldarán
                </h3>
                {!expData.hasData ? (
                  <p className="text-sm text-muted-foreground">No hay datos de experimento. Se creará un respaldo vacío.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{expData.currentData.participants}</p>
                      <p className="text-xs text-muted-foreground">Participantes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{expData.currentData.sessions}</p>
                      <p className="text-xs text-muted-foreground">Sesiones</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{expData.currentData.completedSessions}</p>
                      <p className="text-xs text-muted-foreground">Completadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{expData.currentData.trials.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Ensayos</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{expData.currentData.eyeTrackingSamples.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Muestras oculares</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Experiment name */}
              <div className="space-y-2">
                <Label htmlFor="exp-name">Nombre del experimento actual (para el respaldo)</Label>
                <Input
                  id="exp-name"
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  placeholder="Ej: Estudio piloto Stroop - Agosto 2025"
                />
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1.5">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Información importante
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 ml-6 list-disc">
                  <li>Se creará un respaldo JSON con <strong>todos</strong> los datos actuales</li>
                  <li>Se eliminarán participantes, sesiones, ensayos y datos oculares</li>
                  <li>Investigadores, configuración y auditoría se <strong>conservan</strong></li>
                  <li>Los respaldos pueden descargarse en cualquier momento</li>
                </ul>
              </div>

              {/* Previous backups */}
              {expData.backups.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Archive className="h-4 w-4" />
                    Respaldos anteriores ({expData.backups.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-lg p-2">
                    {expData.backups.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{b.name}</p>
                          <p className="text-muted-foreground">
                            {formatDate(b.createdAt)} · {formatBytes(b.sizeBytes)}
                            <span className="ml-1.5">
                              ({b.stats.participants}P, {b.stats.sessions}S, {b.stats.trials.toLocaleString()}E)
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDownloadBackup(b.filename)}
                            title="Descargar respaldo"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteBackup(b.filename)}
                            title="Eliminar respaldo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNewExpDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => setShowConfirmDialog(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!expData?.hasData}
            >
              <FlaskConical className="h-4 w-4" />
              {!expData?.hasData ? 'No hay datos que respaldar' : 'Respaldar y Reiniciar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirm Reset Dialog ===== */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              ¿Confirmar reinicio de experimento?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se respaldarán los datos actuales como <strong>&quot;{expName}&quot;</strong> y se eliminarán
                  todos los participantes, sesiones y ensayos.
                </p>
                <p className="text-muted-foreground">
                  Esta acción no se puede deshacer, pero el respaldo quedará guardado para descarga futura.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleReset() }}
              disabled={resetting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sí, respaldar y reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
