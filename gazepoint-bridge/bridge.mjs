#!/usr/bin/env node
/**
 * gazepoint-bridge
 * ------------------------------------------------------------------------
 * Relays real-time gaze/pupil data between:
 *   - Gazepoint Control's OpenGaze TCP API (default 127.0.0.1:4242) — the
 *     protocol the GP3 hardware actually speaks. A browser cannot open a
 *     raw TCP socket, which is why this small local relay exists.
 *   - A local WebSocket server (default 127.0.0.1:4243) that the Stroop
 *     Eye-Tracking web app connects to from the participant's browser.
 *
 * Run this on the SAME machine as the participant, with Gazepoint Control
 * already running and a GP3 connected, BEFORE starting the experiment:
 *
 *   npm install
 *   npm start
 *
 * For development without hardware:
 *
 *   npm run mock          # streams synthetic 60Hz samples, clearly
 *                          # flagged simulated:true on every message
 *
 * IMPORTANT — verify against your OpenGaze API manual:
 * Gazepoint has revised attribute names across API/firmware versions.
 * The commands and REC field names below match the OpenGaze API v2.0
 * documentation at the time this bridge was written. If your GP3 / Gazepoint
 * Control version replies with different attribute names, adjust
 * `FIELD_MAP` below — everything downstream (WebSocket messages, the
 * /api/eyetracking/batch payload) reads through that map, so it's the only
 * place that needs to change.
 * ------------------------------------------------------------------------
 */

import net from 'node:net'
import { WebSocketServer } from 'ws'

const GAZEPOINT_HOST = process.env.GAZEPOINT_HOST || '127.0.0.1'
const GAZEPOINT_PORT = Number(process.env.GAZEPOINT_PORT || 4242)
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 4243)
const MOCK = process.argv.includes('--mock')
const MOCK_HZ = 60

// ------------------------------------------------------------------------
// OpenGaze REC field -> our sample shape.
// (Left as a flat map so it's a single, obvious place to patch if a given
// GP3 / Gazepoint Control build uses different attribute names.)
// ------------------------------------------------------------------------
const FIELD_MAP = {
  time: 'TIME',        // tracker-relative time, seconds, float
  cnt: 'CNT',           // monotonically increasing sample counter
  bpogx: 'BPOGX',       // best point-of-gaze, normalized [0,1]
  bpogy: 'BPOGY',
  bpogv: 'BPOGV',       // 1 = valid
  // Fijación filtrada internamente por el tracker (distinta de BPOG, que es
  // la mirada cruda). Pedida explícitamente por el tester.
  fpogx: 'FPOGX',
  fpogy: 'FPOGY',
  fpogs: 'FPOGS',       // inicio de la fijación (s desde init/calibración)
  fpogd: 'FPOGD',       // duración de la fijación (s)
  fpogv: 'FPOGV',
  fpogid: 'FPOGID',     // fixation id
  // BUG CORREGIDO: "LPMM"/"RPMM"/"LPMMV"/"RPMMV" NO existen como nombres de
  // atributo en el protocolo Open Gaze API v2.0 (confirmado releyendo el
  // manual oficial completo, sección 5.10/5.11). El campo real es
  // LPUPILD/RPUPILD — diámetro de pupila en METROS, no milímetros — y se
  // activa con ENABLE_SEND_EYE_LEFT/ENABLE_SEND_EYE_RIGHT, NO con
  // ENABLE_SEND_PUPIL_LEFT/RIGHT (ese comando solo habilita LPD/RPD, que
  // están en píxeles — sección 5.8/5.9 — y esos sí funcionaban). El nombre
  // "LPMM" probablemente viene de una exportación CSV del propio software
  // Gazepoint Analysis, que convierte y renombra internamente
  // (LPUPILD × 1000 = milímetros) — no es un nombre que el stream TCP en
  // vivo use. Aquí se lee LPUPILD/RPUPILD (metros) y se convierte a mm
  // nosotros mismos, para poder seguir llamando a la columna "LPMM"/"RPMM"
  // en el CSV (que es como el tester pidió verla).
  lpupild: 'LPUPILD',
  lpupilv: 'LPUPILV',
  rpupild: 'RPUPILD',
  rpupilv: 'RPUPILV',
  // Datos crudos de imagen de cámara por ojo (posición del ojo en el
  // cuadro de la cámara + diámetro en píxeles + factor de escala)
  lpcx: 'LPCX',
  lpcy: 'LPCY',
  lpd: 'LPD',
  lps: 'LPS',
  lpv: 'LPV',
  rpcx: 'RPCX',
  rpcy: 'RPCY',
  rpd: 'RPD',
  rps: 'RPS',
  rpv: 'RPV',
  // Parpadeos
  bkid: 'BKID',         // blink id (0 = not blinking)
  bkdur: 'BKDUR',
  bkpmin: 'BKPMIN',      // parpadeos en los últimos 60s
  // Perilla de control física (accesorio opcional; no todos los GP3 la
  // traen, y no aparece en el manual OpenGaze API v2.0 — se lee "best
  // effort": si el hardware/firmware no la reporta, simplemente saldrá null.
  dial: 'DIAL',
  dialv: 'DIALV',
}

