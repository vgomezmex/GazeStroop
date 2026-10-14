'use client'

import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useEyeTracker } from '@/hooks/useEyeTracker'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, CheckCircle2, XCircle, RefreshCw, Crosshair, Wifi, WifiOff } from 'lucide-react'

// Criterio de éxito de la calibración. Antes se comparaba el AVE_ERROR crudo
// de Gazepoint (unidad NO documentada por el fabricante — su propio manual
// usa "19.43" como valor de ejemplo, del mismo orden que calibraciones
// reales EXITOSAS) contra 1.5, tratándolo como si ya viniera en grados. Eso
// hacía fallar prácticamente cualquier calibración real, incluso cuando
// Gazepoint Control mostraba "Success calibrating 5 of 5" en ambos ojos.
//
// Ahora el criterio principal es VALID_POINTS — el único valor que el
// manual sí documenta explícitamente ("number of successful calibration
// points") y que refleja el mismo juicio interno que ya usa Gazepoint
// Control. El error en grados se calcula aparte, de forma correcta, a
// partir de la fracción de pantalla real (ver useEyeTracker.ts) convertida
// con el tamaño de pantalla y distancia de visión configurados — y se usa
// solo como criterio secundario/informativo.
const MIN_VALID_POINTS = 5
const MAX_ACCEPTABLE_ERROR_DEG = 3

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', variant: 'secondary' as const, icon: Eye },
  in_progress: { label: 'En progreso', variant: 'default' as const, icon: RefreshCw },
  success: { label: 'Exitosa', variant: 'default' as const, icon: CheckCircle2 },
  failed: { label: 'Fallida', variant: 'destructive' as const, icon: XCircle },
}

// Convierte una distancia en fracción de pantalla (0..1, unidad que Gazepoint
// sí documenta) a grados de ángulo visual, usando el tamaño físico de
// pantalla y la distancia de visión. Es una aproximación (asume distancia
// constante y usa el ancho como referencia), no una medición calibrada por
// sujeto — pero es la única conversión con una unidad de entrada conocida.
function fractionToDegrees(fraction: number, screenWidthCm: number, viewingDistanceCm: number): number {
  const errorCm = fraction * screenWidthCm
  const radians = 2 * Math.atan(errorCm / (2 * viewingDistanceCm))
  return (radians * 180) / Math.PI
}

