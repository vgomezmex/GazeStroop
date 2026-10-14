import { create } from 'zustand'
import {
  type AppState,
  type ParticipantFormData,
  type TrialData,
  type CalibrationData,
  type NasaTlxData,
  type ExperimentConfig,
  type BlockSummary,
  type SessionResults,
  type Condition,
  type Congruency,
  type StroopColorName,
  type PracticeColorName,
  type RoiPosition,
  STROOP_COLORS,
  PRACTICE_COLORS,
  PRACTICE_CONFIG,
  AVAILABLE_BLOCKS,
  DEFAULT_BLOCK_ORDER,
} from '@/types/experiment'

const EMPTY_PARTICIPANT: ParticipantFormData = {
  fullName: '',
  age: null,
  sex: '',
  education: '',
  computerHoursPerDay: '',
  glassesUse: 'No',
  visualDifficulty: 'No',
  visualDifficultyDesc: '',
  hoursSleepLastNight: null,
  sleepQuality: 5,
  currentRestLevel: 5,
  currentFatigueLevel: 5,
  stateFatigue: 5,
  stateStress: 5,
  stateSleepiness: 5,
  stateMotivation: 5,
  stateConcentration: 5,
  caffeineLast3h: 'No',
  caffeineType: '',
  caffeineAmount: '',
  caffeineTime: '',
  alcoholLast12h: 'No',
  exerciseLast3h: 'No',
  lastMealTime: '',
  locationComfort: 'Sí',
}

