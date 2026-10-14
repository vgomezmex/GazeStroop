import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

const PERSONAL_FIELDS = [
  'fullName', 'age', 'sex', 'education', 'computerHoursPerDay',
  'glassesUse', 'visualDifficulty', 'visualDifficultyDesc',
  'hoursSleepLastNight', 'sleepQuality', 'currentRestLevel', 'currentFatigueLevel',
  'stateFatigue', 'stateStress', 'stateSleepiness', 'stateMotivation', 'stateConcentration',
  'caffeineLast3h', 'caffeineType', 'caffeineAmount', 'caffeineTime',
  'alcoholLast12h', 'exerciseLast3h', 'lastMealTime', 'locationComfort',
] as const;

function stripPersonal<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!PERSONAL_FIELDS.includes(key as typeof PERSONAL_FIELDS[number])) {
      result[key] = value;
    }
  }
  return result;
}

function safeSerialize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function flattenForCsv(
  obj: Record<string, unknown>
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    flat[key] = safeSerialize(value);
  }
  return flat;
}

// ============================================================
// INDIVIDUAL CSV PER SUBJECT — datos crudos del eye tracker
//
// Una fila por cada muestra REAL capturada del Gazepoint (fases 'baseline'
// y 'trial'), con exactamente las columnas que el tester marcó en su PDF
// de referencia ("Estas_variables_son_las_que_nos_interesan_del_dispositivo"),
// más las columnas adicionales que pidió agregar: tipo de prueba, error,
// omisión, RT, sexo, uso de lentes, dificultad visual y el timestamp de
// pared (system time) de cada muestra.
//
// No hay reloj sintético de respaldo aquí: si la sesión no tiene muestras
// reales del eye tracker (se corrió sin gazepoint-bridge conectado), el CSV
// sale solo con encabezados — inventar datos de un dispositivo que no
// estuvo conectado sería engañoso para el análisis.
// ============================================================
// ============================================================
// SACCADE_MAG / SACCADE_DIR
//
// Gazepoint no manda estos campos en el stream — se calculan aquí a partir
// de las fijaciones consecutivas ya guardadas (FPOGID/FPOGX/FPOGY). Una
// sácada es el salto entre el centroide de una fijación y el de la
// siguiente. Solo se calcula DENTRO de un mismo tramo de grabación
// continuo (misma fase + mismo ensayo) — entre ensayos (o entre línea base
// y el primer ensayo) hay un hueco sin grabar (ver la sesión donde se
// decidió NO grabar de forma continua), así que el salto de posición ahí
// no es una sácada real medible, es solo la distancia entre dos puntos
// separados por tiempo no observado. Esas transiciones quedan sin valor
// (null) a propósito, en vez de inventar un número engañoso.
function computeSaccades(
  samples: Array<{ fixationId: number | null; fpogX: number | null; fpogY: number | null; phase: string; trialId: string | null }>
): Map<number, { magnitude: number; directionDeg: number }> {
  interface FixInfo { fixationId: number; continuityKey: string; sumX: number; sumY: number; count: number }

  const fixationOrder: number[] = [];
  const fixations = new Map<number, FixInfo>();

  for (const s of samples) {
    if (s.fixationId == null || s.fpogX == null || s.fpogY == null) continue;
    const continuityKey = s.phase === 'baseline' ? 'baseline' : `trial:${s.trialId ?? 'unknown'}`;
    let info = fixations.get(s.fixationId);
    if (!info) {
      info = { fixationId: s.fixationId, continuityKey, sumX: 0, sumY: 0, count: 0 };
      fixations.set(s.fixationId, info);
      fixationOrder.push(s.fixationId);
    }
    info.sumX += s.fpogX;
    info.sumY += s.fpogY;
    info.count += 1;
  }

  const result = new Map<number, { magnitude: number; directionDeg: number }>();
  let prevId: number | null = null;

  for (const fid of fixationOrder) {
    const cur = fixations.get(fid)!;
    if (prevId != null) {
      const prev = fixations.get(prevId)!;
      if (prev.continuityKey === cur.continuityKey) {
        const curX = cur.sumX / cur.count;
        const curY = cur.sumY / cur.count;
        const prevX = prev.sumX / prev.count;
        const prevY = prev.sumY / prev.count;
        const dx = curX - prevX;
        // Se invierte Y: en coordenadas de pantalla Y crece hacia abajo,
        // pero para reportar el ángulo en la convención matemática
        // habitual (0°=derecha, 90°=arriba, sentido antihorario) hay que
        // usar el eje Y matemático (crece hacia arriba).
        const dy = -(curY - prevY);
        const magnitude = Math.hypot(dx, dy);
        let directionDeg = Math.atan2(dy, dx) * (180 / Math.PI);
        if (directionDeg < 0) directionDeg += 360;
        result.set(fid, {
          magnitude: Math.round(magnitude * 10000) / 10000,
          directionDeg: Math.round(directionDeg * 100) / 100,
        });
      }
      // continuityKey distinto → hueco de grabación entre fijaciones: sin
      // valor para fid (no se agrega al Map, así que sale vacío en el CSV).
    }
    prevId = fid;
  }

  return result;
}

