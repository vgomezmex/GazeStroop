'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type TrackerPhase = 'trial' | 'baseline' | 'calibration'

interface RawSample {
  type: 'sample'
  simulated?: boolean
  timestamp: number | null
  timestampSystem: number | null
  timestampTracker: number | null
  gazeX: number | null
  gazeY: number | null
  gazeValid?: boolean
  fpogX?: number | null
  fpogY?: number | null
  fpogS?: number | null
  fpogD?: number | null
  fpogValid?: boolean
  pupilDiameterLeft: number | null
  pupilDiameterRight: number | null
  pupilValid: boolean
  lpmmValid?: boolean
  rpmmValid?: boolean
  lpcX?: number | null
  lpcY?: number | null
  lpd?: number | null
  lps?: number | null
  lpv?: boolean
  rpcX?: number | null
  rpcY?: number | null
  rpd?: number | null
  rps?: number | null
  rpv?: boolean
  fixationId: number | null
  eventType: string
  bkid?: number | null
  bkdur?: number | null
  bkpmin?: number | null
  dial?: number | null
  dialValid?: boolean
}

interface CalibrationEventMsg {
  type: 'calibration_event'
  tag: string
  attrs: Record<string, string>
  // Errores reales por punto (fracción de pantalla 0..1), calculados por el
  // bridge a partir de <CAL ID="CALIB_RESULT" .../> — el único mensaje del
  // protocolo que trae coordenadas objetivo vs. medidas con unidad conocida.
  points?: Array<{ point: number; targetX: number; targetY: number; errorFraction: number | null; leftValid: boolean; rightValid: boolean }> | null
  simulated?: boolean
}

interface StatusMsg {
  type: 'status'
  connected: boolean
  mock: boolean
}

export interface CalibrationPointResult {
  pointIndex: number
  targetX: number
  targetY: number
  // Distancia euclidiana target↔medido como fracción de pantalla (0..1).
  // NO son grados — la conversión a grados requiere tamaño de pantalla y
  // distancia de visión, y se hace en el componente que consume esto
  // (CalibrationScreen), no aquí.
  errorFraction: number | null
  leftValid: boolean
  rightValid: boolean
}

export interface CalibrationSummary {
  points: CalibrationPointResult[]
  // Promedio de errorFraction entre los puntos válidos (fracción de pantalla).
  averageErrorFraction: number | null
  // AVE_ERROR tal cual lo reporta Gazepoint Control. El manual oficial (v2.0,
  // sección 3.19) NO documenta su unidad — su propio ejemplo usa el valor
  // "19.43", del mismo orden de magnitud que valores reales observados en
  // calibraciones EXITOSAS. Por eso este valor se guarda solo como dato de
  // diagnóstico crudo, nunca se etiqueta como grados ni se usa para decidir
  // éxito/fracaso.
  averageErrorRaw: number | null
  // VALID_POINTS: esto sí está documentado ("number of successful
  // calibration points") y es lo que usa CalibrationScreen para decidir
  // éxito/fracaso — es el mismo criterio que Gazepoint Control ya aplica
  // internamente cuando muestra "Success calibrating N of 5".
  validPoints: number | null
  simulated: boolean
}

const FLUSH_INTERVAL_MS = 1000
const FLUSH_MAX_SAMPLES = 300 // ~5s at 60Hz — flush earlier than this on a timer anyway

/**
 * Connects to the local gazepoint-bridge WebSocket (see /gazepoint-bridge),
 * buffers incoming samples, and periodically POSTs them in batches to
 * /api/eyetracking/batch. This is the piece that makes
 * `EyeTrackingSample.timestamp` actually get populated at the device's
 * real sampling rate, instead of the table sitting empty.
 */