export default function CalibrationScreen() {
  const { calibration, setCalibration, setAppState, config, sessionId } = useAppStore()
  const { connected, isMock, runCalibration } = useEyeTracker(config.eyeTrackerBridgeUrl)
  const [pointResults, setPointResults] = useState<
    Array<{ pointIndex: number; targetX: number; targetY: number; errorDeg: number | null }>
  >([])

  const isAnimating = calibration.status === 'in_progress'
  const statusCfg = STATUS_CONFIG[calibration.status]
  const StatusIcon = statusCfg.icon

  const persistPoints = useCallback(
    async (points: Array<{ pointIndex: number; targetX: number; targetY: number; errorDeg: number | null }>) => {
      if (!sessionId || points.length === 0) return
      try {
        await fetch('/api/calibration/points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, points }),
        })
      } catch (err) {
        console.error('Error persisting calibration points:', err)
      }
    },
    [sessionId]
  )

  const runCalibrationFlow = useCallback(async () => {
    setCalibration({ status: 'in_progress' })
    setPointResults([])

    const summary = await runCalibration()

    // Convierte cada punto de fracción de pantalla a grados reales, usando
    // el tamaño de pantalla y distancia de visión configurados — no el
    // AVE_ERROR crudo de Gazepoint (unidad no documentada).
    const pointsInDegrees = summary.points.map((p) => ({
      pointIndex: p.pointIndex,
      targetX: p.targetX,
      targetY: p.targetY,
      errorDeg:
        p.errorFraction != null
          ? fractionToDegrees(p.errorFraction, config.screenWidthCm, config.viewingDistanceCm)
          : null,
    }))
    setPointResults(pointsInDegrees)
    await persistPoints(pointsInDegrees)

    if (summary.validPoints == null) {
      // No response from the bridge/device within the timeout — most
      // likely gazepoint-bridge isn't running, or Gazepoint Control isn't
      // connected to a GP3. Treat as a failed calibration rather than
      // silently making up a number.
      setCalibration({
        status: 'failed',
        errorDeg: null,
        timestamp: new Date().toISOString(),
      })
      return
    }

    const averageErrorDeg =
      summary.averageErrorFraction != null
        ? fractionToDegrees(summary.averageErrorFraction, config.screenWidthCm, config.viewingDistanceCm)
        : null

    // Criterio principal: VALID_POINTS (documentado por Gazepoint, refleja
    // el mismo juicio que ya muestra Gazepoint Control). El error en grados
    // es un criterio secundario — si Gazepoint ya marcó los 5 puntos como
    // válidos pero el error calculado es alto, igual se reporta el número
    // real en vez de ocultarlo, pero no se hace fallar la calibración por
    // eso solo (evita el falso "Fallida" que se estaba viendo).
    const success = summary.validPoints >= MIN_VALID_POINTS
    if (success && averageErrorDeg != null && averageErrorDeg > MAX_ACCEPTABLE_ERROR_DEG) {
      console.warn(
        `Calibración con los ${summary.validPoints} puntos válidos que exige Gazepoint, pero con error estimado de ${averageErrorDeg.toFixed(2)}° (por encima de ${MAX_ACCEPTABLE_ERROR_DEG}°). Revisa la distancia/tamaño de pantalla configurados si este número no parece razonable.`
      )
    }

    setCalibration({
      status: success ? 'success' : 'failed',
      errorDeg: averageErrorDeg,
      timestamp: new Date().toISOString(),
    })
  }, [runCalibration, persistPoints, setCalibration, config.screenWidthCm, config.viewingDistanceCm])

  const handleRecalibrate = () => {
    setCalibration({ status: 'pending', errorDeg: null, timestamp: null })
    setPointResults([])
  }

  const handleContinue = () => {
    setAppState('INSTRUCTIONS')
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Eye className="h-7 w-7 text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">
              Calibración del Eye Tracker
            </h1>
          </div>
          <p className="text-neutral-400 text-sm">Gazepoint GP3</p>
          <div className="flex items-center justify-center gap-1.5 text-xs">
            {connected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">
                  Bridge conectado{isMock ? ' (modo simulado)' : ''}
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-400">
                  Bridge no detectado en {config.eyeTrackerBridgeUrl}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status badge */}
        <Badge
          variant={statusCfg.variant}
          className="flex items-center gap-1.5 px-3 py-1 text-sm"
        >
          <StatusIcon className={`h-3.5 w-3.5 ${isAnimating ? 'animate-spin' : ''}`} />
          {statusCfg.label}
        </Badge>

        {/* Calibration area */}
        <Card className="bg-neutral-900 border-neutral-800 w-full max-w-[340px]">
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <div className="relative w-[300px] h-[300px] rounded-full border-2 border-dashed border-neutral-700 bg-neutral-950/50 flex items-center justify-center overflow-hidden">
              <Crosshair
                className={`h-10 w-10 transition-colors duration-300 ${
                  isAnimating
                    ? 'text-amber-400 animate-pulse'
                    : calibration.status === 'success'
                      ? 'text-emerald-400'
                      : calibration.status === 'failed'
                        ? 'text-rose-400'
                        : 'text-neutral-600'
                }`}
              />
            </div>

            {isAnimating && (
              <p className="text-sm text-neutral-300 text-center">
                Esperando la ventana de calibración de Gazepoint Control...
                <br />
                <span className="text-xs text-neutral-500">
                  Siga con la mirada los puntos que aparezcan en pantalla.
                </span>
              </p>
            )}

            {/* Result */}
            {(calibration.status === 'success' || calibration.status === 'failed') && (
              <div
                className={`text-center space-y-1 p-3 rounded-lg w-full ${
                  calibration.status === 'success'
                    ? 'bg-emerald-950/50 border border-emerald-800/50'
                    : 'bg-rose-950/50 border border-rose-800/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {calibration.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                  <span className="font-medium">
                    {calibration.status === 'success'
                      ? 'Calibración exitosa'
                      : calibration.errorDeg == null
                        ? 'Sin respuesta del eye tracker'
                        : 'Calibración fallida'}
                  </span>
                </div>
                {calibration.errorDeg != null ? (
                  <p className="text-sm text-neutral-400">
                    Error medio estimado:{' '}
                    <span
                      className={`font-mono font-semibold ${
                        calibration.status === 'success' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {calibration.errorDeg.toFixed(2)}°
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Verifica que gazepoint-bridge esté corriendo y que Gazepoint
                    Control tenga un GP3 conectado, luego reintenta.
                  </p>
                )}
                {pointResults.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {pointResults.length} punto(s) de calibración registrados.
                  </p>
                )}
                <p className="text-[11px] text-neutral-600">
                  Estimación de ángulo visual a partir de la distancia real reportada por Gazepoint
                  (fracción de pantalla), convertida con el tamaño de pantalla y distancia de visión
                  configurados. El criterio de éxito es que Gazepoint valide los 5 puntos.
                </p>
                {calibration.timestamp && (
                  <p className="text-xs text-neutral-500">
                    {new Date(calibration.timestamp).toLocaleTimeString('es-MX')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-[340px]">
          {calibration.status === 'pending' && (
            <Button
              onClick={runCalibrationFlow}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              size="lg"
            >
              <Crosshair className="h-4 w-4 mr-2" />
              Iniciar calibración
            </Button>
          )}

          {(calibration.status === 'success' || calibration.status === 'failed') && (
            <Button
              onClick={handleRecalibrate}
              variant="outline"
              className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              size="lg"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recalibrar
            </Button>
          )}

          {calibration.status === 'success' && (
            <Button
              onClick={handleContinue}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
            >
              Continuar a las instrucciones
            </Button>
          )}
        </div>

        {/* Info text */}
        <p className="text-xs text-neutral-600 text-center max-w-xs">
          La calibración es obligatoria antes de iniciar el experimento.
          Mantenga la cabeza quieta y siga el punto con la mirada.
        </p>
      </div>
    </div>
  )
}