async function generateIndividualCsv(sessionId: string): Promise<string> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { participant: true, trials: { orderBy: { trialStartedAt: 'asc' } } },
  });
  if (!session || !session.participant) return '';

  const p = session.participant;
  const sexo = p.sex === 'Mujer' ? 1 : 0;
  const usaLentes = p.glassesUse && p.glassesUse !== 'No' ? 1 : 0;
  const enfermedadVista = p.visualDifficulty === 'Sí' ? 1 : 0;

  const trialById = new Map<string, (typeof session.trials)[number]>(
    session.trials.map((t) => [t.id, t])
  );

  // Número de ensayo DENTRO de su bloque/condición (1..N), mismo criterio
  // que ya se usa en el resto de las exportaciones (se reinicia por cada
  // condición: WORD, COLOR, REVERSE_STROOP, STROOP, NEUTRAL).
  const ensayoByTrialId = new Map<string, number>();
  {
    const counters: Record<string, number> = {};
    for (const t of session.trials) {
      counters[t.condition] = (counters[t.condition] || 0) + 1;
      ensayoByTrialId.set(t.id, counters[t.condition]);
    }
  }

  const headers = [
    // Identificador del participante — primera columna, tal como en
    // Ejemplo_Raw_Stroop.csv (útil sobre todo si se concatenan varios CSV
    // individuales para análisis conjunto).
    'Participante_Id',
    // --- Campos crudos del dispositivo, en el mismo orden del PDF ---
    // NOTA sobre FPOGX/FPOGY: se dejan CRUDOS, tal como los reporta
    // Gazepoint. Es normal y esperado que se salgan ligeramente del rango
    // [0,1] cuando el participante mira cerca del borde de la pantalla —
    // el propio algoritmo de fijación del dispositivo extrapola la mirada
    // linealmente más allá del borde, no es un error de nuestro parser.
    // Si el análisis lo requiere, recortar (clip) a [0,1] es una decisión
    // de quien analiza los datos, no algo que el sistema deba forzar aquí.
    'TIME', 'FPOGX', 'FPOGY', 'FPOGS', 'FPOGD', 'FPOGID', 'FPOGV',
    'BPOGX', 'BPOGY', 'BPOGV',
    'LPCX', 'LPCY', 'LPD', 'LPS', 'LPV',
    'RPCX', 'RPCY', 'RPD', 'RPS', 'RPV',
    'BKID', 'BKDUR', 'BKPMIN',
    'LPMM', 'LPMMV', 'RPMM', 'RPMMV',
    'DIAL', 'DIALV',
    // Sácada de entrada a la fijación de esta muestra (ver computeSaccades
    // más abajo): SACCADE_MAG en fracción de pantalla (misma unidad que
    // FPOGX/Y), SACCADE_DIR en grados 0-360°, convención matemática
    // estándar (0°=derecha/+X, 90°=arriba, sentido antihorario; el eje Y de
    // pantalla se invierte para esta conversión, ya que en pantalla Y crece
    // hacia abajo). Vacío cuando no es calculable (primera fijación de la
    // sesión, o la fijación anterior quedó del otro lado de un hueco de
    // grabación — p. ej. el intervalo entre ensayos, que no se graba).
    'SACCADE_MAG', 'SACCADE_DIR',
    // --- Columnas adicionales pedidas por el tester ---
    'Tipo_exp', 'Tipo_prueba', 'Ensayo', 'Error', 'Omision', 'RT', 'Sexo', 'Usa_lentes', 'Enfermedad_vista',
    'Respuesta_correcta', 'Respuesta_participante', 'TimeStamp',
  ];

  const lines: string[] = [headers.map(escapeCsv).join(',')];

  // Todas las muestras reales de la sesión, en orden cronológico, tanto de
  // la línea base pupilar (sin ensayo) como de los ensayos experimentales.
  const samples = await db.eyeTrackingSample.findMany({
    where: { sessionId, phase: { in: ['baseline', 'trial'] } },
    orderBy: { timestamp: 'asc' },
  });

  const saccadeByFixationId = computeSaccades(samples);

  const bool01 = (v: boolean | null | undefined): number => (v ? 1 : 0);

  for (const s of samples) {
    const trial = s.trialId ? trialById.get(s.trialId) : null;
    const sacc = s.fixationId != null ? saccadeByFixationId.get(s.fixationId) : null;

    // Tipo_exp: tipo de BLOQUE/prueba. 0=línea base, 1=Neutral, 2=Word Test,
    // 3=Reverse Stroop, 4=Color Test, 5=Stroop Test.
    const TIPO_EXP_POR_CONDICION: Record<string, number> = {
      NEUTRAL: 1,
      WORD: 2,
      REVERSE_STROOP: 3,
      COLOR: 4,
      STROOP: 5,
    };
    const tipoExp = !trial ? 0 : (TIPO_EXP_POR_CONDICION[trial.condition] ?? 0);
    // Tipo_prueba: CONGRUENCIA (a petición del tester, se conserva tal cual
    // se entendió originalmente). 0=línea base, 1=congruente, 2=incongruente,
    // 3=neutral. Es un concepto distinto de Tipo_exp (bloque) — ambas
    // columnas coexisten porque responden preguntas de análisis distintas.
    const tipoPrueba = !trial
      ? 0
      : trial.congruency === 'congruent'
        ? 1
        : trial.congruency === 'neutral'
          ? 3
          : 2;
    // 0/1 siempre, nunca vacío (incluso en las filas de línea base, donde
    // "sin error/sin omisión" es la lectura correcta: 0 = ausente).
    const error = trial ? (trial.accuracy === 'incorrect' ? 1 : 0) : 0;
    const omision = trial ? (trial.isOmission ? 1 : 0) : 0;
    const rt = trial?.reactionTimeMs != null ? Math.round(trial.reactionTimeMs) : '';

    const row = [
      p.studyCode,
      s.timestamp,
      s.fpogX ?? '',
      s.fpogY ?? '',
      s.fpogS ?? '',
      s.fpogD ?? '',
      s.fixationId ?? '',
      bool01(s.fpogValid),
      s.gazeX ?? '',
      s.gazeY ?? '',
      bool01(s.gazeValid),
      s.lpcX ?? '',
      s.lpcY ?? '',
      s.lpd ?? '',
      s.lps ?? '',
      bool01(s.lpv),
      s.rpcX ?? '',
      s.rpcY ?? '',
      s.rpd ?? '',
      s.rps ?? '',
      bool01(s.rpv),
      s.bkid ?? '',
      s.bkdur ?? '',
      s.bkpmin ?? '',
      s.pupilDiameterLeft ?? '',
      bool01(s.lpmmValid),
      s.pupilDiameterRight ?? '',
      bool01(s.rpmmValid),
      s.dial ?? '',
      bool01(s.dialValid),
      sacc ? sacc.magnitude : '',
      sacc ? sacc.directionDeg : '',
      tipoExp,
      tipoPrueba,
      trial && s.trialId ? (ensayoByTrialId.get(s.trialId) ?? '') : '',
      error,
      omision,
      rt,
      sexo,
      usaLentes,
      enfermedadVista,
      trial?.correctAnswer ?? '',
      trial?.participantResponse ?? '',
      s.timestampSystem ?? '',
    ];
    lines.push(row.map((v) => escapeCsv(String(v))).join(','));
  }

  return lines.join('\n');
}

// ============================================================
// STATISTICAL EXPORT — Variables de operacionalización
// ============================================================
function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function computeStd(arr: number[], mean: number): number {
  if (arr.length <= 1) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1));
}

function computeIqr(arr: number[]): number {
  if (arr.length < 2) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)];
}

function computeCv(std: number, mean: number): number {
  return mean > 0 ? (std / mean) * 100 : 0;
}

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sanitizeForCsv(value: string): string {
  // First remove accents (NFD)
  let result = removeAccents(value);
  // Replace en-dash, em-dash, and other special Unicode chars with ASCII equivalents
  result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-'); // dashes
  result = result.replace(/[\u2018\u2019\u201a]/g, "'");            // single quotes
  result = result.replace(/[\u201c\u201d\u201e\u201f]/g, '"');         // double quotes
  result = result.replace(/\u2026/g, '...');                           // ellipsis
  result = result.replace(/[^\x20-\x7E\n]/g, '');                       // strip any remaining non-ASCII
  return result;
}