export function useEyeTracker(bridgeUrl: string) {
  const [connected, setConnected] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bufferRef = useRef<RawSample[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const captureRef = useRef<{ sessionId: string; trialId: string | null; phase: TrackerPhase } | null>(null)
  const calibrationResolveRef = useRef<((summary: CalibrationSummary) => void) | null>(null)
  const calibrationPointsRef = useRef<CalibrationPointResult[]>([])
  const calibrationSimulatedRef = useRef(false)

  const flush = useCallback(async () => {
    const capture = captureRef.current
    const samples = bufferRef.current
    if (!capture || samples.length === 0) return
    bufferRef.current = []

    try {
      await fetch('/api/eyetracking/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: capture.sessionId,
          trialId: capture.trialId,
          phase: capture.phase,
          samples: samples.map((s) => ({
            timestamp: s.timestamp ?? 0,
            timestampSystem: s.timestampSystem,
            timestampTracker: s.timestampTracker,
            gazeX: s.gazeX,
            gazeY: s.gazeY,
            gazeValid: s.gazeValid,
            fpogX: s.fpogX,
            fpogY: s.fpogY,
            fpogS: s.fpogS,
            fpogD: s.fpogD,
            fpogValid: s.fpogValid,
            pupilDiameterLeft: s.pupilDiameterLeft,
            pupilDiameterRight: s.pupilDiameterRight,
            pupilValid: s.pupilValid,
            lpmmValid: s.lpmmValid,
            rpmmValid: s.rpmmValid,
            lpcX: s.lpcX,
            lpcY: s.lpcY,
            lpd: s.lpd,
            lps: s.lps,
            lpv: s.lpv,
            rpcX: s.rpcX,
            rpcY: s.rpcY,
            rpd: s.rpd,
            rps: s.rps,
            rpv: s.rpv,
            fixationId: s.fixationId,
            eventType: s.eventType,
            bkid: s.bkid,
            bkdur: s.bkdur,
            bkpmin: s.bkpmin,
            dial: s.dial,
            dialValid: s.dialValid,
          })),
        }),
      })
    } catch (err) {
      // Best-effort: if a flush fails (network hiccup), those samples are
      // lost rather than retried, to avoid unbounded memory growth mid-trial.
      console.error('[useEyeTracker] flush failed', err)
    }
  }, [])

  useEffect(() => {
    if (!bridgeUrl) return
    let ws: WebSocket
    try {
      ws = new WebSocket(bridgeUrl)
    } catch {
      // `connected` ya inicia en `false` (useState(false) arriba), así que no
      // hace falta volver a setearlo aquí — evita un setState síncrono dentro
      // del efecto que además era redundante.
      return
    }
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (ev) => {
      let msg: RawSample | CalibrationEventMsg | StatusMsg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }

      if (msg.type === 'status') {
        setConnected(msg.connected)
        setIsMock(msg.mock)
        return
      }

      if (msg.type === 'sample') {
        if (captureRef.current) {
          bufferRef.current.push(msg)
          if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) flush()
        }
        return
      }

      if (msg.type === 'calibration_event') {
        if (msg.simulated) calibrationSimulatedRef.current = true
        if (msg.tag === 'CAL' && msg.attrs.ID === 'CALIB_RESULT' && msg.points) {
          // Único punto donde se llenan los resultados por punto — antes
          // esto se hacía en CADA mensaje CAL que trajera un atributo PT
          // (CALIB_START_PT y CALIB_RESULT_PT, uno de cada por punto),
          // duplicando el conteo (10 en vez de 5) y usando un campo "ERR"
          // que nunca existió en el protocolo real.
          calibrationPointsRef.current = msg.points.map((p) => ({
            pointIndex: p.point,
            targetX: p.targetX,
            targetY: p.targetY,
            errorFraction: p.errorFraction,
            leftValid: p.leftValid,
            rightValid: p.rightValid,
          }))
        } else if (msg.tag === 'ACK' && msg.attrs.ID === 'CALIBRATE_RESULT_SUMMARY') {
          const points = calibrationPointsRef.current
          const validFractions = points
            .map((p) => p.errorFraction)
            .filter((e): e is number => e !== null)
          const averageErrorFraction =
            validFractions.length > 0
              ? validFractions.reduce((a, b) => a + b, 0) / validFractions.length
              : null
          const averageErrorRaw = msg.attrs.AVE_ERROR != null ? Number(msg.attrs.AVE_ERROR) : null
          const validPoints = msg.attrs.VALID_POINTS != null ? Number(msg.attrs.VALID_POINTS) : null
          const resolve = calibrationResolveRef.current
          if (resolve) {
            resolve({
              points,
              averageErrorFraction,
              averageErrorRaw,
              validPoints,
              simulated: calibrationSimulatedRef.current,
            })
            calibrationResolveRef.current = null
          }
        }
        return
      }
    }

    flushTimerRef.current = setInterval(flush, FLUSH_INTERVAL_MS)

    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current)
      ws.close()
      wsRef.current = null
    }
  }, [bridgeUrl, flush])

  const sendCommand = useCallback((xml: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'command', xml }))
    }
  }, [])

  const startCapture = useCallback((sessionId: string, trialId: string | null, phase: TrackerPhase) => {
    bufferRef.current = []
    captureRef.current = { sessionId, trialId, phase }
  }, [])

  const stopCapture = useCallback(() => {
    flush()
    captureRef.current = null
  }, [flush])

  /**
   * Runs a real calibration on the device: shows the calibration screen on
   * the tracker, starts the sequence, and resolves with the per-point and
   * average error the GP3 actually reports (falls back to a timeout if the
   * bridge/device never responds — e.g. not connected).
   */
  const runCalibration = useCallback((timeoutMs = 20000): Promise<CalibrationSummary> => {
    calibrationPointsRef.current = []
    calibrationSimulatedRef.current = false
    return new Promise((resolve) => {
      let settled = false
      const settle = (summary: CalibrationSummary) => {
        if (settled) return
        settled = true
        calibrationResolveRef.current = null
        resolve(summary)
      }
      calibrationResolveRef.current = settle

      sendCommand('<SET ID="CALIBRATE_SHOW" STATE="1" />')
      sendCommand('<SET ID="CALIBRATE_START" STATE="1" />')

      setTimeout(() => {
        settle({
          points: calibrationPointsRef.current,
          averageErrorFraction: null,
          averageErrorRaw: null,
          validPoints: null,
          simulated: calibrationSimulatedRef.current,
        })
      }, timeoutMs)
    })
  }, [sendCommand])

  return { connected, isMock, startCapture, stopCapture, runCalibration }
}
