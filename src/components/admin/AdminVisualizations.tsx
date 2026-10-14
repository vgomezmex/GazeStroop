'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts'

// Color palette (warm/neutral, no indigo/blue primary)
const COLORS = {
  amber: '#f59e0b',
  emerald: '#10b981',
  rose: '#f43f5e',
  cyan: '#06b6d4',
  orange: '#f97316',
  teal: '#14b8a6',
}

const CONDITION_COLORS: Record<string, string> = {
  WORD: COLORS.amber,
  REVERSE_STROOP: COLORS.rose,
  COLOR: COLORS.emerald,
  STROOP: COLORS.cyan,
}

const CONDITION_LABELS: Record<string, string> = {
  WORD: 'Word Test',
  REVERSE_STROOP: 'Reverse Stroop',
  COLOR: 'Color Test',
  STROOP: 'Stroop Test',
}

const NASA_DIMENSION_LABELS: Record<string, string> = {
  mentalDemand: 'Demanda Mental',
  physicalDemand: 'Demanda Física',
  temporalDemand: 'Demanda Temporal',
  performance: 'Rendimiento',
  effort: 'Esfuerzo',
  frustration: 'Frustración',
}

interface VizData {
  rtByCondition: { condition: string; meanRt: number; stdRt: number; label: string }[]
  accuracyByCondition: { condition: string; accuracy: number; label: string }[]
  rtDistribution: { bin: string; count: number }[]
  nasaTlxRadar: { dimension: string; value: number; fullMark: number }[]
  interferenceDistribution: { bin: string; count: number }[]
  rtAccuracyCorrelation: { rt: number; accuracy: number; condition: string }[]
}

const EMPTY_VIZ: VizData = {
  rtByCondition: [],
  accuracyByCondition: [],
  rtDistribution: [],
  nasaTlxRadar: [],
  interferenceDistribution: [],
  rtAccuracyCorrelation: [],
}

// Raw API response shape
interface ApiVizResponse {
  rtByCondition?: Record<string, number>
  accuracyByCondition?: Record<string, number>
  rtDistribution?: Record<string, number>
  nasaTlxAverages?: {
    mentalDemand: number
    physicalDemand: number
    temporalDemand: number
    performance: number
    effort: number
    frustration: number
    count: number
  }
  interferencePerSession?: Array<{ sessionId: string; interferenceIndex: number }>
  rtAccuracyScatter?: Array<{
    rt: number | null
    accuracy: number | null
    condition: string
    congruency: string
  }>
}

/**
 * Transform the raw API response (Records/objects) into the
 * Array format that Recharts components expect.
 */