function esc(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const safe = sanitizeForCsv(str);
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

async function generateStatisticalCsv(subjectIdsFilter?: string | null): Promise<string> {
  const whereClause: Record<string, unknown> = { completedAt: { not: null } };
  if (subjectIdsFilter) {
    const ids = subjectIdsFilter.split(',').filter(Boolean);
    if (ids.length > 0) whereClause.participantId = { in: ids };
  }

  const sessions = await db.session.findMany({
    where: whereClause,
    include: {
      participant: true,
      trials: { orderBy: { trialStartedAt: 'asc' } },
    },
    orderBy: { startedAt: 'asc' },
  });

  if (sessions.length === 0) return '';

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* use default */ }

  const headers = [
    'codigo_participante', 'codigo_sesion',
    'edad', 'sexo', 'escolaridad', 'horas_computadora_dia',
    'uso_lentes', 'dificultad_visual',
    'horas_sueno_anoche', 'calidad_sueno', 'nivel_descanso', 'nivel_cansancio',
    'estres', 'somnolencia', 'motivacion', 'capacidad_concentracion',
    'consumo_cafeina', 'consumo_alcohol', 'ejercicio',
    'ultima_comida', 'ambiente_confort',
    'condicion_stroop', 'tipo_prueba', 'bloque', 'ensayo',
    'rt_ms', 'accuracy', 'errores', 'omisiones', 'respuesta_anticipatoria',
    'palabra_estimulo', 'color_tinta', 'respuesta_participante', 'respuesta_correcta',
    'rt_mediano_bloque', 'rt_media_bloque', 'rt_sd_bloque', 'rt_iqr_bloque', 'rt_cv_bloque',
    'accuracy_bloque_pct', 'errores_bloque', 'omisiones_bloque', 'anticipatorias_bloque',
    'interferencia_stroop_ms', 'interferencia_relativa_pct', 'costo_precision_pct',
    'nasa_carga_mental', 'nasa_demanda_fisica', 'nasa_demanda_temporal',
    'nasa_rendimiento_percibido', 'nasa_esfuerzo', 'nasa_frustracion', 'nasa_global',
    'dificultad_percibida', 'fatiga_posterior', 'concentracion_percibida', 'dificultad_responder',
    'experiencia_claridad_prueba', 'experiencia_claridad_instrucciones',
    'experiencia_tiempo', 'distracciones',
    'calibracion_estado', 'calibracion_error_deg',
    'investigador_movimiento_cabeza', 'investigador_problemas_tracking',
    'investigador_calib_estable', 'investigador_interrupciones',
    'investigador_sigio_instrucciones', 'excluido_analisis', 'razon_exclusion',
  ];

  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const trials = session.trials;

    const conditions = ['WORD', 'NEUTRAL', 'REVERSE_STROOP', 'COLOR', 'STROOP'] as const;
    const blockStats: Record<string, { rts: number[]; correct: number; incorrect: number; omissions: number; anticipatory: number; total: number }> = {};
    for (const cond of conditions) {
      blockStats[cond] = { rts: [], correct: 0, incorrect: 0, omissions: 0, anticipatory: 0, total: 0 };
    }

    for (const trial of trials) {
      const bs = blockStats[trial.condition as keyof typeof blockStats];
      if (!bs) continue;
      bs.total++;
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      if (isAnt) bs.anticipatory++;
      if (trial.isOmission) { bs.omissions++; continue; }
      if (trial.accuracy === 'correct') bs.correct++;
      if (trial.accuracy === 'incorrect') bs.incorrect++;
      if (trial.reactionTimeMs != null && !isAnt) bs.rts.push(trial.reactionTimeMs);
    }

    const bss: Record<string, { rtMedian: number; rtMean: number; rtStd: number; rtIqr: number; rtCv: number; accuracyPct: number; errors: number; omissions: number; anticipatory: number }> = {};
    for (const [cond, bs] of Object.entries(blockStats)) {
      const rtMean = bs.rts.length > 0 ? bs.rts.reduce((a, b) => a + b, 0) / bs.rts.length : 0;
      const rtStd = computeStd(bs.rts, rtMean);
      bss[cond] = {
        rtMedian: computeMedian(bs.rts),
        rtMean,
        rtStd,
        rtIqr: computeIqr(bs.rts),
        rtCv: computeCv(rtStd, rtMean),
        accuracyPct: bs.total > 0 ? (bs.correct / bs.total) * 100 : 0,
        errors: bs.incorrect,
        omissions: bs.omissions,
        anticipatory: bs.anticipatory,
      };
    }

    const congruentRts: number[] = [];
    const incongruentRts: number[] = [];
    const congruentAcc: number[] = [];
    const incongruentAcc: number[] = [];

    for (const trial of trials) {
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      if (isAnt || trial.isOmission) continue;
      if (trial.congruency === 'congruent') {
        if (trial.reactionTimeMs != null) congruentRts.push(trial.reactionTimeMs);
        congruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      } else if (trial.congruency === 'incongruent') {
        if (trial.reactionTimeMs != null) incongruentRts.push(trial.reactionTimeMs);
        incongruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      }
    }

    const cMeanRt = congruentRts.length > 0 ? congruentRts.reduce((a, b) => a + b, 0) / congruentRts.length : 0;
    const iMeanRt = incongruentRts.length > 0 ? incongruentRts.reduce((a, b) => a + b, 0) / incongruentRts.length : 0;
    const interferenceStroop = iMeanRt - cMeanRt;
    const interferenceRelative = cMeanRt > 0 ? ((iMeanRt - cMeanRt) / cMeanRt) * 100 : 0;
    const cAccPct = congruentAcc.length > 0 ? congruentAcc.reduce((a, b) => a + b, 0) / congruentAcc.length * 100 : 0;
    const iAccPct = incongruentAcc.length > 0 ? incongruentAcc.reduce((a, b) => a + b, 0) / incongruentAcc.length * 100 : 0;
    const accuracyCost = cAccPct - iAccPct;

    const trialCounters: Record<string, number> = {};
    for (const cond of conditions) trialCounters[cond] = 0;

    for (const trial of trials) {
      trialCounters[trial.condition] = (trialCounters[trial.condition] || 0) + 1;
      const trialNum = trialCounters[trial.condition];
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      const bs = bss[trial.condition] || { rtMedian: 0, rtMean: 0, rtStd: 0, rtIqr: 0, rtCv: 0, accuracyPct: 0, errors: 0, omissions: 0, anticipatory: 0 };
      const condicionStroop = trial.congruency === 'congruent' ? 'Congruente' : trial.congruency === 'neutral' ? 'Neutral' : 'Incongruente';

      const row = [
        p.studyCode, session.id,
        p.age, p.sex, p.education, p.computerHoursPerDay,
        p.glassesUse, p.visualDifficulty,
        p.hoursSleepLastNight, p.sleepQuality, p.currentRestLevel, p.currentFatigueLevel,
        p.stateStress, p.stateSleepiness, p.stateMotivation, p.stateConcentration,
        p.caffeineLast3h, p.alcoholLast12h, p.exerciseLast3h,
        p.lastMealTime, p.locationComfort,
        condicionStroop, trial.condition, trial.blockOrder, trialNum,
        trial.reactionTimeMs ?? '',
        trial.accuracy === 'correct' ? 1 : trial.accuracy === 'incorrect' ? 0 : '',
        trial.accuracy === 'incorrect' ? 1 : 0,
        trial.isOmission ? 1 : 0,
        isAnt ? 1 : 0,
        trial.stimulusWord, trial.stimulusInkColorName, trial.participantResponse ?? '', trial.correctAnswer,
        Math.round(bs.rtMedian), Math.round(bs.rtMean), Math.round(bs.rtStd * 100) / 100,
        Math.round(bs.rtIqr), Math.round(bs.rtCv * 100) / 100,
        Math.round(bs.accuracyPct * 100) / 100, bs.errors, bs.omissions, bs.anticipatory,
        Math.round(interferenceStroop), Math.round(interferenceRelative * 100) / 100, Math.round(accuracyCost * 100) / 100,
        session.nasaMentalDemand ?? '', session.nasaPhysicalDemand ?? '',
        session.nasaTemporalDemand ?? '', session.nasaPerformance ?? '',
        session.nasaEffort ?? '', session.nasaFrustration ?? '', session.nasaGlobalScore ?? '',
        session.postDifficultyPerceived ?? '', session.postFatigue ?? '',
        session.postConcentrationReq ?? '', session.postDifficultyResponding ?? '',
        session.testClear ?? '', session.instructionsClear ?? '',
        session.timeSufficient ?? '', session.hadDistractions ?? '',
        session.calibrationStatus, session.calibrationErrorDeg ?? '',
        session.researcherExcessiveHead ?? '', session.researcherTrackingProbs ?? '',
        session.researcherCalibStable ?? '', session.researcherInterruptions ?? '',
        session.researcherFollowedInstr ?? '',
        session.excludedFromAnalysis ? 1 : 0, session.exclusionReason ?? '',
      ];
      lines.push(row.map(v => escapeCsv(String(v ?? ''))).join(','));
    }
  }

  return lines.join('\n');
}

