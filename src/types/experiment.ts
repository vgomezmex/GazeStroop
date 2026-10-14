// ============================================================
// TIPOS CORE DEL EXPERIMENTO STROOP
// Basado en Yamamoto et al. (2026), Frontiers in Aging Neuroscience
// ============================================================

// --- Colores del estímulo Stroop ---
export const STROOP_COLORS = [
  { name: 'ROJO', hex: '#DC2626' },
  { name: 'AZUL', hex: '#2563EB' },
  { name: 'VERDE', hex: '#16A34A' },
  { name: 'CAFE', hex: '#92400E' },
] as const

// Training/practice colors — distintos a los del experimento (STROOP_COLORS)
// para evitar que el participante memorice/asocie colores antes de la
// prueba real. Amarillo y Café se intercambiaron entre las dos paletas a
// petición del tester (el amarillo ahora es el color "de más" que se quedó
// en práctica, y café pasó a formar parte del experimento).
export const PRACTICE_COLORS = [
  { name: 'ROSA', hex: '#EC4899' },
  { name: 'NARANJA', hex: '#EA580C' },
  { name: 'MORADO', hex: '#7C3AED' },
  { name: 'NEGRO', hex: '#000000' },
] as const

export type StroopColorName = (typeof STROOP_COLORS)[number]['name']
export type PracticeColorName = (typeof PRACTICE_COLORS)[number]['name']
export type RoiPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// --- Available block types (lookup, not ordered) ---
// Order is configured by the researcher via blockOrder in ExperimentConfig
export const AVAILABLE_BLOCKS = {
  NEUTRAL: {
    condition: 'NEUTRAL' as const,
    congruency: 'neutral' as const,
    label: 'Neutral',
    instruction: 'Selecciona el color de la tinta con la que está escrita la palabra XXXX.',
    description: 'Se mostrará la palabra XXXX escrita en tinta de color. Debes seleccionar el color de la tinta, ignorando el contenido de la palabra.',
    stimulusType: 'word-xxxx' as const,
  },
  WORD: {
    condition: 'WORD' as const,
    congruency: 'congruent' as const,
    label: 'Word Test',
    instruction: 'Enfócate en el color representado por la palabra escrita.',
    description: 'Se mostrará una palabra de color escrita en tinta NEGRA. Debes seleccionar el color que representa la palabra (ignorando que la tinta es negra).',
    stimulusType: 'word-black' as const,
  },
  REVERSE_STROOP: {
    condition: 'REVERSE_STROOP' as const,
    congruency: 'incongruent' as const,
    label: 'Reverse Stroop',
    instruction: 'Enfócate en el color representado por la palabra escrita, ignorando el color de la tinta.',
    description: 'La palabra dirá un color pero estará escrita en tinta de otro color. Debes seleccionar el color que representa la palabra, ignorando el color de la tinta.',
    stimulusType: 'word-colored' as const,
  },
  COLOR: {
    condition: 'COLOR' as const,
    congruency: 'congruent' as const,
    label: 'Color Test',
    instruction: 'Enfócate en la palabra representada por el color del rectángulo.',
    description: 'Se mostrará un rectángulo de color sin palabra, junto con etiquetas de palabras como opciones. Debes seleccionar la palabra que corresponde al color del rectángulo.',
    stimulusType: 'color-rectangle' as const,
  },
  STROOP: {
    condition: 'STROOP' as const,
    congruency: 'incongruent' as const,
    label: 'Stroop Test',
    instruction: 'Enfócate en el color de la tinta con la que está escrita la palabra.',
    description: 'La palabra dirá un color pero estará escrita en tinta de otro color. Debes seleccionar el color de la tinta, ignorando lo que dice la palabra.',
    stimulusType: 'word-colored' as const,
  },
} as const

// Default block order: Neutral → Word → Reverse Stroop → Color → Stroop
export const DEFAULT_BLOCK_ORDER: string[] = ['NEUTRAL', 'WORD', 'REVERSE_STROOP', 'COLOR', 'STROOP']

export type Condition = keyof typeof AVAILABLE_BLOCKS
export type Congruency = 'congruent' | 'incongruent' | 'neutral'
export type StimulusType = 'word-black' | 'word-colored' | 'color-rectangle' | 'word-xxxx'

// Legacy alias for backward compatibility
export const BLOCK_DEFINITIONS = DEFAULT_BLOCK_ORDER.map((c, i) => ({
  blockOrder: i + 1,
  ...AVAILABLE_BLOCKS[c as Condition],
}))

// Practice configuration
export const PRACTICE_CONFIG = {
  slidesPerBlock: 4,
  presentationMs: 2000,
  responseWindowMs: 1500,
} as const

// --- Trial (ensayo individual) ---
export interface TrialStimulus {
  stimulusWord: StroopColorName | PracticeColorName | 'XXXX'
  stimulusInkColorHex: string
  // Colores de experimento O de práctica — este campo se reutiliza en ambos
  // contextos (isPractice=true usa PRACTICE_COLORS). Antes estaba tipado
  // solo como StroopColorName, y "funcionaba por casualidad" porque
  // AMARILLO coincidía con ambos conjuntos — al separar los conjuntos
  // (café/amarillo intercambiados entre experimento y práctica) quedó
  // expuesto que el tipo real siempre fue la unión de ambos.
  stimulusInkColorName: StroopColorName | PracticeColorName
  // correctAnswer/distractorColors/options.color: igual que stimulusInkColorName,
  // son del conjunto del experimento real O del conjunto de práctica según
  // isPractice — nunca se mezclan dentro de un mismo trial.
  correctAnswer: StroopColorName | PracticeColorName
  correctRoiPosition: RoiPosition
  distractorColors: (StroopColorName | PracticeColorName)[]
  options: Array<{ color: StroopColorName | PracticeColorName; hex: string; position: RoiPosition }>
  stimulusType: StimulusType
}

