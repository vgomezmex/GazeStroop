'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Download, Loader2, XCircle, Eye, Brain, BarChart3, AlertTriangle, ShieldOff, ShieldCheck,
} from 'lucide-react'

// ============================================================
// Types matching the API response from /api/admin/sessions/[id]/detail
// ============================================================

interface BlockSummary {
  condition: string
  label: string
  congruency: string
  totalTrials: number
  correctCount: number
  incorrectCount: number
  omissionCount: number
  accuracy: number
  accuracyPercent: number
  rtMean: number
  rtMedian: number
  rtStd: number
  rtIqr: number
  rtCv: number
  anticipatoryCount: number
}

interface SessionDetailData {
  session: {
    id: string
    studyCode: string
    researcherCode: string
    startedAt: string
    completedAt: string | null
    calibrationStatus: string
    calibrationErrorDeg: number | null
    excludedFromAnalysis: boolean
    exclusionReason: string | null
    dataQualityPercent: number | null
    dataLostPercent: number | null
    trialsExcludedCount: number
  }
  participant: { id: string; studyCode: string } | null
  researcher: { id: number; code: string; name: string } | null
  blockSummaries: BlockSummary[]
  interference: {
    interferenceIndex: number
    relativeInterference: number
    accuracyCost: number
  }
  nasaTlx: {
    mentalDemand: number | null
    physicalDemand: number | null
    temporalDemand: number | null
    performance: number | null
    effort: number | null
    frustration: number | null
    globalScore: number | null
  } | null
  dataQuality: {
    totalTrials: number
    validTrials: number
    excludedTrials: number
    dataQualityPercent: number
  }
  postEval: {
    difficultyPerceived: number | null
    concentrationReq: number | null
    fatigue: number | null
    stress: number | null
    difficultyResponding: number | null
  }
  experience: {
    testClear: string | null
    instructionsClear: string | null
    timeSufficient: string | null
    hadDistractions: string | null
    distractionDescription: string | null
    hadTechnicalIssues: string | null
    technicalIssueDesc: string | null
    additionalComments: string | null
  }
  researcherNotes: {
    excessiveHead: string | null
    trackingProbs: string | null
    calibStable: string | null
    interruptions: string | null
    followedInstr: string | null
  }
}

// ============================================================
// Constants
// ============================================================

const CONDITION_COLORS: Record<string, string> = {
  WORD: '#10b981',
  NEUTRAL: '#6366f1',
  COLOR: '#f59e0b',
  REVERSE_STROOP: '#f43f5e',
  STROOP: '#06b6d4',
}

const CONDITION_BG: Record<string, string> = {
  WORD: 'bg-emerald-100 text-emerald-700',
  NEUTRAL: 'bg-indigo-100 text-indigo-700',
  COLOR: 'bg-amber-100 text-amber-700',
  REVERSE_STROOP: 'bg-rose-100 text-rose-700',
  STROOP: 'bg-cyan-100 text-cyan-700',
}

const CONDITION_BORDER: Record<string, string> = {
  WORD: 'border-l-4 border-l-emerald-500',
  NEUTRAL: 'border-l-4 border-l-indigo-500',
  COLOR: 'border-l-4 border-l-amber-500',
  REVERSE_STROOP: 'border-l-4 border-l-rose-500',
  STROOP: 'border-l-4 border-l-cyan-500',
}

function congruencyLabel(c: string) {
  if (c === 'neutral') return 'Neutral'
  return c === 'congruent' ? 'Congruente' : 'Incongruente'
}