// ============================================================
// SESSION REPORT CSV — Results from the detail view
// Flat table: one row per experimental condition, all metadata as columns
// No section titles, no summary rows. Easy to parse with pd.read_csv() or read.table()
async function generateSessionReportCsv(sessionId: string): Promise<string | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { participant: true, trials: { orderBy: { trialStartedAt: 'asc' } } },
  });
  if (!session || !session.participant) return null;

  const trials = session.trials.filter((t) => !t.isPractice);

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* default */ }

  const conditionLabel: Record<string, string> = {
    WORD: 'Word Test', NEUTRAL: 'Neutral', COLOR: 'Color Test',
    REVERSE_STROOP: 'Reverse Stroop', STROOP: 'Stroop Test',
  };
  const congruencyMap: Record<string, string> = {
    WORD: 'Congruente', NEUTRAL: 'Neutral', COLOR: 'Congruente',
    REVERSE_STROOP: 'Incongruente', STROOP: 'Incongruente',
  };

  // Group by condition
  const blockOrder: string[] = [];
  const blockTrials: Record<string, typeof trials> = {};
  for (const trial of trials) {
    if (!blockTrials[trial.condition]) {
      blockTrials[trial.condition] = [];
      blockOrder.push(trial.condition);
    }
    blockTrials[trial.condition].push(trial);
  }

  const blockSummaries = blockOrder.map((condition) => {
    const bTrials = blockTrials[condition];
    const correct = bTrials.filter((t) => t.accuracy === 'correct').length;
    const incorrect = bTrials.filter((t) => t.accuracy === 'incorrect').length;
    const omissions = bTrials.filter((t) => t.isOmission).length;
    const total = bTrials.length;
    const validRts = bTrials
      .filter((t) => t.reactionTimeMs != null && t.reactionTimeMs >= anticipatoryThreshold && !t.isOmission)
      .map((t) => t.reactionTimeMs!);
    const rtMean = validRts.length > 0 ? validRts.reduce((a, b) => a + b, 0) / validRts.length : 0;
    const rtMedian = computeMedian(validRts);
    const rtStd = computeStd(validRts, rtMean);
    const rtCv = computeCv(rtStd, rtMean);
    const anticipatory = bTrials.filter((t) => t.reactionTimeMs != null && t.reactionTimeMs < anticipatoryThreshold).length;
    return { condition, label: conditionLabel[condition] || condition, congruency: congruencyMap[condition] || 'Neutral', total, correct, incorrect, omissions, accuracyPct: total > 0 ? (correct / total) * 100 : 0, rtMean, rtMedian, rtStd, rtCv, anticipatory };
  });

  // Interference
  const allCRts: number[] = [], allIRts: number[] = [], allCAcc: number[] = [], allIAcc: number[] = [];
  for (const trial of trials) {
    const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
    if (isAnt || trial.isOmission) continue;
    if (trial.congruency === 'congruent') {
      if (trial.reactionTimeMs != null) allCRts.push(trial.reactionTimeMs);
      allCAcc.push(trial.accuracy === 'correct' ? 1 : 0);
    } else if (trial.congruency === 'incongruent') {
      if (trial.reactionTimeMs != null) allIRts.push(trial.reactionTimeMs);
      allIAcc.push(trial.accuracy === 'correct' ? 1 : 0);
    }
  }
  const cMeanRt = allCRts.length > 0 ? allCRts.reduce((a, b) => a + b, 0) / allCRts.length : 0;
  const iMeanRt = allIRts.length > 0 ? allIRts.reduce((a, b) => a + b, 0) / allIRts.length : 0;
  const interferenceStroop = Math.round(iMeanRt - cMeanRt);
  const interferenceRelative = cMeanRt > 0 ? Math.round(((iMeanRt - cMeanRt) / cMeanRt) * 1000) / 10 : 0;
  const cAccPct = allCAcc.length > 0 ? allCAcc.reduce((a, b) => a + b, 0) / allCAcc.length * 100 : 0;
  const iAccPct = allIAcc.length > 0 ? allIAcc.reduce((a, b) => a + b, 0) / allIAcc.length * 100 : 0;
  const accuracyCost = Math.round((cAccPct - iAccPct) * 10) / 10;

  // Session metadata (repeated per row)
  const fmt = (d: Date | null) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '';
  const meta = [
    escapeCsv(session.studyCode),
    escapeCsv(session.participant.studyCode),
    escapeCsv(session.researcherCode),
    escapeCsv(fmt(session.startedAt)),
  ];
  const nasa = [
    escapeCsv(session.nasaMentalDemand),
    escapeCsv(session.nasaPhysicalDemand),
    escapeCsv(session.nasaTemporalDemand),
    escapeCsv(session.nasaPerformance),
    escapeCsv(session.nasaEffort),
    escapeCsv(session.nasaFrustration),
    escapeCsv(session.nasaGlobalScore),
  ];
  const interf = [
    escapeCsv(interferenceStroop),
    escapeCsv(interferenceRelative),
    escapeCsv(accuracyCost),
  ];

  // Header
  const header = [
    'Codigo Sesion', 'Participante', 'Investigador', 'Fecha',
    'Condicion', 'Congruencia', 'Total', 'Correctos', 'Incorrectos', 'Omisiones', 'Anticipatorias',
    'Precision (%)', 'RT promedio (ms)', 'RT mediana (ms)', 'RT SD', 'RT CV (%)',
    'Interferencia Stroop (ms)', 'Interferencia relativa (%)', 'Costo precision (pp)',
    'Demanda Mental', 'Demanda Fisica', 'Demanda Temporal',
    'Rendimiento', 'Esfuerzo', 'Frustracion', 'NASA-TLX Global',
  ].map(escapeCsv).join(',');

  // One row per condition
  const rows = blockSummaries.map((bs) => [
    ...meta,
    escapeCsv(bs.label),
    escapeCsv(bs.congruency),
    escapeCsv(bs.total),
    escapeCsv(bs.correct),
    escapeCsv(bs.incorrect),
    escapeCsv(bs.omissions),
    escapeCsv(bs.anticipatory),
    escapeCsv(Math.round(bs.accuracyPct * 100) / 100),
    escapeCsv(Math.round(bs.rtMean)),
    escapeCsv(Math.round(bs.rtMedian)),
    escapeCsv(Math.round(bs.rtStd * 100) / 100),
    escapeCsv(Math.round(bs.rtCv * 100) / 100),
    ...interf,
    ...nasa,
  ].join(','));

  return [header, ...rows].join('\n');
}

// ============================================================
// COMPLETE CSV — One row per participant (Datos Completos)
// Includes: form fields A-F, per-condition accuracy & RT,
// interference indices, and 6 NASA-TLX dimensions
// ============================================================
// ============================================================
// ARCHIVOS ML (Requisitos v7) — un conjunto de 4 CSVs pensados para
// preparación de datos de Machine Learning, complementarios a las
// exportaciones existentes. Se descargan juntos al seleccionar sujetos en
// el panel de exportación.
// ============================================================

const ML_CONDITION_LABEL: Record<string, string> = {
  congruent: 'Congruente',
  incongruent: 'Incongruente',
  neutral: 'Neutral',
};

// ============================================================
// VALIDEZ DE EYE TRACKING (Solicitud de desarrollo del tester)
//
// FPOGV, LPV, RPV, LPMMV y RPMMV miden cosas DISTINTAS, no una sola "calidad
// general" — por eso se reportan como 3 indicadores separados en vez de un
// único porcentaje combinado:
//
//   - gaze_validity: basada en FPOGV. Indica si el dispositivo supo DÓNDE
//     estaba mirando la persona en ese instante (fijación válida). Es la
//     señal relevante para análisis de atención/mirada.
//   - pupil_pixel_validity: basada en LPV/RPV (al menos un ojo). Indica si
//     se detectó la pupila en la imagen de la cámara (posición y diámetro
//     en píxeles). Más permisiva que la siguiente.
//   - pupil_physical_validity: basada en LPMMV/RPMMV (al menos un ojo,
//     campo real del protocolo: LPUPILV/RPUPILV — ver gazepoint-bridge).
//     Es la más estricta: requiere además un modelo 3D del ojo válido para
//     poder expresar el diámetro en milímetros, no solo detectar la pupila.
//
// Una muestra cuenta como válida en pupil_pixel/pupil_physical si CUALQUIERA
// de los dos ojos es válido (no se exige que ambos lo sean), ya que para la
// mayoría de los análisis basta con tener el dato de un ojo.
//
// invalid_pct se calcula como (100 - validity_pct), no de forma
// independiente, para garantizar que ambos siempre sumen exactamente 100 —
// evita discrepancias de redondeo entre las dos columnas.
// ============================================================

interface EtValiditySample {
  fpogValid: boolean;
  lpv: boolean;
  rpv: boolean;
  lpmmValid: boolean;
  rpmmValid: boolean;
}

interface ValidityMetrics {
  eyetracking_total_samples: number;
  gaze_valid_samples: number;
  gaze_validity_pct: number;
  gaze_invalid_pct: number;
  pupil_pixel_valid_samples: number;
  pupil_pixel_validity_pct: number;
  pupil_pixel_invalid_pct: number;
  pupil_physical_valid_samples: number;
  pupil_physical_validity_pct: number;
  pupil_physical_invalid_pct: number;
}

function computeValidityMetrics(samples: EtValiditySample[]): ValidityMetrics {
  const total = samples.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

  const gazeValid = samples.filter((s) => s.fpogValid).length;
  const pixelValid = samples.filter((s) => s.lpv || s.rpv).length;
  const physicalValid = samples.filter((s) => s.lpmmValid || s.rpmmValid).length;

  const gazeValidityPct = pct(gazeValid);
  const pixelValidityPct = pct(pixelValid);
  const physicalValidityPct = pct(physicalValid);

  return {
    eyetracking_total_samples: total,
    gaze_valid_samples: gazeValid,
    gaze_validity_pct: gazeValidityPct,
    gaze_invalid_pct: Math.round((100 - gazeValidityPct) * 100) / 100,
    pupil_pixel_valid_samples: pixelValid,
    pupil_pixel_validity_pct: pixelValidityPct,
    pupil_pixel_invalid_pct: Math.round((100 - pixelValidityPct) * 100) / 100,
    pupil_physical_valid_samples: physicalValid,
    pupil_physical_validity_pct: physicalValidityPct,
    pupil_physical_invalid_pct: Math.round((100 - physicalValidityPct) * 100) / 100,
  };
}