export interface TrialData {
  id?: string
  // Identificador ESTABLE generado en el cliente al crear el ensayo (antes
  // de que exista en la BD). A diferencia de "buscar el ensayo actual" por
  // índice, este id nunca cambia de significado aunque el participante ya
  // haya avanzado a otro ensayo para cuando /api/trial/start responde —
  // ver setTrialRealId en useAppStore.ts.
  clientTempId: string
  blockOrder: number
  condition: Condition
  congruency: Congruency
  stimulus: TrialStimulus
  participantResponse: StroopColorName | null
  responseRoiPosition: RoiPosition | null
  reactionTimeMs: number | null
  accuracy: 'correct' | 'incorrect' | 'omission' | 'pending'
  isOmission: boolean
  isPractice: boolean
  isValid: boolean
  isAnticipatory: boolean
  stimulusOnsetPerfNow: number | null
  responsePerfNow: number | null
}

// --- Block summary (agregado por condición) ---
export interface BlockSummary {
  condition: Condition
  congruency: Congruency
  label: string
  totalTrials: number
  correctCount: number
  incorrectCount: number
  omissionCount: number
  anticipatoryCount: number
  accuracy: number // 0-1
  accuracyPercent: number // 0-100
  rtMean: number
  rtMedian: number
  rtStd: number
  rtIqr: number
  rtCv: number
  interferenceIndex?: number
}

// --- NASA-TLX ---
export interface NasaTlxData {
  mentalDemand: number
  physicalDemand: number
  temporalDemand: number
  performance: number
  effort: number
  frustration: number
  globalScore: number
  method: 'simple' | 'weighted'
}

// --- Config del experimento ---
export interface ExperimentConfig {
  // Block configuration
  blockOrder: string[]
  trialsPerBlock: number
  maxExposureMs: number
  interTrialIntervalMs: number
  blockInstructionDurationMs: number
  // Practice
  practiceTrialsPerCondition: number
  practiceMinAccuracy: number
  // NASA-TLX
  nasaTlxStep: number
  nasaTlxMethod: 'simple' | 'weighted'
  // Exclusion criteria
  excludeVisualDifficulty: boolean
  anticipatoryRtThresholdMs: number
  stopSignalEnabled: boolean
  // Eye tracker
  eyeTrackerType: string
  eyeTrackerSamplingHz: number
  eyeTrackerBridgeUrl: string
  // Usados solo para convertir el error de calibración (fracción de pantalla,
  // que es la única unidad que Gazepoint documenta) a grados de ángulo
  // visual. Gazepoint Control NO reporta directamente el error en grados.
  screenWidthCm: number
  viewingDistanceCm: number
  // Study info
  consentVersion: string
  studyName: string
  sampleSizeTarget: number
  // Consent form fields
  researcherName: string
  institutionName: string
  researcherEmail: string
  researcherPhone: string
  ethicsApprovalNumber: string
}

// --- Calibración ---
export interface CalibrationData {
  status: 'pending' | 'in_progress' | 'success' | 'failed'
  errorDeg: number | null
  timestamp: string | null
}

// --- Participante (formulario) ---
export interface ParticipantFormData {
  // Sección A
  fullName: string
  age: number | null
  sex: string
  education: string
  computerHoursPerDay: string
  // Sección B
  glassesUse: string
  visualDifficulty: string
  visualDifficultyDesc: string
  // Sección C
  hoursSleepLastNight: number | null
  sleepQuality: number
  currentRestLevel: number
  currentFatigueLevel: number
  // Sección D
  stateFatigue: number
  stateStress: number
  stateSleepiness: number
  stateMotivation: number
  stateConcentration: number
  // Sección E
  caffeineLast3h: string
  caffeineType: string
  caffeineAmount: string
  caffeineTime: string
  alcoholLast12h: string
  exerciseLast3h: string
  // Sección F
  lastMealTime: string
  locationComfort: string
}

// --- Estados de la máquina de estados ---
export type AppState =
  | 'HOME'
  | 'ADMIN_AUTH'
  | 'ADMIN_DASHBOARD'
  | 'ADMIN_SESSIONS'
  | 'ADMIN_CONFIG'
  | 'ADMIN_EXPORT'
  | 'ADMIN_VISUALIZATIONS'
  | 'ADMIN_AUDIT'
  | 'ADMIN_RESEARCHERS'
  | 'CONSENT'
  | 'PARTICIPANT_FORM'
  | 'CALIBRATION'
  | 'INSTRUCTIONS'
  | 'PRACTICE'
  | 'PUPIL_BASELINE'
  | 'BLOCK_TRANSITION'
  | 'TRIAL'
  | 'INTER_TRIAL_INTERVAL'
  | 'BLOCK_COMPLETE'
  | 'NASA_TLX'
  | 'POST_EXPERIMENT_J'
  | 'PARTICIPANT_EXPERIENCE_K'
  | 'RESEARCHER_NOTES_L'
  | 'RESULTS_REPORT'

// --- Session results para reporte ---
export interface SessionResults {
  blockSummaries: BlockSummary[]
  interferenceIndex: number
  relativeInterference: number
  accuracyCost: number
  nasaTlx: NasaTlxData | null
  calibration: CalibrationData
  dataQuality: {
    totalTrials: number
    validTrials: number
    excludedTrials: number
    dataQualityPercent: number
  }
}