const ENABLE_COMMANDS = [
  '<SET ID="ENABLE_SEND_TIME" STATE="1" />',
  '<SET ID="ENABLE_SEND_COUNTER" STATE="1" />',
  '<SET ID="ENABLE_SEND_POG_BEST" STATE="1" />',
  '<SET ID="ENABLE_SEND_PUPIL_LEFT" STATE="1" />',
  '<SET ID="ENABLE_SEND_PUPIL_RIGHT" STATE="1" />',
  // Necesarios para LPUPILD/RPUPILD (diámetro de pupila en metros). Antes
  // faltaban por completo — sin ellos, Gazepoint nunca manda esos campos,
  // sin importar qué tan bien esté todo lo demás configurado.
  '<SET ID="ENABLE_SEND_EYE_LEFT" STATE="1" />',
  '<SET ID="ENABLE_SEND_EYE_RIGHT" STATE="1" />',
  '<SET ID="ENABLE_SEND_BLINK" STATE="1" />',
  // NOTA: el comando correcto es ENABLE_SEND_POG_FIX (confirmado en el manual
  // oficial de Gazepoint y en múltiples integraciones de terceros — PsychoPy,
  // Matlab, gazepoint_toolkit). El nombre "ENABLE_SEND_FIXATION" que estaba
  // aquí no existe en el protocolo: Gazepoint Control lo habría respondido
  // con <NACK/> (o simplemente lo habría ignorado), y como consecuencia la
  // fijación (FPOGID y compañía) nunca se habría empezado a transmitir.
  '<SET ID="ENABLE_SEND_POG_FIX" STATE="1" />',
  '<SET ID="ENABLE_SEND_DATA" STATE="1" />',
  // DIAL/DIALV no está documentado en el manual OpenGaze API v2.0 que
  // verificamos — parece ser de un accesorio físico (perilla de control) de
  // versiones/hardware más recientes. Se intenta habilitar "best effort":
  // si Gazepoint Control no reconoce el comando, responderá <NACK/> (o lo
  // ignorará) sin afectar el resto del streaming.
  '<SET ID="ENABLE_SEND_DIAL" STATE="1" />',
]

// ------------------------------------------------------------------------
// Minimal XML-attribute parser for the OpenGaze protocol. The protocol is
// a stream of self-closing, single-line tags like:
//   <REC TIME="12.345" CNT="789" BPOGX="0.512" BPOGV="1" .../>\r\n
// A generic attribute parser (rather than hardcoding expected fields) means
// unexpected/renamed attributes just pass through instead of crashing the
// bridge.
// ------------------------------------------------------------------------
function parseTag(line) {
  const tagMatch = line.match(/^<(\w+)\s/)
  if (!tagMatch) return null
  const tag = tagMatch[1]
  const attrs = {}
  const attrRe = /(\w+)="([^"]*)"/g
  let m
  while ((m = attrRe.exec(line))) {
    attrs[m[1]] = m[2]
  }
  return { tag, attrs }
}