const VALIDITY_HEADERS = [
  'eyetracking_total_samples',
  'gaze_valid_samples', 'gaze_validity_pct', 'gaze_invalid_pct',
  'pupil_pixel_valid_samples', 'pupil_pixel_validity_pct', 'pupil_pixel_invalid_pct',
  'pupil_physical_valid_samples', 'pupil_physical_validity_pct', 'pupil_physical_invalid_pct',
];

function validityRow(m: ValidityMetrics): (string | number)[] {
  return [
    m.eyetracking_total_samples,
    m.gaze_valid_samples, m.gaze_validity_pct, m.gaze_invalid_pct,
    m.pupil_pixel_valid_samples, m.pupil_pixel_validity_pct, m.pupil_pixel_invalid_pct,
    m.pupil_physical_valid_samples, m.pupil_physical_validity_pct, m.pupil_physical_invalid_pct,
  ];
}

async function fetchSessionsForMl(subjectIdsFilter?: string | null) {
  const whereClause: Record<string, unknown> = { completedAt: { not: null } };
  if (subjectIdsFilter) {
    const ids = subjectIdsFilter.split(',').filter(Boolean);
    if (ids.length > 0) whereClause.participantId = { in: ids };
  }
  return db.session.findMany({
    where: whereClause,
    include: { participant: true, trials: { orderBy: { trialStartedAt: 'asc' } } },
    orderBy: { startedAt: 'asc' },
  });
}

// --- 1) stroop_ML_subject_context.csv — una fila por sesión ---
async function generateMlSubjectContextCsv(subjectIdsFilter?: string | null): Promise<string> {
  const sessions = await fetchSessionsForMl(subjectIdsFilter);
  if (sessions.length === 0) return '';

  const headers = [
    'codigo_participante', 'codigo_sesion', 'edad', 'sexo', 'escolaridad', 'horas_computadora_dia',
    'uso_lentes', 'dificultad_visual', 'horas_sueno_anoche', 'calidad_sueno', 'nivel_descanso',
    'nivel_cansancio', 'estres', 'somnolencia', 'motivacion', 'capacidad_concentracion',
    'consumo_cafeina', 'consumo_alcohol', 'ejercicio', 'ultima_comida', 'ambiente_confort',
    'nasa_carga_mental', 'nasa_demanda_fisica', 'nasa_demanda_temporal', 'nasa_rendimiento_percibido',
    'nasa_esfuerzo', 'nasa_frustracion', 'nasa_global',
    'dificultad_percibida', 'fatiga_posterior', 'concentracion_percibida', 'dificultad_responder',
    'experiencia_claridad_prueba', 'experiencia_claridad_instrucciones', 'experiencia_tiempo', 'distracciones',
    'calibracion_estado', 'calibracion_error_deg',
    'investigador_movimiento_cabeza', 'investigador_problemas_tracking', 'investigador_calib_estable',
    'investigador_interrupciones', 'investigador_sigio_instrucciones',
    'excluido_analisis', 'razon_exclusion',
  ];
  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const row = [
      p.studyCode, session.id, p.age, p.sex, p.education, p.computerHoursPerDay,
      p.glassesUse, p.visualDifficulty, p.hoursSleepLastNight, p.sleepQuality, p.currentRestLevel,
      p.currentFatigueLevel, p.stateStress, p.stateSleepiness, p.stateMotivation, p.stateConcentration,
      p.caffeineLast3h, p.alcoholLast12h, p.exerciseLast3h, p.lastMealTime, p.locationComfort,
      session.nasaMentalDemand ?? '', session.nasaPhysicalDemand ?? '', session.nasaTemporalDemand ?? '',
      session.nasaPerformance ?? '', session.nasaEffort ?? '', session.nasaFrustration ?? '', session.nasaGlobalScore ?? '',
      session.postDifficultyPerceived ?? '', session.postFatigue ?? '', session.postConcentrationReq ?? '', session.postDifficultyResponding ?? '',
      session.testClear ?? '', session.instructionsClear ?? '', session.timeSufficient ?? '', session.hadDistractions ?? '',
      session.calibrationStatus, session.calibrationErrorDeg ?? '',
      session.researcherExcessiveHead ?? '', session.researcherTrackingProbs ?? '', session.researcherCalibStable ?? '',
      session.researcherInterruptions ?? '', session.researcherFollowedInstr ?? '',
      session.excludedFromAnalysis ? 1 : 0, session.exclusionReason ?? '',
    ];
    lines.push(row.map((v) => escapeCsv(String(v))).join(','));
  }
  return lines.join('\n');
}

// --- 2) stroop_ML_condition_summary.csv — una fila por (sesión, congruencia) ---
async function generateMlConditionSummaryCsv(subjectIdsFilter?: string | null): Promise<string> {
  const sessions = await fetchSessionsForMl(subjectIdsFilter);
  if (sessions.length === 0) return '';

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* default */ }

  const headers = ['codigo_participante', 'condicion_stroop', 'trials', 'valid_rt', 'rt_median_ms', 'rt_mean_ms', 'accuracy', 'errors', 'omissions'];
  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const trials = session.trials.filter((t) => !t.isPractice);

    for (const congKey of ['congruent', 'incongruent', 'neutral'] as const) {
      const condTrials = trials.filter((t) => t.congruency === congKey);
      const validRts = condTrials
        .filter((t) => t.reactionTimeMs != null && !t.isOmission && !(t.reactionTimeMs! < anticipatoryThreshold))
        .map((t) => t.reactionTimeMs!);
      const sorted = [...validRts].sort((a, b) => a - b);
      const median = sorted.length > 0
        ? sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)]
        : 0;
      const mean = validRts.length > 0 ? validRts.reduce((a, b) => a + b, 0) / validRts.length : 0;
      const correct = condTrials.filter((t) => t.accuracy === 'correct').length;
      const errors = condTrials.filter((t) => t.accuracy === 'incorrect').length;
      const omissions = condTrials.filter((t) => t.isOmission).length;
      const accuracy = condTrials.length > 0 ? correct / condTrials.length : 0;

      const row = [
        p.studyCode, ML_CONDITION_LABEL[congKey], condTrials.length, validRts.length,
        median, mean, accuracy, errors, omissions,
      ];
      lines.push(row.map((v) => escapeCsv(String(v))).join(','));
    }
  }
  return lines.join('\n');
}