function safeFormatDate(d: string | null | undefined) {
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

// ============================================================
// Summary card (matches ResultsReport style)
// ============================================================

function SummaryCard({
  label,
  summary,
  colorClass,
  borderClass,
}: {
  label: string
  summary: BlockSummary
  colorClass: string
  borderClass: string
}) {
  return (
    <Card className={`${borderClass} border-neutral-200 bg-white shadow-sm`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
            {label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-xs text-neutral-400">Precisión</p>
            <p className="text-xl font-bold text-neutral-800">{summary.accuracyPercent.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">RT promedio</p>
            <p className="text-xl font-bold text-neutral-800">{summary.rtMean.toFixed(0)} ms</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Main component
// ============================================================

interface SessionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string | null
  studyCode: string
}

export default function SessionDetailDialog({
  open,
  onOpenChange,
  sessionId,
  studyCode,
}: SessionDetailDialogProps) {
  const [data, setData] = useState<SessionDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [excludeReasonDraft, setExcludeReasonDraft] = useState('')
  const [showExcludeForm, setShowExcludeForm] = useState(false)
  const [savingExclusion, setSavingExclusion] = useState(false)

  useEffect(() => {
    if (!open || !sessionId) {
      // Resetea los datos al cerrar el diálogo (o sin sesión seleccionada);
      // es intencional, no un efecto secundario accidental. Falso positivo
      // conocido de esta regla.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }

    setLoading(true)
    fetch(`/api/admin/sessions/${sessionId}/detail`)
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar datos')
        return res.json()
      })
      .then((d) => setData(d))
      .catch(() => toast.error('Error al cargar los resultados de la sesión'))
      .finally(() => setLoading(false))
  }, [open, sessionId])

  const handleExclude = async () => {
    if (!sessionId || !excludeReasonDraft.trim()) return
    setSavingExclusion(true)
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedFromAnalysis: true, exclusionReason: excludeReasonDraft.trim() }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setData((d) => d ? { ...d, session: { ...d.session, excludedFromAnalysis: updated.excludedFromAnalysis, exclusionReason: updated.exclusionReason } } : d)
      setShowExcludeForm(false)
      setExcludeReasonDraft('')
      toast.success('Sesión marcada como excluida del análisis')
    } catch {
      toast.error('No se pudo marcar la sesión como excluida')
    } finally {
      setSavingExclusion(false)
    }
  }

  const handleReinclude = async () => {
    if (!sessionId) return
    setSavingExclusion(true)
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedFromAnalysis: false }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setData((d) => d ? { ...d, session: { ...d.session, excludedFromAnalysis: updated.excludedFromAnalysis, exclusionReason: updated.exclusionReason } } : d)
      toast.success('Sesión reincluida en el análisis')
    } catch {
      toast.error('No se pudo reincluir la sesión')
    } finally {
      setSavingExclusion(false)
    }
  }


  const handleDownloadCsv = async () => {
    if (!sessionId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/admin/export?format=session-report&session=${sessionId}`)
      if (!res.ok) throw new Error('Error al generar CSV')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_${studyCode}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('CSV de resultados descargado')
    } catch {
      toast.error('Error al descargar CSV')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            Reporte de Resultados de la Sesión
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-mono">{studyCode}</span>
            {data && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadCsv}
                disabled={downloading || data.blockSummaries.length === 0}
                className="gap-1.5 text-xs h-7"
              >
                {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Descargar CSV
              </Button>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* ---- Session info ---- */}
            <section className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Código sesión</p>
                  <p className="font-medium font-mono text-xs">{data.session.studyCode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Participante</p>
                  <p className="font-medium font-mono text-xs">{data.participant?.studyCode ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Investigador</p>
                  <p className="font-medium text-xs">{data.researcher ? `${data.researcher.name} (${data.researcher.code})` : data.session.researcherCode || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Fecha inicio</p>
                  <p className="font-medium text-xs">{safeFormatDate(data.session.startedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Fecha fin</p>
                  <p className="font-medium text-xs">{safeFormatDate(data.session.completedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Calibración</p>
                  <p className="font-medium text-xs">
                    {data.session.calibrationStatus === 'success' ? 'Exitosa' : data.session.calibrationStatus === 'failed' ? 'Fallida' : data.session.calibrationStatus || '—'}
                    {data.session.calibrationErrorDeg != null ? ` (${data.session.calibrationErrorDeg.toFixed(1)}°)` : ''}
                  </p>
                </div>
              </div>

              {data.session.excludedFromAnalysis ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    <div className="text-sm flex-1">
                      <p className="text-rose-700 dark:text-rose-400 font-medium">Excluida del análisis</p>
                      {data.session.exclusionReason && (
                        <p className="text-rose-600 dark:text-rose-400 text-xs mt-0.5">{data.session.exclusionReason}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingExclusion}
                    onClick={handleReinclude}
                    className="gap-1.5"
                  >
                    {savingExclusion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Reincluir en el análisis
                  </Button>
                </div>
              ) : showExcludeForm ? (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Motivo de la exclusión</p>
                  <Textarea
                    value={excludeReasonDraft}
                    onChange={(e) => setExcludeReasonDraft(e.target.value)}
                    placeholder="Ej: >50% de omisiones, calibración fallida, interrupción a media sesión…"
                    className="text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!excludeReasonDraft.trim() || savingExclusion}
                      onClick={handleExclude}
                      className="gap-1.5"
                    >
                      {savingExclusion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                      Confirmar exclusión
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowExcludeForm(false); setExcludeReasonDraft('') }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExcludeForm(true)}
                  className="gap-1.5 text-rose-600 hover:text-rose-700 border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Excluir del análisis
                </Button>
              )}
            </section>

            <Separator />

            {/* ---- Block summary cards ---- */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">Resumen por Condición</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {data.blockSummaries.map((s) => (
                  <SummaryCard
                    key={s.condition}
                    label={s.label}
                    summary={s}
                    colorClass={CONDITION_BG[s.condition] || 'bg-neutral-100 text-neutral-700'}
                    borderClass={CONDITION_BORDER[s.condition] || 'border-l-4 border-l-neutral-400'}
                  />
                ))}
              </div>
            </section>

            <Separator />

            {/* ---- Detailed results table ---- */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">Resultados Detallados</h3>
              <Card className="border-neutral-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow className="bg-neutral-50">
                        <TableHead>Condición</TableHead>
                        <TableHead>Congruencia</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Correctos</TableHead>
                        <TableHead className="text-right">Incorrectos</TableHead>
                        <TableHead className="text-right">Omisiones</TableHead>
                        <TableHead className="text-right">Precisión (%)</TableHead>
                        <TableHead className="text-right">RT prom (ms)</TableHead>
                        <TableHead className="text-right">RT mediana</TableHead>
                        <TableHead className="text-right">RT SD</TableHead>
                        <TableHead className="text-right">RT CV (%)</TableHead>
                        <TableHead className="text-right">Anticip.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.blockSummaries.map((s) => (
                        <TableRow key={s.condition}>
                          <TableCell>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONDITION_BG[s.condition] || ''}`}>
                              {s.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                s.congruency === 'congruent'
                                  ? 'default'
                                  : s.congruency === 'neutral'
                                    ? 'outline'
                                    : 'secondary'
                              }
                              className="text-xs"
                            >
                              {congruencyLabel(s.congruency)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{s.totalTrials}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">{s.correctCount}</TableCell>
                          <TableCell className="text-right text-rose-600 font-medium">{s.incorrectCount}</TableCell>
                          <TableCell className="text-right text-amber-600 font-medium">{s.omissionCount}</TableCell>
                          <TableCell className="text-right font-semibold">{s.accuracyPercent.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">{s.rtMean.toFixed(0)}</TableCell>
                          <TableCell className="text-right">{s.rtMedian.toFixed(0)}</TableCell>
                          <TableCell className="text-right">{s.rtStd.toFixed(0)}</TableCell>
                          <TableCell className="text-right">{s.rtCv.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{s.anticipatoryCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </section>

            <Separator />

            {/* ---- Interference Index ---- */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">Índice de Interferencia</h3>
              <Card className="border-neutral-200 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Índice de Interferencia = RT(incongruente) − RT(congruente)
                  </p>
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-2xl font-bold text-emerald-600">
                        {data.interference.interferenceIndex >= 0 ? '+' : ''}{data.interference.interferenceIndex.toFixed(0)} ms
                      </span>
                      <p className="text-xs text-neutral-400">Interferencia Stroop</p>
                    </div>
                    <div>
                      <span className="text-xl font-bold text-amber-600">
                        {data.interference.relativeInterference >= 0 ? '+' : ''}{data.interference.relativeInterference.toFixed(1)}%
                      </span>
                      <p className="text-xs text-neutral-400">Interferencia relativa</p>
                    </div>
                    <div>
                      <span className="text-xl font-bold text-cyan-600">
                        {data.interference.accuracyCost >= 0 ? '+' : ''}{data.interference.accuracyCost.toFixed(1)} pp
                      </span>
                      <p className="text-xs text-neutral-400">Costo de precisión</p>
                    </div>
                  </div>
                  {data.interference.interferenceIndex > 0 ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                      <span className="font-semibold">Efecto Stroop esperado.</span>{' '}
                      Los ensayos incongruentes requirieron más tiempo de respuesta que los congruentes.
                    </div>
                  ) : data.interference.interferenceIndex === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                      <span className="font-semibold">Sin interferencia detectada.</span>{' '}
                      No se observó diferencia entre condiciones.
                    </div>
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                      <span className="font-semibold">Patrón atípico.</span>{' '}
                      Los ensayos congruentes fueron más lentos que los incongruentes.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ---- NASA-TLX ---- */}
            {data.nasaTlx && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Carga de Trabajo (NASA-TLX)
                  </h3>
                  <div className="w-fit border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center bg-neutral-50 text-xs font-medium text-muted-foreground border-b px-4 py-2.5">
                      <span className="w-[200px]">Dimensión</span>
                      <span className="text-right">Puntuación</span>
                    </div>
                    <div className="flex items-center border-b px-4 py-2.5">
                      <span className="w-[200px] text-sm font-medium">Puntuación Global</span>
                      <span>
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-sm px-2.5 py-0.5">
                          {data.nasaTlx.globalScore?.toFixed(1) ?? '—'}
                        </Badge>
                      </span>
                    </div>
                    {[
                      ['Demanda Mental', data.nasaTlx.mentalDemand],
                      ['Demanda Física', data.nasaTlx.physicalDemand],
                      ['Demanda Temporal', data.nasaTlx.temporalDemand],
                      ['Rendimiento', data.nasaTlx.performance],
                      ['Esfuerzo', data.nasaTlx.effort],
                      ['Frustración', data.nasaTlx.frustration],
                    ].map(([dim, val], i) => (
                      <div
                        key={dim as string}
                        className={`flex items-center px-4 py-2.5 ${i < 5 ? 'border-b' : ''}`}
                      >
                        <span className="w-[200px] text-sm">{dim as string}</span>
                        <span className="text-sm font-semibold">{val ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* ---- Data Quality ---- */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Calidad de Datos
              </h3>
              <Card className="border-neutral-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-neutral-400">Estado calibración</p>
                      <p className="text-sm font-semibold capitalize">
                        {data.session.calibrationStatus === 'success' ? 'Exitosa' : data.session.calibrationStatus === 'failed' ? 'Fallida' : data.session.calibrationStatus}
                      </p>
                      {data.session.calibrationErrorDeg != null && (
                        <p className="text-xs text-neutral-500">Error: {data.session.calibrationErrorDeg.toFixed(1)}°</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400">Datos válidos</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {data.dataQuality.dataQualityPercent.toFixed(1)}%
                      </p>
                      <p className="text-xs text-neutral-500">
                        {data.dataQuality.validTrials} de {data.dataQuality.totalTrials} ensayos
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400">Ensayos excluidos</p>
                      <p className="text-sm font-semibold text-rose-600">
                        {data.dataQuality.excludedTrials}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ---- Post-evaluation ---- */}
            {data.postEval.difficultyPerceived != null && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3">Evaluación Post-Experimento</h3>
                  <Card className="border-neutral-200 shadow-sm">
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0">
                        {[
                          ['Dificultad percibida', data.postEval.difficultyPerceived],
                          ['Concentración requerida', data.postEval.concentrationReq],
                          ['Fatiga', data.postEval.fatigue],
                          ['Estrés', data.postEval.stress],
                          ['Dificultad al responder', data.postEval.difficultyResponding],
                        ].map(([label, val]) => (
                          <div key={label as string} className="flex items-center justify-between p-3 border-b border-r border-neutral-100">
                            <span className="text-xs text-neutral-600">{label as string}</span>
                            <span className="text-sm font-semibold">{val ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </>
            )}

            {/* ---- Experience ---- */}
            {data.experience.testClear && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3">Experiencia del Participante</h3>
                  <Card className="border-neutral-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-500 text-xs">¿Prueba clara?</span>{' '}
                          <span className="font-medium">{data.experience.testClear}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">¿Instrucciones claras?</span>{' '}
                          <span className="font-medium">{data.experience.instructionsClear ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">¿Tiempo suficiente?</span>{' '}
                          <span className="font-medium">{data.experience.timeSufficient ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">¿Distracciones?</span>{' '}
                          <span className="font-medium">{data.experience.hadDistractions ?? 'No'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">¿Problemas técnicos?</span>{' '}
                          <span className="font-medium">{data.experience.hadTechnicalIssues ?? 'No'}</span>
                        </div>
                      </div>
                      {data.experience.additionalComments && (
                        <div className="mt-3 p-3 bg-neutral-50 rounded-lg text-sm text-neutral-600">
                          <p className="text-xs text-neutral-400 mb-1">Comentarios adicionales:</p>
                          {data.experience.additionalComments}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            )}

            {/* ---- Researcher notes ---- */}
            {data.researcherNotes.excessiveHead && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Registro del Investigador
                  </h3>
                  <Card className="border-neutral-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-500 text-xs">Movimiento excesivo de cabeza:</span>{' '}
                          <span className="font-medium">{data.researcherNotes.excessiveHead}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">Problemas de tracking:</span>{' '}
                          <span className="font-medium">{data.researcherNotes.trackingProbs ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">Calibración estable:</span>{' '}
                          <span className="font-medium">{data.researcherNotes.calibStable ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">Interrupciones:</span>{' '}
                          <span className="font-medium">{data.researcherNotes.interruptions ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 text-xs">Siguió instrucciones:</span>{' '}
                          <span className="font-medium">{data.researcherNotes.followedInstr ?? '—'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </>
            )}

          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron datos para esta sesión
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