function toNum(v) {
  if (v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function recToSample(attrs) {
  const bkid = toNum(attrs[FIELD_MAP.bkid])
  return {
    type: 'sample',
    timestamp: toNum(attrs[FIELD_MAP.time]),
    timestampSystem: Date.now(),
    timestampTracker: toNum(attrs[FIELD_MAP.cnt]),
    gazeX: toNum(attrs[FIELD_MAP.bpogx]),
    gazeY: toNum(attrs[FIELD_MAP.bpogy]),
    gazeValid: attrs[FIELD_MAP.bpogv] === '1',
    // Fijación filtrada (distinta de BPOG)
    fpogX: toNum(attrs[FIELD_MAP.fpogx]),
    fpogY: toNum(attrs[FIELD_MAP.fpogy]),
    fpogS: toNum(attrs[FIELD_MAP.fpogs]),
    fpogD: toNum(attrs[FIELD_MAP.fpogd]),
    fpogValid: attrs[FIELD_MAP.fpogv] === '1',
    // LPUPILD/RPUPILD vienen en METROS del protocolo — se convierten a
    // milímetros (×1000) porque así se usa el resto del sistema (LPMM/RPMM
    // en el CSV, unidad más natural para reportar diámetro de pupila).
    // OJO: null * 1000 da 0 en JS, no null — hay que chequear null antes de
    // multiplicar para no inventar un "0mm" falso cuando el dato falta.
    pupilDiameterLeft: (() => {
      const meters = attrs[FIELD_MAP.lpupilv] === '1' ? toNum(attrs[FIELD_MAP.lpupild]) : null
      return meters != null ? meters * 1000 : null
    })(),
    pupilDiameterRight: (() => {
      const meters = attrs[FIELD_MAP.rpupilv] === '1' ? toNum(attrs[FIELD_MAP.rpupild]) : null
      return meters != null ? meters * 1000 : null
    })(),
    pupilValid: attrs[FIELD_MAP.lpupilv] === '1' || attrs[FIELD_MAP.rpupilv] === '1',
    lpmmValid: attrs[FIELD_MAP.lpupilv] === '1',
    rpmmValid: attrs[FIELD_MAP.rpupilv] === '1',
    // Datos crudos de imagen de cámara por ojo
    lpcX: toNum(attrs[FIELD_MAP.lpcx]),
    lpcY: toNum(attrs[FIELD_MAP.lpcy]),
    lpd: toNum(attrs[FIELD_MAP.lpd]),
    lps: toNum(attrs[FIELD_MAP.lps]),
    lpv: attrs[FIELD_MAP.lpv] === '1',
    rpcX: toNum(attrs[FIELD_MAP.rpcx]),
    rpcY: toNum(attrs[FIELD_MAP.rpcy]),
    rpd: toNum(attrs[FIELD_MAP.rpd]),
    rps: toNum(attrs[FIELD_MAP.rps]),
    rpv: attrs[FIELD_MAP.rpv] === '1',
    fixationId: toNum(attrs[FIELD_MAP.fpogid]),
    eventType: bkid && bkid > 0 ? 'blink' : 'none',
    bkid: bkid,
    bkdur: toNum(attrs[FIELD_MAP.bkdur]),
    bkpmin: toNum(attrs[FIELD_MAP.bkpmin]),
    // best-effort: null si el hardware/firmware no lo reporta
    dial: toNum(attrs[FIELD_MAP.dial]),
    dialValid: attrs[FIELD_MAP.dialv] === '1',
  }
}

// ------------------------------------------------------------------------
// WebSocket server — the browser side connects here.
// ------------------------------------------------------------------------
// Estas variables deben declararse ANTES de cualquier código que pueda
// invocar connectToGazepoint() (más abajo, en la rama `else` del bloque
// MOCK). `let` no se inicializa hasta que su línea de declaración se
// ejecuta ("temporal dead zone"), así que si connectToGazepoint() corriera
// antes de esta declaración, `gpSocket = ...` fallaría con
// "Cannot access 'gpSocket' before initialization" — exactamente el error
// que se estaba produciendo, porque esta declaración vivía después del
// bloque `if (MOCK) {...} else { connectToGazepoint() }`.
let gpSocket = null
let gpConnected = false
let reconnectDelay = 1000

const wss = new WebSocketServer({ port: BRIDGE_PORT, host: '127.0.0.1' })
const clients = new Set()

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'status', connected: gpConnected, mock: MOCK }))

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.type === 'command' && typeof msg.xml === 'string') {
      sendToGazepoint(msg.xml)
    }
  })

  ws.on('close', () => clients.delete(ws))
})