// --- 3) stroop_ML_block_level.csv — una fila por (sesión, bloque) ---
async function generateMlBlockLevelCsv(subjectIdsFilter?: string | null): Promise<string> {
  const sessions = await fetchSessionsForMl(subjectIdsFilter);
  if (sessions.length === 0) return '';

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* default */ }

  const headers = [
    'codigo_participante', 'codigo_sesion', 'bloque', 'condicion_stroop', 'tipo_prueba',
    'rt_mediano_bloque', 'rt_media_bloque', 'rt_sd_bloque', 'rt_cv_bloque',
    'accuracy_bloque_pct', 'errores_bloque', 'omisiones_bloque', 'anticipatorias_bloque',
    'interferencia_stroop_ms', 'interferencia_relativa_pct',
    // rt_iqr_bloque queda fuera a propósito (Requisitos v7: "presenta
    // inconsistencias, no se va a contemplar para análisis con ML").
    // costo_precision_pct renombrado -> incongruente_error_rate_pct (mide
    // en realidad la tasa de error dentro de los ensayos incongruentes, no
    // una resta de precisión — de ahí el nombre nuevo, más preciso).
    'incongruente_error_rate_pct',
    // costo_precision_pct NUEVO: accuracy_congruent - accuracy_incongruent
    // (la "brecha" de precisión Stroop real). Se repite en cada fila de
    // bloque de la sesión porque es una métrica a nivel de sesión, no de
    // bloque — mismo patrón que ya usaba el archivo de ejemplo del tester.
    'costo_precision_pct',
    ...VALIDITY_HEADERS,
  ];
  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const trials = session.trials.filter((t) => !t.isPractice);

    // --- Métricas a nivel de SESIÓN (se repiten en cada fila de bloque) ---
    const congruentAcc: number[] = [], incongruentAcc: number[] = [];
    const congruentRts: number[] = [], incongruentRts: number[] = [];
    let incongruentErrors = 0, incongruentValidRt = 0;
    for (const trial of trials) {
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      if (trial.congruency === 'congruent') {
        congruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
        if (trial.reactionTimeMs != null && !isAnt && !trial.isOmission) congruentRts.push(trial.reactionTimeMs);
      } else if (trial.congruency === 'incongruent') {
        incongruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
        if (trial.reactionTimeMs != null && !isAnt && !trial.isOmission) {
          incongruentRts.push(trial.reactionTimeMs);
          incongruentValidRt++;
        }
        if (trial.accuracy === 'incorrect') incongruentErrors++;
      }
    }
    const cAccPct = congruentAcc.length > 0 ? (congruentAcc.reduce((a, b) => a + b, 0) / congruentAcc.length) * 100 : 0;
    const iAccPct = incongruentAcc.length > 0 ? (incongruentAcc.reduce((a, b) => a + b, 0) / incongruentAcc.length) * 100 : 0;
    const costoPrecisionPct = Math.round((cAccPct - iAccPct) * 100) / 100;
    const incongruenteErrorRatePct = incongruentValidRt > 0
      ? Math.round((incongruentErrors / incongruentValidRt) * 10000) / 100
      : 0;
    const cMeanRt = congruentRts.length > 0 ? congruentRts.reduce((a, b) => a + b, 0) / congruentRts.length : 0;
    const iMeanRt = incongruentRts.length > 0 ? incongruentRts.reduce((a, b) => a + b, 0) / incongruentRts.length : 0;
    const interferenceStroop = Math.round(iMeanRt - cMeanRt);
    const interferenceRelative = cMeanRt > 0 ? Math.round(((iMeanRt - cMeanRt) / cMeanRt) * 1000) / 10 : 0;

    // --- Métricas por BLOQUE ---
    const blockOrders = ([...new Set(trials.map((t) => t.blockOrder))] as number[]).sort((a, b) => a - b);
    for (const blockOrder of blockOrders) {
      const blockTrials = trials.filter((t) => t.blockOrder === blockOrder);
      if (blockTrials.length === 0) continue;
      const condition = blockTrials[0].condition;
      const congruency = blockTrials[0].congruency;
      const rts = blockTrials
        .filter((t) => t.reactionTimeMs != null && !t.isOmission && !(t.reactionTimeMs! < anticipatoryThreshold))
        .map((t) => t.reactionTimeMs!);
      const sorted = [...rts].sort((a, b) => a - b);
      const median = sorted.length > 0
        ? sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)]
        : 0;
      const mean = rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : 0;
      const variance = rts.length > 1 ? rts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (rts.length - 1) : 0;
      const std = Math.sqrt(variance);
      const cv = computeCv(std, mean);
      const correct = blockTrials.filter((t) => t.accuracy === 'correct').length;
      const errors = blockTrials.filter((t) => t.accuracy === 'incorrect').length;
      const omissions = blockTrials.filter((t) => t.isOmission).length;
      const anticipatory = blockTrials.filter((t) => t.reactionTimeMs != null && t.reactionTimeMs < anticipatoryThreshold).length;
      const accuracyPct = blockTrials.length > 0 ? (correct / blockTrials.length) * 100 : 0;

      // Validez de eye tracking SOLO de las muestras que caen dentro de los
      // ensayos de este bloque (fase 'trial', trialId en la lista de este
      // bloque específico).
      const blockTrialIds = blockTrials.map((t) => t.id);
      const blockEtSamples = await db.eyeTrackingSample.findMany({
        where: { sessionId: session.id, phase: 'trial', trialId: { in: blockTrialIds } },
        select: { fpogValid: true, lpv: true, rpv: true, lpmmValid: true, rpmmValid: true },
      });
      const blockValidity = computeValidityMetrics(blockEtSamples);

      const row = [
        p.studyCode, session.id, blockOrder, ML_CONDITION_LABEL[congruency] ?? congruency, condition,
        Math.round(median), Math.round(mean), Math.round(std * 100) / 100, Math.round(cv * 100) / 100,
        Math.round(accuracyPct * 100) / 100, errors, omissions, anticipatory,
        interferenceStroop, interferenceRelative,
        incongruenteErrorRatePct, costoPrecisionPct,
        ...validityRow(blockValidity),
      ];
      lines.push(row.map((v) => escapeCsv(String(v))).join(','));
    }
  }
  return lines.join('\n');
}

// --- 4) stroop_ML_QC_subjects.csv — una fila por participante ---
async function generateMlQcSubjectsCsv(subjectIdsFilter?: string | null): Promise<string> {
  const sessions = await fetchSessionsForMl(subjectIdsFilter);
  if (sessions.length === 0) return '';

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* default */ }

  const headers = [
    'participant', 'trials', 'rt_missing_pct', 'accuracy_missing_pct', 'errors', 'omissions',
    'anticipatory', 'response_logic_inconsistencies',
    ...VALIDITY_HEADERS,
  ];
  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const trials = session.trials.filter((t) => !t.isPractice);
    if (trials.length === 0) continue;

    const rtMissing = trials.filter((t) => t.reactionTimeMs == null).length;
    const accuracyMissing = trials.filter((t) => t.accuracy == null || t.accuracy === 'pending').length;
    const errors = trials.filter((t) => t.accuracy === 'incorrect').length;
    const omissions = trials.filter((t) => t.isOmission).length;
    const anticipatory = trials.filter((t) => t.reactionTimeMs != null && t.reactionTimeMs < anticipatoryThreshold).length;

    // Chequeo automático de combinaciones lógicamente imposibles — la razón
    // de ser de este archivo (control de calidad antes de usar los datos
    // en ML). Cada inconsistencia cuenta una vez por ensayo, aunque tenga
    // más de un problema.
    let inconsistencies = 0;
    for (const t of trials) {
      const hasResponse = t.participantResponse != null;
      const hasRt = t.reactionTimeMs != null;
      const markedOmission = t.isOmission;
      const accuracySaysOmission = t.accuracy === 'omission';
      let bad = false;
      // Marcado como omisión pero sí hay respuesta o RT registrados.
      if (markedOmission && (hasResponse || hasRt)) bad = true;
      // Accuracy dice "omission" pero isOmission=false (o viceversa).
      if (accuracySaysOmission !== markedOmission) bad = true;
      // Accuracy correcto/incorrecto pero no hay RT (sospechoso: no debería
      // poder evaluarse precisión sin una respuesta cronometrada).
      if ((t.accuracy === 'correct' || t.accuracy === 'incorrect') && !hasRt) bad = true;
      // No es omisión pero tampoco hay respuesta registrada.
      if (!markedOmission && !hasResponse && !accuracySaysOmission) bad = true;
      if (bad) inconsistencies++;
    }

    // Validez de eye tracking a nivel de sesión completa (línea base +
    // ensayos), tal como pidió el tester en su solicitud de desarrollo.
    const etSamples = await db.eyeTrackingSample.findMany({
      where: { sessionId: session.id, phase: { in: ['baseline', 'trial'] } },
      select: { fpogValid: true, lpv: true, rpv: true, lpmmValid: true, rpmmValid: true },
    });
    const validity = computeValidityMetrics(etSamples);

    const row = [
      p.studyCode, trials.length,
      Math.round((rtMissing / trials.length) * 1000) / 10,
      Math.round((accuracyMissing / trials.length) * 1000) / 10,
      errors, omissions, anticipatory, inconsistencies,
      ...validityRow(validity),
    ];
    lines.push(row.map((v) => escapeCsv(String(v))).join(','));
  }
  return lines.join('\n');
}

