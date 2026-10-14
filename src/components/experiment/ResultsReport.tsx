'use client'

import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { BarChart3, Eye, Brain, FileDown, Home } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend, CartesianGrid, Cell,
} from 'recharts'
import type { BlockSummary } from '@/types/experiment'

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

function SummaryCard({
  label,
  summary,
  colorClass,
  borderClass,
}: {
  label: string
  summary: BlockSummary | undefined
  colorClass: string
  borderClass: string
}) {
  if (!summary) return null
  const accPct = (summary.accuracy * 100).toFixed(1)
  return (
    <Card className={`${borderClass} border-neutral-200 bg-white shadow-sm`}>
      <CardContent className="p-4 md:p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
            {label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-xs text-neutral-400">Precisión</p>
            <p className="text-xl font-bold text-neutral-800">{accPct}%</p>
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

function conditionLabel(condition: string) {
  const map: Record<string, string> = {
    WORD: 'Word Test',
    NEUTRAL: 'Neutral',
    COLOR: 'Color Test',
    REVERSE_STROOP: 'Reverse Stroop',
    STROOP: 'Stroop Test',
  }
  return map[condition] || condition
}

function congruencyLabel(c: string) {
  if (c === 'neutral') return 'Neutral'
  return c === 'congruent' ? 'Congruente' : 'Incongruente'
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="font-medium text-neutral-700">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function ResultsReport() {
  const { getResults, resetSession, nasaTlx, calibration } = useAppStore()
  const results = getResults()

  const summaries = results.blockSummaries

  // Chart data
  const rtChartData = summaries.map(s => ({
    name: s.label,
    'RT (ms)': Math.round(s.rtMean),
    fill: CONDITION_COLORS[s.condition] || '#888',
  }))

  const accuracyChartData = summaries.map(s => ({
    name: s.label,
    'Precisión (%)': Math.round(s.accuracy * 100),
    fill: CONDITION_COLORS[s.condition] || '#888',
  }))

  const congruentBlocks = summaries.filter(s => s.congruency === 'congruent')
  const incongruentBlocks = summaries.filter(s => s.congruency === 'incongruent')
  const congruentMeanRt = congruentBlocks.length > 0
    ? congruentBlocks.reduce((a, b) => a + b.rtMean, 0) / congruentBlocks.length
    : 0
  const incongruentMeanRt = incongruentBlocks.length > 0
    ? incongruentBlocks.reduce((a, b) => a + b.rtMean, 0) / incongruentBlocks.length
    : 0

  const comparisonData = [
    { name: 'Congruente', RT: Math.round(congruentMeanRt), fill: '#10b981' },
    { name: 'Incongruente', RT: Math.round(incongruentMeanRt), fill: '#f43f5e' },
  ]

  // NASA-TLX radar data
  const nasaRadarData = nasaTlx
    ? [
        { dimension: 'Demanda Mental', value: nasaTlx.mentalDemand, fullMark: 100 },
        { dimension: 'Demanda Física', value: nasaTlx.physicalDemand, fullMark: 100 },
        { dimension: 'Demanda Temporal', value: nasaTlx.temporalDemand, fullMark: 100 },
        { dimension: 'Rendimiento', value: nasaTlx.performance, fullMark: 100 },
        { dimension: 'Esfuerzo', value: nasaTlx.effort, fullMark: 100 },
        { dimension: 'Frustración', value: nasaTlx.frustration, fullMark: 100 },
      ]
    : []

  const nasaTableData = nasaTlx
    ? [
        ['Demanda Mental', nasaTlx.mentalDemand],
        ['Demanda Física', nasaTlx.physicalDemand],
        ['Demanda Temporal', nasaTlx.temporalDemand],
        ['Rendimiento', nasaTlx.performance],
        ['Esfuerzo', nasaTlx.effort],
        ['Frustración', nasaTlx.frustration],
      ]
    : []

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-3">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
            Reporte de Resultados de la Sesión
          </h1>
        </div>

        {/* Section 1: Summary cards - dynamic based on active blocks */}
        <section aria-label="Resumen por condición">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4">Resumen por Condición</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((s) => (
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

        {/* Section 2: Results table */}
        <section aria-label="Tabla de resultados detallados">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4">Resultados Detallados</h2>
          <Card className="border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50">
                    <TableHead>Condición</TableHead>
                    <TableHead>Congruencia</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Correctos</TableHead>
                    <TableHead className="text-right">Incorrectos</TableHead>
                    <TableHead className="text-right">Omisiones</TableHead>
                    <TableHead className="text-right">Precisión (%)</TableHead>
                    <TableHead className="text-right">RT promedio (ms)</TableHead>
                    <TableHead className="text-right">RT mediana (ms)</TableHead>
                    <TableHead className="text-right">RT SD</TableHead>
                    <TableHead className="text-right">RT CV (%)</TableHead>
                    <TableHead className="text-right">Anticipatorias</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s) => (
                    <TableRow key={s.condition}>
                      <TableCell>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONDITION_BG[s.condition] || ''}`}>
                          {conditionLabel(s.condition)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          s.congruency === 'congruent' ? 'default' :
                          s.congruency === 'neutral' ? 'outline' : 'secondary'
                        } className="text-xs">
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

        {/* Section 3: Interference index */}
        <section aria-label="Índice de interferencia">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4">Índice de Interferencia</h2>
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-neutral-500">
                    Índice de Interferencia = RT(incongruente) − RT(congruente)
                  </p>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <span className="text-3xl md:text-4xl font-bold text-emerald-600">
                        {results.interferenceIndex >= 0 ? '+' : ''}{results.interferenceIndex.toFixed(0)} ms
                      </span>
                      <p className="text-xs text-neutral-400 mt-1">Interferencia Stroop</p>
                    </div>
                    <div>
                      <span className="text-2xl md:text-3xl font-bold text-amber-600">
                        {results.relativeInterference >= 0 ? '+' : ''}{results.relativeInterference.toFixed(1)}%
                      </span>
                      <p className="text-xs text-neutral-400 mt-1">Interferencia relativa</p>
                    </div>
                    <div>
                      <span className="text-2xl md:text-3xl font-bold text-cyan-600">
                        {results.accuracyCost >= 0 ? '+' : ''}{results.accuracyCost.toFixed(1)} pp
                      </span>
                      <p className="text-xs text-neutral-400 mt-1">Costo de precisión</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  {results.interferenceIndex > 0 ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-sm text-emerald-700">
                        <span className="font-semibold">Efecto Stroop esperado.</span>{' '}
                        Los ensayos incongruentes requirieron más tiempo de respuesta que los congruentes, lo cual indica interferencia semántica y es consistente con la literatura neuropsicológica.
                      </p>
                    </div>
                  ) : results.interferenceIndex === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-700">
                        <span className="font-semibold">Sin interferencia detectada.</span>{' '}
                        No se observó diferencia entre condiciones. Puede deberse a la práctica o a características individuales del participante.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                      <p className="text-sm text-rose-700">
                        <span className="font-semibold">Patrón atípico.</span>{' '}
                        Los ensayos congruentes fueron más lentos que los incongruentes. Verificar la calidad de los datos y el cumplimiento de instrucciones.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 4: NASA-TLX */}
        {nasaTlx && nasaRadarData.length > 0 && (
          <>
            <Separator />
            <section aria-label="NASA-TLX">
              <h2 className="text-lg font-semibold text-neutral-700 mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Carga de Trabajo (NASA-TLX)
              </h2>

              {/* Global score */}
              <div className="flex justify-center mb-6">
                <div className="bg-gradient-to-br from-emerald-500 to-amber-500 text-white rounded-2xl px-8 py-4 shadow-lg">
                  <p className="text-sm font-medium opacity-90">Puntuación Global</p>
                  <p className="text-4xl font-bold">{nasaTlx.globalScore.toFixed(1)}</p>
                  <p className="text-xs opacity-75">de 100</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Radar chart */}
                <Card className="border-neutral-200 bg-white shadow-sm">
                  <CardContent className="p-4 md:p-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={nasaRadarData}>
                        <PolarGrid stroke="#e5e5e5" />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: '#525252' }} />
                        <Radar
                          name="NASA-TLX"
                          dataKey="value"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.3}
                        />
                        <Tooltip content={<CustomTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* NASA-TLX table */}
                <Card className="border-neutral-200 bg-white shadow-sm">
                  <CardContent className="p-4 md:p-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dimensión</TableHead>
                          <TableHead className="text-right">Puntuación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nasaTableData.map(([dim, val]) => (
                          <TableRow key={dim as string}>
                            <TableCell className="text-sm">{dim as string}</TableCell>
                            <TableCell className="text-right font-semibold">{val}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </section>
          </>
        )}

        <Separator />

        {/* Section 5: Data quality */}
        <section aria-label="Calidad de datos">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Calidad de Datos
          </h2>
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-neutral-400">Estado de calibración</p>
                  <p className="text-lg font-semibold text-neutral-800 capitalize">
                    {calibration.status === 'success' ? 'Exitosa' : calibration.status === 'failed' ? 'Fallida' : calibration.status}
                  </p>
                  {calibration.errorDeg !== null && (
                    <p className="text-xs text-neutral-500">Error: {calibration.errorDeg.toFixed(1)}°</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-400">Datos válidos</p>
                  <p className="text-lg font-semibold text-emerald-600">
                    {results.dataQuality.dataQualityPercent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-neutral-500">
                    {results.dataQuality.validTrials} de {results.dataQuality.totalTrials} ensayos
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-400">Ensayos excluidos</p>
                  <p className="text-lg font-semibold text-rose-600">
                    {results.dataQuality.excludedTrials}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Section 6: Charts */}
        <section aria-label="Gráficos">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4 flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Gráficos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* RT por condición */}
            <Card className="border-neutral-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-600">RT por Condición (ms)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={rtChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="RT (ms)" radius={[4, 4, 0, 0]}>
                      {rtChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Accuracy por condición */}
            <Card className="border-neutral-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-600">Precisión por Condición (%)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={accuracyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Precisión (%)" radius={[4, 4, 0, 0]}>
                      {accuracyChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* NASA-TLX radar */}
            {nasaTlx && nasaRadarData.length > 0 && (
              <Card className="border-neutral-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-neutral-600">NASA-TLX — Perfil de Carga</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={nasaRadarData}>
                      <PolarGrid stroke="#e5e5e5" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: '#525252' }} />
                      <Radar
                        name="Puntuación"
                        dataKey="value"
                        stroke="#f59e0b"
                        fill="#f59e0b"
                        fillOpacity={0.3}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* RT comparison congruent vs incongruent */}
            <Card className="border-neutral-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-600">RT Congruente vs Incongruente (ms)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="RT" radius={[4, 4, 0, 0]}>
                      {comparisonData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Bottom action */}
        <div className="flex justify-center pb-8">
          <Button
            onClick={resetSession}
            variant="outline"
            className="gap-2 text-neutral-600 hover:text-neutral-900"
            size="lg"
          >
            <Home className="w-4 h-4" />
            Volver al inicio
          </Button>
        </div>
      </div>
    </main>
  )
}