// Id estable generado en el cliente para cada ensayo, independiente del id
// real de BD (que llega después, de forma asíncrona, vía /api/trial/start).
// Necesario para que setTrialRealId pueda encontrar el ensayo correcto sin
// depender de "cuál es el ensayo actual" en el momento en que la respuesta
// del servidor llega — ver el comentario extenso en useAppStore.ts.
function generateClientTempId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `trial_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// Un ensayo (de práctica o del experimento real) solo usa colores de UNA
// de las dos paletas a la vez, pero el nombre puede venir de cualquiera.
type ColorName = StroopColorName | PracticeColorName

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ============================================================
// Balanced trial generation
// For N trials with 4 colors: N/4 trials per color, then shuffled
// For incongruent: all 12 word-ink non-matching pairs evenly distributed
// ============================================================
function generateBalancedTrialsForBlock(
  blockOrder: number,
  condition: string,
  congruency: Congruency,
  count: number,
  isPractice: boolean
): TrialData[] {
  const blockDef = AVAILABLE_BLOCKS[condition as Condition]
  if (!blockDef) return []

  // BUG CORREGIDO (reportado por el tester: "los colores de práctica no
  // cambian"): esta función usaba SIEMPRE STROOP_COLORS (los 4 colores del
  // experimento real) sin importar el valor de `isPractice`, así que la
  // práctica terminaba mostrando exactamente los mismos colores que el
  // experimento — nunca los de PRACTICE_COLORS (Rosa/Naranja/Morado/Negro),
  // que es justamente el conjunto pensado para que el participante no
  // memorice asociaciones antes de la prueba real.
  const palette = isPractice ? PRACTICE_COLORS : STROOP_COLORS
  const colors = palette.map(c => c.name)
  const positions: RoiPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  const perColor = Math.floor(count / colors.length)
  // Distribute remainder evenly across colors
  const remainder = count - perColor * colors.length

  const trials: TrialData[] = []

  if (condition === 'WORD') {
    // Word Test (congruent): word in BLACK ink, answer = word meaning
    // Exactly perColor (+1 for first `remainder` colors) per color
    for (let ci = 0; ci < colors.length; ci++) {
      const n = perColor + (ci < remainder ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const wordColor = colors[ci]
        trials.push(buildTrial(
          blockOrder, condition, congruency, blockDef.stimulusType,
          wordColor, wordColor, wordColor, // word=ink=answer (black ink displayed)
          colors, positions, isPractice, palette
        ))
      }
    }
  } else if (condition === 'COLOR') {
    // Color Test (congruent): colored rectangle, answer = color name
    for (let ci = 0; ci < colors.length; ci++) {
      const n = perColor + (ci < remainder ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const color = colors[ci]
        trials.push(buildTrial(
          blockOrder, condition, congruency, blockDef.stimulusType,
          color, color, color, // word=ink=answer (rectangle color)
          colors, positions, isPractice, palette
        ))
      }
    }
  } else if (condition === 'NEUTRAL') {
    // Neutral: XXXX in colored ink, answer = ink color
    for (let ci = 0; ci < colors.length; ci++) {
      const n = perColor + (ci < remainder ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const inkColor = colors[ci]
        trials.push(buildTrial(
          blockOrder, condition, congruency, blockDef.stimulusType,
          colors[0] as ColorName, inkColor, inkColor, // word=placeholder, ink=answer
          colors, positions, isPractice, palette, true // isNeutral: overwrite word with XXXX
        ))
      }
    }
  } else if (condition === 'REVERSE_STROOP' || condition === 'STROOP') {
    // Incongruent: word ≠ ink color, balanced across all 12 non-matching pairs
    // Generate all 12 non-matching word-ink pairs
    const allPairs: Array<{ word: ColorName; ink: ColorName }> = []
    for (const w of colors) {
      for (const ik of colors) {
        if (w !== ik) {
          allPairs.push({ word: w as ColorName, ink: ik as ColorName })
        }
      }
    }

    // Distribute count trials evenly across 12 pairs
    const basePerPair = Math.floor(count / allPairs.length)
    const pairRemainder = count - basePerPair * allPairs.length

    // Create pool with balanced repetitions
    const pool: Array<{ word: ColorName; ink: ColorName }> = []
    for (let pi = 0; pi < allPairs.length; pi++) {
      const n = basePerPair + (pi < pairRemainder ? 1 : 0)
      for (let i = 0; i < n; i++) {
        pool.push(allPairs[pi])
      }
    }

    // Shuffle the pool
    const shuffledPool = shuffleArray(pool)

    for (const { word, ink } of shuffledPool) {
      const correctAnswer = condition === 'REVERSE_STROOP' ? word : ink
      trials.push(buildTrial(
        blockOrder, condition, congruency, blockDef.stimulusType,
        word, ink, correctAnswer,
        colors, positions, isPractice, palette
      ))
    }
  }

  // Shuffle all blocks to randomize trial order (prevent color-order batching)
  return shuffleArray(trials)
}

function buildTrial(
  blockOrder: number,
  condition: string,
  congruency: Congruency,
  stimulusType: string,
  wordColor: ColorName,
  inkColor: ColorName,
  correctAnswer: ColorName,
  allColors: string[],
  positions: RoiPosition[],
  isPractice: boolean,
  palette: ReadonlyArray<{ name: string; hex: string }>,
  isNeutral = false
): TrialData {
  const distractors = allColors.filter(c => c !== correctAnswer) as ColorName[]
  const allOptions = shuffleArray([
    { color: correctAnswer, hex: palette.find(c => c.name === correctAnswer)!.hex, position: '' as RoiPosition },
    ...distractors.map(d => ({
      color: d,
      hex: palette.find(c => c.name === d)!.hex,
      position: '' as RoiPosition,
    })),
  ])
  const shuffledPositions = shuffleArray(positions)
  allOptions.forEach((opt, idx) => {
    opt.position = shuffledPositions[idx]
  })
  const correctRoiPosition = allOptions.find(o => o.color === correctAnswer)!.position

  return {
    clientTempId: generateClientTempId(),
    blockOrder,
    condition: condition as TrialData['condition'],
    congruency,
    stimulus: {
      stimulusWord: isNeutral ? 'XXXX' : wordColor,
      stimulusInkColorHex: palette.find(c => c.name === inkColor)!.hex,
      stimulusInkColorName: inkColor,
      correctAnswer,
      correctRoiPosition,
      distractorColors: distractors,
      options: allOptions,
      stimulusType: stimulusType as TrialData['stimulus']['stimulusType'],
    },
    participantResponse: null,
    responseRoiPosition: null,
    reactionTimeMs: null,
    accuracy: 'pending' as const,
    isOmission: false,
    isPractice,
    isValid: true,
    isAnticipatory: false,
    stimulusOnsetPerfNow: null,
    responsePerfNow: null,
  }
}

// --- Calcular resumen por bloque ---
function calcBlockSummary(trials: TrialData[], condition: string, congruency: string, label: string): BlockSummary {
  const correct = trials.filter(t => t.accuracy === 'correct')
  const incorrect = trials.filter(t => t.accuracy === 'incorrect')
  const omissions = trials.filter(t => t.accuracy === 'omission' || t.accuracy === 'pending')
  const anticipatory = trials.filter(t => t.isAnticipatory)
  const responded = trials.filter(t => t.accuracy === 'correct' || t.accuracy === 'incorrect')
  const validResponded = responded.filter(t => !t.isAnticipatory)
  const rts = validResponded.map(t => t.reactionTimeMs!).filter(r => r != null && r > 0)

  const rtMean = rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : 0
  const sorted = [...rts].sort((a, b) => a - b)
  const rtMedian = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
  const rtStd = rts.length > 1
    ? Math.sqrt(rts.reduce((s, r) => s + (r - rtMean) ** 2, 0) / (rts.length - 1))
    : 0
  const rtIqr = sorted.length >= 2
    ? sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)]
    : 0
  const rtCv = rtMean > 0 ? (rtStd / rtMean) * 100 : 0

  return {
    condition: condition as BlockSummary['condition'],
    congruency: congruency as BlockSummary['congruency'],
    label,
    totalTrials: trials.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    omissionCount: omissions.length,
    anticipatoryCount: anticipatory.length,
    accuracy: trials.length > 0 ? correct.length / trials.length : 0,
    accuracyPercent: trials.length > 0 ? (correct.length / trials.length) * 100 : 0,
    rtMean,
    rtMedian,
    rtStd,
    rtIqr,
    rtCv,
  }
}

// ============================================================
// Active blocks derived from config.blockOrder
// ============================================================
function getActiveBlocks(blockOrder: string[]) {
  return blockOrder
    .filter(c => c in AVAILABLE_BLOCKS)
    .map((c, i) => ({
      blockOrder: i + 1,
      ...AVAILABLE_BLOCKS[c as Condition],
    }))
}

interface AppStore {
  // --- Navigation ---
  appState: AppState
  setAppState: (state: AppState) => void
  goBack: () => void

  // --- Admin ---
  isAdminAuthenticated: boolean
  adminCode: string
  adminName: string
  adminRole: string
  setAdminAuth: (code: string, name: string, role: string) => void
  logoutAdmin: () => void

  // --- Config ---
  config: ExperimentConfig
  setConfig: (config: ExperimentConfig) => void

  // --- Session ---
  sessionId: string | null
  participantId: string | null
  studyCode: string
  researcherCode: string
  setParticipantId: (id: string) => void
  setSessionId: (id: string) => void
  setStudyCode: (code: string) => void
  setResearcherCode: (code: string) => void
  sessionStartedAt: string | null

  // --- Calibration ---
  calibration: CalibrationData
  setCalibration: (data: Partial<CalibrationData>) => void

  // --- Participant Form ---
  participantForm: ParticipantFormData
  setParticipantForm: (data: Partial<ParticipantFormData>) => void
  resetParticipantForm: () => void

  // --- Consent ---
  consentAccepted: boolean
  setConsentAccepted: (v: boolean) => void

  // --- Trials ---
  currentBlockIndex: number
  currentTrialIndex: number
  experimentalTrials: TrialData[]
  practiceTrials: TrialData[]
  allRecordedTrials: TrialData[]

  // Active blocks (derived from config)
  activeBlocks: ReturnType<typeof getActiveBlocks>

  initExperimentTrials: () => void
  initPracticeTrials: (practicePerCondition: number) => void
  getCurrentBlockTrials: () => TrialData[]
  getCurrentTrial: () => TrialData | null
  setTrialRealId: (clientTempId: string, trialId: string) => void
  recordResponse: (colorName: StroopColorName, position: RoiPosition, rtMs: number) => void
  recordOmission: () => void
  advanceTrial: () => void
  advanceBlock: () => void
  isLastTrialOfBlock: () => boolean
  isLastBlock: () => boolean

  // --- Practice ---
  practiceBlockIndex: number
  practiceTrialIndex: number
  practiceResults: { correct: number; incorrect: number; omissions: number; total: number }
  advancePracticeTrial: () => void
  advancePracticeBlock: () => void
  isPracticeBlockComplete: () => boolean
  isPracticeComplete: () => boolean
  practicePassed: () => boolean
  resetPractice: () => void
  getCurrentPracticeTrial: () => TrialData | null
  getPracticeBlockTrials: () => TrialData[]

  // --- NASA-TLX ---
  nasaTlx: NasaTlxData | null
  setNasaTlx: (data: NasaTlxData) => void

  // --- Post-experiment ---
  sectionJ: { difficultyPerceived: number; concentrationRequired: number; postFatigue: number; postStress: number; difficultyResponding: number }
  sectionK: { testClear: string; instructionsClear: string; timeSufficient: string; hadDistractions: string; distractionDescription: string; hadTechnicalIssues: string; technicalIssueDesc: string; additionalComments: string }
  sectionL: { excessiveHeadMovement: string; trackingProblems: string; calibStable: string; interruptions: string; followedInstructions: string; excludedFromAnalysis: boolean; exclusionReason: string }
  setSectionJ: (data: Partial<AppStore['sectionJ']>) => void
  setSectionK: (data: Partial<AppStore['sectionK']>) => void
  setSectionL: (data: Partial<AppStore['sectionL']>) => void

  // --- Results ---
  getResults: () => SessionResults

  // --- Full reset ---
  resetSession: () => void
}

const DEFAULT_CONFIG: ExperimentConfig = {
  blockOrder: [...DEFAULT_BLOCK_ORDER],
  trialsPerBlock: 40,
  maxExposureMs: 2000,
  interTrialIntervalMs: 1000,
  blockInstructionDurationMs: 6000,
  practiceTrialsPerCondition: 2,
  practiceMinAccuracy: 0.5,
  nasaTlxStep: 5,
  nasaTlxMethod: 'simple',
  excludeVisualDifficulty: true,
  anticipatoryRtThresholdMs: 200,
  stopSignalEnabled: false,
  eyeTrackerType: 'gazepoint',
  eyeTrackerSamplingHz: 60,
  eyeTrackerBridgeUrl: process.env.NEXT_PUBLIC_EYETRACKER_BRIDGE_URL || 'ws://127.0.0.1:4243',
  screenWidthCm: 34,
  viewingDistanceCm: 60,
  consentVersion: '1.0',
  studyName: 'Stroop Eye-Tracking',
  sampleSizeTarget: 100,
  researcherName: '',
  institutionName: '',
  researcherEmail: '',
  researcherPhone: '',
  ethicsApprovalNumber: '',
}

export const useAppStore = create<AppStore>((set, get) => ({
  // --- Navigation ---
  appState: 'HOME',
  setAppState: (state) => set({ appState: state }),
  goBack: () => set((s) => {
    const backMap: Record<string, AppState> = {
      CONSENT: 'HOME',
      PARTICIPANT_FORM: 'CONSENT',
      CALIBRATION: 'PARTICIPANT_FORM',
      INSTRUCTIONS: 'CALIBRATION',
      PRACTICE: 'INSTRUCTIONS',
      PUPIL_BASELINE: 'PRACTICE',
      NASA_TLX: 'HOME',
      POST_EXPERIMENT_J: 'NASA_TLX',
      PARTICIPANT_EXPERIENCE_K: 'POST_EXPERIMENT_J',
      RESEARCHER_NOTES_L: 'PARTICIPANT_EXPERIENCE_K',
      RESULTS_REPORT: 'RESEARCHER_NOTES_L',
      ADMIN_SESSIONS: 'ADMIN_DASHBOARD',
      ADMIN_CONFIG: 'ADMIN_DASHBOARD',
      ADMIN_EXPORT: 'ADMIN_DASHBOARD',
      ADMIN_VISUALIZATIONS: 'ADMIN_DASHBOARD',
      ADMIN_AUDIT: 'ADMIN_DASHBOARD',
      ADMIN_RESEARCHERS: 'ADMIN_DASHBOARD',
    }
    return { appState: backMap[s.appState] || 'HOME' }
  }),

  // --- Admin ---
  isAdminAuthenticated: false,
  adminCode: '',
  adminName: '',
  adminRole: 'investigador',
  setAdminAuth: (code, name, role) => set({ isAdminAuthenticated: true, adminCode: code, adminName: name, adminRole: role }),
  logoutAdmin: () => set({ isAdminAuthenticated: false, adminCode: '', adminName: '', adminRole: 'investigador', appState: 'HOME' }),

  // --- Config ---
  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),

  // --- Session ---
  sessionId: null,
  participantId: null,
  studyCode: '',
  researcherCode: '',
  setParticipantId: (id) => set({ participantId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  setStudyCode: (code) => set({ studyCode: code }),
  setResearcherCode: (code) => set({ researcherCode: code }),
  sessionStartedAt: null,

  // --- Calibration ---
  calibration: { status: 'pending', errorDeg: null, timestamp: null },
  setCalibration: (data) => set((s) => ({ calibration: { ...s.calibration, ...data } })),

  // --- Participant Form ---
  participantForm: { ...EMPTY_PARTICIPANT },
  setParticipantForm: (data) => set((s) => ({ participantForm: { ...s.participantForm, ...data } })),
  resetParticipantForm: () => set({ participantForm: { ...EMPTY_PARTICIPANT } }),

  // --- Consent ---
  consentAccepted: false,
  setConsentAccepted: (v) => set({ consentAccepted: v }),

  // --- Trials ---
  currentBlockIndex: 0,
  currentTrialIndex: 0,
  experimentalTrials: [],
  practiceTrials: [],
  allRecordedTrials: [],
  activeBlocks: getActiveBlocks(DEFAULT_BLOCK_ORDER),

  initExperimentTrials: () => {
    const state = get()
    const blocks = getActiveBlocks(state.config.blockOrder)
    const count = state.config.trialsPerBlock

    const expTrials: TrialData[] = []

    for (const block of blocks) {
      expTrials.push(...generateBalancedTrialsForBlock(
        block.blockOrder, block.condition, block.congruency, count, false
      ))
    }

    set({
      experimentalTrials: expTrials,
      activeBlocks: blocks,
      currentBlockIndex: 0,
      currentTrialIndex: 0,
      allRecordedTrials: [],
    })
  },

  initPracticeTrials: (_practicePerCondition) => {
    const state = get()
    const blocks = getActiveBlocks(state.config.blockOrder)
    const trialsPerBlock = PRACTICE_CONFIG.slidesPerBlock
    const pracTrials: TrialData[] = []

    for (const block of blocks) {
      pracTrials.push(...generateBalancedTrialsForBlock(
        block.blockOrder, block.condition, block.congruency, trialsPerBlock, true
      ))
    }

    set({
      practiceTrials: pracTrials,
      practiceBlockIndex: 0,
      practiceTrialIndex: 0,
      practiceResults: { correct: 0, incorrect: 0, omissions: 0, total: 0 },
    })
  },

  getCurrentBlockTrials: () => {
    const { experimentalTrials, currentBlockIndex, activeBlocks } = get()
    const blockDef = activeBlocks[currentBlockIndex]
    if (!blockDef) return []
    return experimentalTrials.filter(t => t.blockOrder === blockDef.blockOrder)
  },

  getCurrentTrial: () => {
    const { experimentalTrials, currentBlockIndex, currentTrialIndex, activeBlocks } = get()
    const blockDef = activeBlocks[currentBlockIndex]
    if (!blockDef) return null
    const blockTrials = experimentalTrials.filter(t => t.blockOrder === blockDef.blockOrder)
    return blockTrials[currentTrialIndex] || null
  },

  // BUG CORREGIDO (condición de carrera que corrompía ~50% de los ensayos):
  // antes, esta función buscaba "el ensayo actual" (por índice) en el
  // momento en que /api/trial/start respondía — pero si el participante
  // respondía más rápido que ese viaje de red (perfectamente posible con
  // 2s de exposición y RTs típicos de 400-900ms), el sistema ya había
  // avanzado al SIGUIENTE ensayo, y el id real de BD terminaba pegado al
  // ensayo equivocado. Ahora se busca por clientTempId — un id estable
  // generado al CREAR el ensayo (buildTrial), que no cambia de significado
  // sin importar cuántos ensayos hayan avanzado para cuando la respuesta
  // del servidor llega.
  setTrialRealId: (clientTempId, trialId) => {
    set((s) => {
      const newTrials = s.experimentalTrials.map((t) =>
        t.clientTempId === clientTempId ? { ...t, id: trialId } : t
      )
      return { experimentalTrials: newTrials }
    })
  },

  recordResponse: (colorName, position, rtMs) => {
    set((s) => {
      const trial = s.getCurrentTrial()
      if (!trial) return s
      const isAnticipatory = rtMs < s.config.anticipatoryRtThresholdMs
      const updatedTrial: TrialData = {
        ...trial,
        participantResponse: colorName,
        responseRoiPosition: position,
        reactionTimeMs: rtMs,
        accuracy: colorName === trial.stimulus.correctAnswer ? 'correct' : 'incorrect',
        isOmission: false,
        isAnticipatory,
      }
      const newTrials = s.experimentalTrials.map(t =>
        t === trial ? updatedTrial : t
      )
      return { experimentalTrials: newTrials }
    })
  },

  recordOmission: () => {
    set((s) => {
      const trial = s.getCurrentTrial()
      if (!trial) return s
      const updatedTrial: TrialData = {
        ...trial,
        participantResponse: null,
        responseRoiPosition: null,
        reactionTimeMs: null,
        accuracy: 'omission',
        isOmission: true,
      }
      const newTrials = s.experimentalTrials.map(t =>
        t === trial ? updatedTrial : t
      )
      return { experimentalTrials: newTrials }
    })
  },

  advanceTrial: () => {
    set((s) => {
      const blockTrials = s.getCurrentBlockTrials()
      const nextIdx = s.currentTrialIndex + 1
      if (nextIdx >= blockTrials.length) {
        return { currentTrialIndex: 0 }
      }
      return { currentTrialIndex: nextIdx }
    })
  },

  advanceBlock: () => {
    set((s) => ({
      currentBlockIndex: s.currentBlockIndex + 1,
      currentTrialIndex: 0,
    }))
  },

  isLastTrialOfBlock: () => {
    const { experimentalTrials, currentBlockIndex, currentTrialIndex, activeBlocks } = get()
    const blockDef = activeBlocks[currentBlockIndex]
    if (!blockDef) return true
    const blockTrials = experimentalTrials.filter(t => t.blockOrder === blockDef.blockOrder)
    return currentTrialIndex >= blockTrials.length - 1
  },

  isLastBlock: () => {
    return get().currentBlockIndex >= get().activeBlocks.length - 1
  },

  // --- Practice ---
  practiceBlockIndex: 0,
  practiceTrialIndex: 0,
  practiceResults: { correct: 0, incorrect: 0, omissions: 0, total: 0 },

  advancePracticeTrial: () => {
    set((s) => ({
      practiceTrialIndex: s.practiceTrialIndex + 1,
    }))
  },

  advancePracticeBlock: () => {
    set((s) => ({
      practiceBlockIndex: s.practiceBlockIndex + 1,
      practiceTrialIndex: 0,
    }))
  },

  isPracticeBlockComplete: () => {
    const { practiceTrials, practiceBlockIndex, practiceTrialIndex, activeBlocks } = get()
    const currentBlock = activeBlocks[practiceBlockIndex]
    if (!currentBlock) return true
    const blockTrials = practiceTrials.filter(t => t.blockOrder === currentBlock.blockOrder)
    return practiceTrialIndex >= blockTrials.length
  },

  isPracticeComplete: () => {
    return get().practiceBlockIndex >= get().activeBlocks.length
  },

  practicePassed: () => {
    const { practiceResults, config } = get()
    if (practiceResults.total === 0) return false
    return practiceResults.correct / practiceResults.total >= config.practiceMinAccuracy
  },

  resetPractice: () => {
    const { config } = get()
    get().initPracticeTrials(config.practiceTrialsPerCondition)
  },

  getCurrentPracticeTrial: () => {
    const { practiceTrials, practiceBlockIndex, practiceTrialIndex, activeBlocks } = get()
    const currentBlock = activeBlocks[practiceBlockIndex]
    if (!currentBlock) return null
    const blockTrials = practiceTrials.filter(t => t.blockOrder === currentBlock.blockOrder)
    return blockTrials[practiceTrialIndex] || null
  },

  getPracticeBlockTrials: () => {
    const { practiceTrials, practiceBlockIndex, activeBlocks } = get()
    const currentBlock = activeBlocks[practiceBlockIndex]
    if (!currentBlock) return []
    return practiceTrials.filter(t => t.blockOrder === currentBlock.blockOrder)
  },

  // --- NASA-TLX ---
  nasaTlx: null,
  setNasaTlx: (data) => set({ nasaTlx: data }),

  // --- Post-experiment ---
  sectionJ: { difficultyPerceived: 5, concentrationRequired: 5, postFatigue: 5, postStress: 5, difficultyResponding: 5 },
  sectionK: { testClear: 'Sí', instructionsClear: 'Sí', timeSufficient: 'Sí', hadDistractions: 'No', distractionDescription: '', hadTechnicalIssues: 'No', technicalIssueDesc: '', additionalComments: '' },
  sectionL: { excessiveHeadMovement: 'No', trackingProblems: 'No', calibStable: 'Sí', interruptions: 'No', followedInstructions: 'Sí', excludedFromAnalysis: false, exclusionReason: '' },
  setSectionJ: (data) => set((s) => ({ sectionJ: { ...s.sectionJ, ...data } })),
  setSectionK: (data) => set((s) => ({ sectionK: { ...s.sectionK, ...data } })),
  setSectionL: (data) => set((s) => ({ sectionL: { ...s.sectionL, ...data } })),

  // --- Results ---
  getResults: () => {
    const s = get()
    const trials = s.experimentalTrials
    const blocks = s.activeBlocks

    // Build block summaries dynamically based on active blocks
    const blockSummaries = blocks.map((block) => {
      const blockTrials = trials.filter(t => t.blockOrder === block.blockOrder)
      return calcBlockSummary(blockTrials, block.condition, block.congruency, block.label)
    })

    // Interference calculations
    const incongruentTrials = trials.filter(t => t.congruency === 'incongruent' && t.accuracy === 'correct' && !t.isAnticipatory)
    const congruentTrials = trials.filter(t => t.congruency === 'congruent' && t.accuracy === 'correct' && !t.isAnticipatory)
    const incongruentMeanRt = incongruentTrials.length > 0
      ? incongruentTrials.reduce((a, t) => a + (t.reactionTimeMs || 0), 0) / incongruentTrials.length
      : 0
    const congruentMeanRt = congruentTrials.length > 0
      ? congruentTrials.reduce((a, t) => a + (t.reactionTimeMs || 0), 0) / congruentTrials.length
      : 0

    const interferenceIndex = incongruentMeanRt - congruentMeanRt
    const relativeInterference = congruentMeanRt > 0 ? ((incongruentMeanRt - congruentMeanRt) / congruentMeanRt) * 100 : 0

    const congruentAcc = trials.filter(t => t.congruency === 'congruent').length > 0
      ? trials.filter(t => t.congruency === 'congruent' && t.accuracy === 'correct').length /
        trials.filter(t => t.congruency === 'congruent').length
      : 0
    const incongruentAcc = trials.filter(t => t.congruency === 'incongruent').length > 0
      ? trials.filter(t => t.congruency === 'incongruent' && t.accuracy === 'correct').length /
        trials.filter(t => t.congruency === 'incongruent').length
      : 0
    const accuracyCost = (congruentAcc - incongruentAcc) * 100

    const validTrials = trials.filter(t => t.isValid)

    return {
      blockSummaries,
      interferenceIndex,
      relativeInterference,
      accuracyCost,
      nasaTlx: s.nasaTlx,
      calibration: s.calibration,
      dataQuality: {
        totalTrials: trials.length,
        validTrials: validTrials.length,
        excludedTrials: trials.length - validTrials.length,
        dataQualityPercent: trials.length > 0 ? (validTrials.length / trials.length) * 100 : 0,
      },
    }
  },

  // --- Full reset ---
  resetSession: () => set({
    sessionId: null,
    participantId: null,
    studyCode: '',
    researcherCode: '',
    sessionStartedAt: null,
    calibration: { status: 'pending', errorDeg: null, timestamp: null },
    participantForm: { ...EMPTY_PARTICIPANT },
    consentAccepted: false,
    currentBlockIndex: 0,
    currentTrialIndex: 0,
    experimentalTrials: [],
    practiceTrials: [],
    allRecordedTrials: [],
    activeBlocks: getActiveBlocks(DEFAULT_BLOCK_ORDER),
    practiceBlockIndex: 0,
    practiceTrialIndex: 0,
    practiceResults: { correct: 0, incorrect: 0, omissions: 0, total: 0 },
    nasaTlx: null,
    sectionJ: { difficultyPerceived: 5, concentrationRequired: 5, postFatigue: 5, postStress: 5, difficultyResponding: 5 },
    sectionK: { testClear: 'Sí', instructionsClear: 'Sí', timeSufficient: 'Sí', hadDistractions: 'No', distractionDescription: '', hadTechnicalIssues: 'No', technicalIssueDesc: '', additionalComments: '' },
    sectionL: { excessiveHeadMovement: 'No', trackingProblems: 'No', calibStable: 'Sí', interruptions: 'No', followedInstructions: 'Sí', excludedFromAnalysis: false, exclusionReason: '' },
    appState: 'HOME',
  }),
}))