async function generateCompleteCsv(subjectIdsFilter?: string | null): Promise<string> {
  const whereClause: Record<string, unknown> = { completedAt: { not: null } };
  if (subjectIdsFilter) {
    const ids = subjectIdsFilter.split(',').filter(Boolean);
    if (ids.length > 0) whereClause.participantId = { in: ids };
  }

  const sessions = await db.session.findMany({
    where: whereClause,
    include: {
      participant: true,
      trials: { orderBy: { trialStartedAt: 'asc' } },
    },
    orderBy: { startedAt: 'asc' },
  });

  if (sessions.length === 0) return '';

  let anticipatoryThreshold = 200;
  try {
    const cfg = await db.experimentConfig.findUnique({ where: { key: 'anticipatoryRtThresholdMs' } });
    if (cfg) anticipatoryThreshold = parseInt(cfg.value) || 200;
  } catch { /* default */ }

  // Headers following PDF spec (accent-free for processing safety)
  const headers = [
    // ID
    'Id_participante',
    // Seccion A — Sociodemograficos
    'Nombre_completo', 'Edad', 'Sexo', 'Escolaridad', 'Horas_computadora_dia',
    // Seccion B — Condiciones visuales
    'Uso_lentes', 'Dificultad_visual', 'Descripcion_dificultad_visual',
    // Seccion C — Sueno y fatiga
    'Horas_sueno_anoche', 'Calidad_sueno', 'Nivel_descanso', 'Nivel_cansancio',
    // Seccion D — Estado actual
    'Fatiga', 'Estres', 'Somnolencia', 'Motivacion', 'Concentracion',
    // Seccion E — Consumo reciente
    'Consumo_cafeina', 'Tipo_cafeina', 'Cantidad_cafeina', 'Tiempo_cafeina',
    'Consumo_alcohol', 'Ejercicio',
    // Seccion F — Control experimental
    'Ultima_comida', 'Ambiente_confort',
    // Por condicion: Precision y RT promedio
    'Neutral_Precision', 'Neutral_RT_promedio',
    'Word_Test_Precision', 'Word_Test_RT_promedio',
    'Reverse_Stroop_Precision', 'Reverse_Stroop_RT_promedio',
    'Color_Test_Precision', 'Color_Test_RT_promedio',
    'Stroop_Test_Precision', 'Stroop_Test_RT_promedio',
    // Interferencia
    'Interferencia_Stroop', 'Interferencia_relativa', 'Costo_precision',
    // NASA-TLX (6 dimensiones)
    'Demanda_Mental', 'Demanda_Fisica', 'Demanda_Temporal',
    'Rendimiento', 'Esfuerzo', 'Frustracion',
  ];

  const conditions = ['NEUTRAL', 'WORD', 'REVERSE_STROOP', 'COLOR', 'STROOP'] as const;

  const lines: string[] = [headers.map(escapeCsv).join(',')];

  for (const session of sessions) {
    const p = session.participant;
    const trials = session.trials.filter((t) => !t.isPractice);

    // Per-condition stats
    const blockStats: Record<string, { rts: number[]; correct: number; total: number }> = {};
    for (const cond of conditions) {
      blockStats[cond] = { rts: [], correct: 0, total: 0 };
    }

    for (const trial of trials) {
      const bs = blockStats[trial.condition];
      if (!bs) continue;
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      bs.total++;
      if (trial.accuracy === 'correct') bs.correct++;
      if (trial.reactionTimeMs != null && !isAnt && !trial.isOmission) {
        bs.rts.push(trial.reactionTimeMs);
      }
    }

    const condMetrics: Record<string, { precision: number; rtMean: number }> = {};
    for (const cond of conditions) {
      const bs = blockStats[cond];
      const rtMean = bs.rts.length > 0 ? bs.rts.reduce((a, b) => a + b, 0) / bs.rts.length : 0;
      const precision = bs.total > 0 ? (bs.correct / bs.total) * 100 : 0;
      condMetrics[cond] = { precision: Math.round(precision * 100) / 100, rtMean: Math.round(rtMean) };
    }

    // Interference (congruent vs incongruent)
    const congruentRts: number[] = [], incongruentRts: number[] = [];
    const congruentAcc: number[] = [], incongruentAcc: number[] = [];
    for (const trial of trials) {
      const isAnt = trial.reactionTimeMs != null && trial.reactionTimeMs < anticipatoryThreshold;
      if (isAnt || trial.isOmission) continue;
      if (trial.congruency === 'congruent') {
        if (trial.reactionTimeMs != null) congruentRts.push(trial.reactionTimeMs);
        congruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      } else if (trial.congruency === 'incongruent') {
        if (trial.reactionTimeMs != null) incongruentRts.push(trial.reactionTimeMs);
        incongruentAcc.push(trial.accuracy === 'correct' ? 1 : 0);
      }
    }
    const cMeanRt = congruentRts.length > 0 ? congruentRts.reduce((a, b) => a + b, 0) / congruentRts.length : 0;
    const iMeanRt = incongruentRts.length > 0 ? incongruentRts.reduce((a, b) => a + b, 0) / incongruentRts.length : 0;
    const interferenceStroop = Math.round(iMeanRt - cMeanRt);
    const interferenceRelative = cMeanRt > 0 ? Math.round(((iMeanRt - cMeanRt) / cMeanRt) * 1000) / 10 : 0;
    const cAccPct = congruentAcc.length > 0 ? congruentAcc.reduce((a, b) => a + b, 0) / congruentAcc.length * 100 : 0;
    const iAccPct = incongruentAcc.length > 0 ? incongruentAcc.reduce((a, b) => a + b, 0) / incongruentAcc.length * 100 : 0;
    const accuracyCost = Math.round((cAccPct - iAccPct) * 10) / 10;

    const row = [
      // ID
      escapeCsv(p.studyCode),
      // Seccion A
      escapeCsv(p.fullName), escapeCsv(p.age), escapeCsv(p.sex),
      escapeCsv(p.education), escapeCsv(p.computerHoursPerDay),
      // Seccion B
      escapeCsv(p.glassesUse), escapeCsv(p.visualDifficulty), escapeCsv(p.visualDifficultyDesc),
      // Seccion C
      escapeCsv(p.hoursSleepLastNight), escapeCsv(p.sleepQuality),
      escapeCsv(p.currentRestLevel), escapeCsv(p.currentFatigueLevel),
      // Seccion D
      escapeCsv(p.stateFatigue), escapeCsv(p.stateStress),
      escapeCsv(p.stateSleepiness), escapeCsv(p.stateMotivation), escapeCsv(p.stateConcentration),
      // Seccion E
      escapeCsv(p.caffeineLast3h), escapeCsv(p.caffeineType),
      escapeCsv(p.caffeineAmount), escapeCsv(p.caffeineTime),
      escapeCsv(p.alcoholLast12h), escapeCsv(p.exerciseLast3h),
      // Seccion F
      escapeCsv(p.lastMealTime), escapeCsv(p.locationComfort),
      // Per-condition metrics
      escapeCsv(condMetrics['NEUTRAL'].precision), escapeCsv(condMetrics['NEUTRAL'].rtMean),
      escapeCsv(condMetrics['WORD'].precision), escapeCsv(condMetrics['WORD'].rtMean),
      escapeCsv(condMetrics['REVERSE_STROOP'].precision), escapeCsv(condMetrics['REVERSE_STROOP'].rtMean),
      escapeCsv(condMetrics['COLOR'].precision), escapeCsv(condMetrics['COLOR'].rtMean),
      escapeCsv(condMetrics['STROOP'].precision), escapeCsv(condMetrics['STROOP'].rtMean),
      // Interferencia
      escapeCsv(interferenceStroop), escapeCsv(interferenceRelative), escapeCsv(accuracyCost),
      // NASA-TLX
      escapeCsv(session.nasaMentalDemand), escapeCsv(session.nasaPhysicalDemand),
      escapeCsv(session.nasaTemporalDemand), escapeCsv(session.nasaPerformance),
      escapeCsv(session.nasaEffort), escapeCsv(session.nasaFrustration),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ============================================================
// MAIN EXPORT HANDLER
// ============================================================
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const anonymized = searchParams.get('anonymized') === 'true';
    const levels = searchParams.get('levels') || 'participants,sessions,trials';
    const levelSet = new Set(levels.split(','));

    // === INDIVIDUAL CSV (one file per subject) ===
    if (format === 'individual') {
      const sid = searchParams.get('session') || '';
      if (!sid) {
        return NextResponse.json({ error: 'Se requiere parametro session para formato individual' }, { status: 400 });
      }
      await db.auditLog.create({
        data: { action: 'export', details: `Exportacion individual sesion ${sid}` },
      });
      const csv = await generateIndividualCsv(sid);
      if (!csv) {
        return NextResponse.json({ error: 'Sesion no encontrada o sin datos' }, { status: 400 });
      }
      // Nombre de archivo con el código del participante, para poder
      // diferenciar los CSV de distintos sujetos al descargarlos por separado.
      const sessionForFilename = await db.session.findUnique({
        where: { id: sid },
        select: { participant: { select: { studyCode: true } } },
      });
      const studyCode = sessionForFilename?.participant?.studyCode || sid;
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="stroop_individual_${studyCode}.csv"`,
        },
      });
    }

    // === SESSION REPORT CSV (single session results report) ===
    if (format === 'session-report') {
      const sid = searchParams.get('session') || '';
      if (!sid) {
        return NextResponse.json({ error: 'Se requiere parametro session para formato session-report' }, { status: 400 });
      }
      await db.auditLog.create({
        data: { action: 'export', details: `Exportacion reporte sesion ${sid}` },
      });
      const csv = await generateSessionReportCsv(sid);
      if (!csv) {
        return NextResponse.json({ error: 'Sesion no encontrada o sin datos' }, { status: 400 });
      }
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_session_report.csv"',
        },
      });
    }

    // === COMPLETE CSV (Datos Completos — one row per participant) ===
    if (format === 'complete') {
      await db.auditLog.create({
        data: { action: 'export', details: 'Exportacion datos completos (un solo renglon por participante)' },
      });
      const subjectIds = searchParams.get('subjects');
      const csv = await generateCompleteCsv(subjectIds);
      if (!csv) {
        return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      }
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_datos_completos.csv"',
        },
      });
    }

    // === ARCHIVOS ML (Requisitos v7) — se descargan como parte del mismo
    // flujo de selección de sujetos que "complete", uno por formato. ===
    if (format === 'ml-subject-context') {
      await db.auditLog.create({ data: { action: 'export', details: 'Exportacion ML: subject_context' } });
      const subjectIds = searchParams.get('subjects');
      const csv = await generateMlSubjectContextCsv(subjectIds);
      if (!csv) return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_ML_subject_context.csv"',
        },
      });
    }

    if (format === 'ml-block-level') {
      await db.auditLog.create({ data: { action: 'export', details: 'Exportacion ML: block_level' } });
      const subjectIds = searchParams.get('subjects');
      const csv = await generateMlBlockLevelCsv(subjectIds);
      if (!csv) return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_ML_block_level.csv"',
        },
      });
    }

    if (format === 'ml-condition-summary') {
      await db.auditLog.create({ data: { action: 'export', details: 'Exportacion ML: condition_summary' } });
      const subjectIds = searchParams.get('subjects');
      const csv = await generateMlConditionSummaryCsv(subjectIds);
      if (!csv) return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_ML_condition_summary.csv"',
        },
      });
    }

    if (format === 'ml-qc-subjects') {
      await db.auditLog.create({ data: { action: 'export', details: 'Exportacion ML: QC_subjects' } });
      const subjectIds = searchParams.get('subjects');
      const csv = await generateMlQcSubjectsCsv(subjectIds);
      if (!csv) return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_ML_QC_subjects.csv"',
        },
      });
    }

    // === STATISTICAL CSV (operacionalización) ===
    if (format === 'statistical' || format === 'operacionalizacion') {
      await db.auditLog.create({
        data: { action: 'export', details: 'Exportacion estadistica (operacionalizacion)' },
      });
      // Support subject filtering
      const subjectIds = searchParams.get('subjects');
      const csv = await generateStatisticalCsv(subjectIds);
      if (!csv) {
        return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });
      }
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="stroop_statistical_export.csv"',
        },
      });
    }

    const whereSession: Record<string, unknown> = {};
    if (from || to) {
      whereSession.startedAt = {} as Record<string, Date>;
      if (from) (whereSession.startedAt as Record<string, Date>).gte = new Date(from);
      if (to) (whereSession.startedAt as Record<string, Date>).lte = new Date(to);
    }

    const sessionWhereForParticipants = { ...(from || to ? whereSession : {}) };

    const participants = levelSet.has('participants')
      ? await db.participant.findMany()
      : [];

    const sessions = levelSet.has('sessions')
      ? await db.session.findMany({ where: whereSession })
      : [];

    const trials = levelSet.has('trials')
      ? await db.trial.findMany({
          where: from || to
            ? { session: { startedAt: whereSession.startedAt as Record<string, Date> } }
            : undefined,
        })
      : [];

    const eyeTracking = levelSet.has('eyetracking')
      ? await db.eyeTrackingSample.findMany({
          where: from || to
            ? { session: { startedAt: whereSession.startedAt as Record<string, Date> } }
            : undefined,
        })
      : [];

    const nasatlx = levelSet.has('nasatlx')
      ? await db.session.findMany({
          where: {
            ...(from || to ? { startedAt: whereSession.startedAt as Record<string, Date> } : {}),
            nasaMentalDemand: { not: null },
          },
          select: {
            id: true, participantId: true, studyCode: true,
            nasaMentalDemand: true, nasaPhysicalDemand: true, nasaTemporalDemand: true,
            nasaPerformance: true, nasaEffort: true, nasaFrustration: true,
            nasaGlobalScore: true, nasaWeightingMethod: true,
          },
        })
      : [];

    await db.auditLog.create({
      data: {
        action: 'export',
        details: `Exportación en formato ${format}, niveles: ${levels}, anónimo: ${anonymized}`,
      },
    });

    const participantsData = anonymized
      ? participants.map((p) => stripPersonal(p as unknown as Record<string, unknown>))
      : participants;

    if (format === 'json') {
      const result: Record<string, unknown> = {};
      if (levelSet.has('participants')) result.participants = participantsData;
      if (levelSet.has('sessions')) result.sessions = sessions;
      if (levelSet.has('trials')) result.trials = trials;
      if (levelSet.has('eyetracking')) result.eyeTracking = eyeTracking;
      if (levelSet.has('nasatlx')) result.nasatlx = nasatlx;
      return new NextResponse(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="stroop_export.json"' },
      });
    }

    if (format === 'csv') {
      const rows: Record<string, string>[] = [];
      if (levelSet.has('participants')) for (const p of participantsData) rows.push(flattenForCsv(p as Record<string, unknown>));
      if (levelSet.has('sessions')) for (const s of sessions) rows.push(flattenForCsv(s as unknown as Record<string, unknown>));
      if (levelSet.has('trials')) for (const t of trials) rows.push(flattenForCsv(t as unknown as Record<string, unknown>));
      if (levelSet.has('eyetracking')) for (const e of eyeTracking) rows.push(flattenForCsv(e as unknown as Record<string, unknown>));
      if (levelSet.has('nasatlx')) for (const n of nasatlx) rows.push(flattenForCsv(n as unknown as Record<string, unknown>));

      if (rows.length === 0) return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 400 });

      const allKeys = new Set<string>();
      for (const row of rows) for (const key of Object.keys(row)) allKeys.add(key);
      const hdrs = Array.from(allKeys);
      const csvLines: string[] = [hdrs.join(',')];
      for (const row of rows) {
        csvLines.push(hdrs.map((h) => `"${(row[h] || '').replace(/"/g, '""')}"`).join(','));
      }
      return new NextResponse('\uFEFF' + csvLines.join('\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stroop_export.csv"' },
      });
    }

    if (format === 'excel') {
      const wb = XLSX.utils.book_new();
      if (levelSet.has('participants')) { const ws = XLSX.utils.json_to_sheet(participantsData.map((p) => flattenForCsv(p as Record<string, unknown>))); XLSX.utils.book_append_sheet(wb, ws, 'Participantes'); }
      if (levelSet.has('sessions')) { const ws = XLSX.utils.json_to_sheet(sessions.map((s) => flattenForCsv(s as unknown as Record<string, unknown>))); XLSX.utils.book_append_sheet(wb, ws, 'Sesiones'); }
      if (levelSet.has('trials')) { const ws = XLSX.utils.json_to_sheet(trials.map((t) => flattenForCsv(t as unknown as Record<string, unknown>))); XLSX.utils.book_append_sheet(wb, ws, 'Ensayos'); }
      if (levelSet.has('eyetracking')) { const ws = XLSX.utils.json_to_sheet(eyeTracking.map((e) => flattenForCsv(e as unknown as Record<string, unknown>))); XLSX.utils.book_append_sheet(wb, ws, 'EyeTracking'); }
      if (levelSet.has('nasatlx')) { const ws = XLSX.utils.json_to_sheet(nasatlx.map((n) => flattenForCsv(n as unknown as Record<string, unknown>))); XLSX.utils.book_append_sheet(wb, ws, 'NASA-TLX'); }
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buffer, {
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="stroop_export.xlsx"' },
      });
    }

    return NextResponse.json({ error: 'Formato no soportado. Use csv, json, excel, statistical, complete o individual.' }, { status: 400 });
  } catch (error) {
    console.error('Error en exportación:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