function transformApiToVizData(raw: ApiVizResponse): VizData {
  const result: VizData = { ...EMPTY_VIZ }

  // 1. rtByCondition: Record<string, number> → Array
  if (raw.rtByCondition) {
    result.rtByCondition = Object.entries(raw.rtByCondition).map(([condition, meanRt]) => ({
      condition,
      meanRt,
      stdRt: 0, // API does not provide std — we only have the mean
      label: CONDITION_LABELS[condition] || condition,
    }))
  }

  // 2. accuracyByCondition: Record<string, number> → Array
  // API returns percentage (0-100), UI expects fraction (0-1)
  if (raw.accuracyByCondition) {
    result.accuracyByCondition = Object.entries(raw.accuracyByCondition).map(([condition, pct]) => ({
      condition,
      accuracy: pct / 100,
      label: CONDITION_LABELS[condition] || condition,
    }))
  }

  // 3. rtDistribution: Record<string, number> → Array
  if (raw.rtDistribution) {
    result.rtDistribution = Object.entries(raw.rtDistribution).map(([bin, count]) => ({
      bin,
      count,
    }))
  }

  // 4. nasaTlxAverages → nasaTlxRadar: flat object → Array
  if (raw.nasaTlxAverages) {
    const { count: _count, ...dims } = raw.nasaTlxAverages
    result.nasaTlxRadar = Object.entries(dims).map(([key, value]) => ({
      dimension: NASA_DIMENSION_LABELS[key] || key,
      value,
      fullMark: 100,
    }))
  }

  // 5. interferencePerSession → interferenceDistribution histogram
  if (raw.interferencePerSession && raw.interferencePerSession.length > 0) {
    const buckets = [
      { label: '< 0', min: -Infinity, max: 0 },
      { label: '0-50', min: 0, max: 50 },
      { label: '50-100', min: 50, max: 100 },
      { label: '100-200', min: 100, max: 200 },
      { label: '200-300', min: 200, max: 300 },
      { label: '300+', min: 300, max: Infinity },
    ]
    const counts: Record<string, number> = {}
    for (const b of buckets) counts[b.label] = 0

    for (const s of raw.interferencePerSession) {
      const idx = s.interferenceIndex
      for (const b of buckets) {
        if (idx >= b.min && idx < b.max) {
          counts[b.label]++
          break
        }
      }
    }
    result.interferenceDistribution = Object.entries(counts).map(([bin, count]) => ({
      bin,
      count,
    }))
  }

  // 6. rtAccuracyScatter → rtAccuracyCorrelation (filter nulls)
  if (raw.rtAccuracyScatter) {
    result.rtAccuracyCorrelation = raw.rtAccuracyScatter
      .filter((d) => d.rt != null && d.accuracy != null)
      .map((d) => ({
        rt: d.rt!,
        accuracy: d.accuracy!,
        condition: d.condition,
      }))
  }

  return result
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function AdminVisualizations() {
  const { goBack } = useAppStore()
  const [data, setData] = useState<VizData>(EMPTY_VIZ)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/admin/visualizations')
        if (!res.ok) throw new Error('Error al cargar visualizaciones')
        const json: ApiVizResponse = await res.json()
        setData(transformApiToVizData(json))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cargar datos')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Visualizaciones</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ChartSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. RT por condición */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tiempo de reacción por condición</CardTitle>
              </CardHeader>
              <CardContent>
                {data.rtByCondition.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.rtByCondition} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="condition" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="meanRt" name="RT promedio" radius={[4, 4, 0, 0]}>
                        {data.rtByCondition.map((entry, idx) => (
                          <Cell key={idx} fill={CONDITION_COLORS[entry.condition] || COLORS.amber} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 2. Accuracy por condición */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Precisión por condición</CardTitle>
              </CardHeader>
              <CardContent>
                {data.accuracyByCondition.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.accuracyByCondition} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="condition" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} domain={[0, 1]} label={{ value: '%', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} formatter={(v) => typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : v} />
                      <Bar dataKey="accuracy" name="Precisión" radius={[4, 4, 0, 0]}>
                        {data.accuracyByCondition.map((entry, idx) => (
                          <Cell key={idx} fill={CONDITION_COLORS[entry.condition] || COLORS.amber} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 3. Distribución de RT */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribución de tiempos de reacción</CardTitle>
              </CardHeader>
              <CardContent>
                {data.rtDistribution.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.rtDistribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} label={{ value: 'n', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Frecuencia" fill={COLORS.teal} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 4. NASA-TLX Radar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Carga mental promedio (NASA-TLX)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.nasaTlxRadar.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data.nasaTlxRadar}>
                      <PolarGrid className="stroke-muted" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Radar
                        name="NASA-TLX"
                        dataKey="value"
                        stroke={COLORS.orange}
                        fill={COLORS.orange}
                        fillOpacity={0.25}
                      />
                      <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 5. Interference index distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribución del índice de interferencia</CardTitle>
              </CardHeader>
              <CardContent>
                {data.interferenceDistribution.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.interferenceDistribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} label={{ value: 'n', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Frecuencia" fill={COLORS.rose} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 6. RT-Accuracy Correlation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Correlación RT-Precisión</CardTitle>
              </CardHeader>
              <CardContent>
                {data.rtAccuracyCorrelation.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="rt" name="RT" tick={{ fontSize: 12 }} label={{ value: 'RT (ms)', position: 'insideBottom', offset: -2, fontSize: 12 }} />
                      <YAxis dataKey="accuracy" name="Precisión" tick={{ fontSize: 12 }} domain={[0, 1]} label={{ value: 'Precisión', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Scatter name="Sesiones" data={data.rtAccuracyCorrelation}>
                        {data.rtAccuracyCorrelation.map((entry, idx) => (
                          <Cell key={idx} fill={CONDITION_COLORS[entry.condition] || COLORS.amber} />
                        ))}
                      </Scatter>
                      <Legend />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}