function broadcast(obj) {
  const payload = JSON.stringify(obj)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

console.log(`[gazepoint-bridge] WebSocket server listening on ws://127.0.0.1:${BRIDGE_PORT}`)

// ------------------------------------------------------------------------
// Mock mode — synthetic 60Hz stream so the web app can be developed and
// the API-side pipeline exercised without a physical GP3 attached.
// ------------------------------------------------------------------------
if (MOCK) {
  console.log('[gazepoint-bridge] Running in --mock mode: samples are SIMULATED, not from real hardware.')
  let cnt = 0
  const t0 = Date.now()
  setInterval(() => {
    cnt += 1
    const t = (Date.now() - t0) / 1000
    const fixId = Math.floor(t / 0.4)
    broadcast({
      type: 'sample',
      simulated: true,
      timestamp: t,
      timestampSystem: Date.now(),
      timestampTracker: cnt,
      gazeX: 0.5 + Math.sin(t * 0.7) * 0.05,
      gazeY: 0.5 + Math.cos(t * 0.5) * 0.05,
      gazeValid: true,
      fpogX: 0.5 + Math.sin(t * 0.7) * 0.05,
      fpogY: 0.5 + Math.cos(t * 0.5) * 0.05,
      fpogS: fixId * 0.4,
      fpogD: t - fixId * 0.4,
      fpogValid: true,
      pupilDiameterLeft: 3.2 + Math.sin(t * 0.2) * 0.15,
      pupilDiameterRight: 3.1 + Math.sin(t * 0.2) * 0.15,
      pupilValid: true,
      lpmmValid: true,
      rpmmValid: true,
      lpcX: 0.45 + Math.sin(t * 0.3) * 0.02,
      lpcY: 0.5 + Math.cos(t * 0.3) * 0.02,
      lpd: 14.8 + Math.sin(t * 0.2) * 0.5,
      lps: 1.0,
      lpv: true,
      rpcX: 0.55 + Math.sin(t * 0.3) * 0.02,
      rpcY: 0.5 + Math.cos(t * 0.3) * 0.02,
      rpd: 14.5 + Math.sin(t * 0.2) * 0.5,
      rps: 1.0,
      rpv: true,
      fixationId: fixId,
      eventType: 'none',
      bkid: 0,
      bkdur: 0,
      bkpmin: 12,
      dial: null,
      dialValid: false,
    })
  }, 1000 / MOCK_HZ)

  // Fake a calibration result 1.5s after receiving a CALIBRATE_START command.
} else {
  connectToGazepoint()
}

// ------------------------------------------------------------------------
// Real TCP connection to Gazepoint Control.
// ------------------------------------------------------------------------
function connectToGazepoint() {
  gpSocket = net.createConnection({ host: GAZEPOINT_HOST, port: GAZEPOINT_PORT }, () => {
    gpConnected = true
    reconnectDelay = 1000
    console.log(`[gazepoint-bridge] Connected to Gazepoint Control at ${GAZEPOINT_HOST}:${GAZEPOINT_PORT}`)
    for (const cmd of ENABLE_COMMANDS) sendToGazepoint(cmd)
    broadcast({ type: 'status', connected: true, mock: false })
  })

  let buffer = ''
  gpSocket.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    let idx
    while ((idx = buffer.indexOf('\r\n')) !== -1 || (idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      handleLine(line)
    }
  })

  gpSocket.on('error', (err) => {
    console.error('[gazepoint-bridge] TCP error:', err.message)
  })

  gpSocket.on('close', () => {
    gpConnected = false
    broadcast({ type: 'status', connected: false, mock: false })
    console.warn(
      `[gazepoint-bridge] Disconnected from Gazepoint Control. Retrying in ${reconnectDelay}ms — ` +
        'make sure Gazepoint Control is running and the GP3 is connected.'
    )
    setTimeout(connectToGazepoint, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
  })
}

function sendToGazepoint(xml) {
  if (MOCK) {
    handleMockCommand(xml)
    return
  }
  if (gpSocket && gpConnected) {
    gpSocket.write(xml + '\r\n')
  }
}

function handleLine(line) {
  const parsed = parseTag(line)
  if (!parsed) return
  const { tag, attrs } = parsed

  if (tag === 'REC') {
    // DIAGNÓSTICO (no modifica el dato, solo avisa una vez): confirma que
    // LPUPILD/RPUPILD (pupila en metros, la fuente real de LPMM/RPMM en el
    // CSV) efectivamente llegan una vez habilitados ENABLE_SEND_EYE_LEFT/
    // RIGHT. Si después de esto siguen sin llegar, es casi seguro un
    // problema de conexión/calibración del GP3, no de nombres de comando —
    // ya se confirmó contra el manual oficial completo que estos son los
    // nombres y comandos correctos.
    if (!global.__lpupildDiagnosticDone) {
      global.__lpupildDiagnosticSamples = (global.__lpupildDiagnosticSamples || 0) + 1
      if (attrs.LPUPILD !== undefined) {
        global.__lpupildDiagnosticDone = true
        console.log('[gazepoint-bridge] Diagnóstico LPUPILD/RPUPILD (pupila en mm): llegando correctamente. OK.')
      } else if (global.__lpupildDiagnosticSamples >= 120) {
        global.__lpupildDiagnosticDone = true
        console.warn(
          '[gazepoint-bridge] AVISO: tras 120 muestras reales, LPUPILD nunca llegó, a pesar de haber ' +
          'enviado ENABLE_SEND_EYE_LEFT. Verifica que el GP3 esté detectando el ojo correctamente ' +
          '(revisa la ventana de Gazepoint Control) y que la calibración se haya completado. ' +
          'LPD/RPD (pupila en píxeles) deberían seguir funcionando de todas formas.'
        )
      }
    }
    broadcast(recToSample(attrs))
  } else if (tag === 'CAL' || tag === 'ACK') {
    // BUG CORREGIDO: Gazepoint Control NO envía el resumen numérico de
    // calibración (CALIBRATE_RESULT_SUMMARY) por su cuenta al terminar la
    // secuencia de 5 puntos. Hay que pedirlo explícitamente con un GET — así
    // lo documenta el manual oficial (sección 3.19) y así lo hacen las
    // integraciones de terceros verificadas (PsychoPy, Matlab). Sin este
    // GET, `calibrationResolveRef` en useEyeTracker.ts nunca se resuelve por
    // la vía normal y SIEMPRE cae en el timeout de 20s con `averageErrorDeg:
    // null` — es decir, toda calibración contra hardware real se reportaría
    // como fallida sin importar qué tan bien haya salido en realidad.
    // El mensaje `<CAL ID="CALIB_RESULT" .../>` es, según el manual, el
    // último mensaje que Gazepoint envía al terminar la calibración —
    // momento en el que pedimos el resumen.
    let points = null
    if (tag === 'CAL' && attrs.ID === 'CALIB_RESULT') {
      sendToGazepoint('<GET ID="CALIBRATE_RESULT_SUMMARY" />')

      // BUG CORREGIDO (falso "Fallida" con Gazepoint mostrando éxito):
      // - Los mensajes CALIB_START_PT/CALIB_RESULT_PT (uno por punto, x2)
      //   NUNCA traen un atributo "ERR" — eso no existe en el protocolo
      //   oficial (manual v2.0, sección 4.1/4.2: solo PT/CALX/CALY). El
      //   código anterior asumía que sí, así que `errorDeg` por punto
      //   siempre terminaba en `null`, y además contaba CADA mensaje con
      //   un atributo PT (el de inicio Y el de resultado) como si fueran
      //   puntos distintos — de ahí los "10 puntos" en vez de 5.
      // - El único lugar donde SÍ hay coordenadas reales de mirada por
      //   punto es este mensaje CALIB_RESULT (CALX?/CALY? = objetivo,
      //   LX?/LY?/RX?/RY? = mirada medida, todo en fracción de pantalla
      //   0..1 — unidad documentada en la sección 4.3). Aquí se calcula
      //   la distancia euclidiana real (target vs. medido) por punto y
      //   por ojo, que es lo único con unidad conocida y convertible a
      //   grados de forma confiable (el navegador hace esa conversión
      //   usando el tamaño de pantalla/distancia de visión configurados).
      points = []
      for (let n = 1; attrs[`CALX${n}`] !== undefined; n++) {
        const calX = Number(attrs[`CALX${n}`])
        const calY = Number(attrs[`CALY${n}`])
        const lv = attrs[`LV${n}`] === '1'
        const rv = attrs[`RV${n}`] === '1'
        const leftErr = lv
          ? Math.hypot(Number(attrs[`LX${n}`]) - calX, Number(attrs[`LY${n}`]) - calY)
          : null
        const rightErr = rv
          ? Math.hypot(Number(attrs[`RX${n}`]) - calX, Number(attrs[`RY${n}`]) - calY)
          : null
        const valid = [leftErr, rightErr].filter((e) => e !== null)
        points.push({
          point: n,
          targetX: calX,
          targetY: calY,
          // Distancia euclidiana en fracción de pantalla (0..1); el navegador
          // la convierte a grados con el tamaño de pantalla configurado.
          errorFraction: valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
          leftValid: lv,
          rightValid: rv,
        })
      }
    }
    // Calibration acks/results — forwarded as-is (raw attrs) since the
    // exact shape of calibration responses varies more across Gazepoint
    // versions than the REC data stream does. The browser-side hook
    // interprets `type: 'calibration_event'` payloads defensively.
    // `points` (cuando existe) trae el error real calculado arriba.
    broadcast({ type: 'calibration_event', tag, attrs, points })
  }
}

// Mock calibration: any CALIBRATE_START command triggers a fake sequence
// of 5 calibration points with plausible error values, finishing ~1.5s later.
function handleMockCommand(xml) {
  if (xml.includes('CALIBRATE_START')) {
    console.log('[gazepoint-bridge] (mock) Calibration started')
    setTimeout(() => {
      // Simula el mensaje real CALIB_RESULT: 5 puntos con error pequeño y
      // realista en fracción de pantalla (no en "grados" — eso lo calcula
      // el navegador). AVE_ERROR mock ajustado a la magnitud real reportada
      // por Gazepoint (~15-25, como el propio ejemplo del manual: 19.43),
      // no al ~1 que tenía antes — para que probar en --mock no oculte
      // este tipo de confusión de unidades en el futuro.
      const points = [0, 1, 2, 3, 4].map((i) => ({
        point: i + 1,
        errorFraction: 0.01 + Math.random() * 0.02,
        leftValid: true,
        rightValid: true,
      }))
      broadcast({
        type: 'calibration_event',
        tag: 'CAL',
        attrs: { ID: 'CALIB_RESULT' },
        points,
        simulated: true,
      })
    }, 1500)
    setTimeout(() => {
      broadcast({
        type: 'calibration_event',
        tag: 'ACK',
        attrs: { ID: 'CALIBRATE_RESULT_SUMMARY', AVE_ERROR: (15 + Math.random() * 10).toFixed(2), VALID_POINTS: '5' },
        simulated: true,
      })
    }, 1700)
  }
}

process.on('SIGINT', () => {
  console.log('\n[gazepoint-bridge] Shutting down...')
  if (gpSocket) gpSocket.destroy()
  wss.close(() => process.exit(0))
})
