'use client'

import { useAppStore } from '@/stores/useAppStore'
import { useEffect } from 'react'
import { DEFAULT_BLOCK_ORDER, type ExperimentConfig } from '@/types/experiment'

// Admin
import AdminAuth from '@/components/admin/AdminAuth'
import AdminDashboard from '@/components/admin/AdminDashboard'
import AdminSessions from '@/components/admin/AdminSessions'
import AdminConfig from '@/components/admin/AdminConfig'
import AdminExport from '@/components/admin/AdminExport'
import AdminVisualizations from '@/components/admin/AdminVisualizations'
import AdminAudit from '@/components/admin/AdminAudit'
import AdminResearchers from '@/components/admin/AdminResearchers'

// Experiment
import CalibrationScreen from '@/components/experiment/CalibrationScreen'
import ConsentForm from '@/components/experiment/ConsentForm'
import ParticipantForm from '@/components/experiment/ParticipantForm'
import InstructionsScreen from '@/components/experiment/InstructionsScreen'
import PracticeScreen from '@/components/experiment/PracticeScreen'
import PupilBaselineScreen from '@/components/experiment/PupilBaselineScreen'
import BlockTransitionScreen from '@/components/experiment/BlockTransitionScreen'
import TrialScreen from '@/components/experiment/TrialScreen'
import InterTrialInterval from '@/components/experiment/InterTrialInterval'
import NasaTlxForm from '@/components/experiment/NasaTlxForm'
import PostExperimentJ from '@/components/experiment/PostExperimentJ'
import ParticipantExperienceK from '@/components/experiment/ParticipantExperienceK'
import ResearcherNotesL from '@/components/experiment/ResearcherNotesL'
import ExitExperimentButton from '@/components/experiment/ExitExperimentButton'
import ResultsReport from '@/components/experiment/ResultsReport'

// Shared
import HomeScreen from '@/components/shared/HomeScreen'

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

function deserializeConfig(data: Record<string, string>): ExperimentConfig {
  const config = { ...DEFAULT_CONFIG }
  for (const [key, value] of Object.entries(data)) {
    if (!(key in config)) continue
    const typedKey = key as keyof ExperimentConfig
    if (typedKey === 'blockOrder') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) config.blockOrder = parsed
      } catch { /* keep default */ }
    } else if (typedKey === 'nasaTlxMethod') {
      if (value === 'simple' || value === 'weighted') config.nasaTlxMethod = value
    } else if (typeof config[typedKey] === 'boolean') {
      (config as Record<string, unknown>)[typedKey] = value === 'true'
    } else if (typeof config[typedKey] === 'number') {
      (config as Record<string, unknown>)[typedKey] = parseFloat(value) || 0
    } else {
      (config as Record<string, unknown>)[typedKey] = value
    }
  }
  return config
}

export default function Page() {
  const { appState, setConfig } = useAppStore()

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const cfg: Record<string, string> = {}
          for (const [k, v] of Object.entries(data)) {
            cfg[k] = String(v)
          }
          setConfig(deserializeConfig(cfg))
        }
      })
      .catch(() => {})
  }, [setConfig])

  return (
    <>
      <ExitExperimentButton />
      {appState === 'HOME' && <HomeScreen />}
      {appState === 'ADMIN_AUTH' && <AdminAuth />}
      {appState === 'ADMIN_DASHBOARD' && <AdminDashboard />}
      {appState === 'ADMIN_SESSIONS' && <AdminSessions />}
      {appState === 'ADMIN_CONFIG' && <AdminConfig />}
      {appState === 'ADMIN_EXPORT' && <AdminExport />}
      {appState === 'ADMIN_VISUALIZATIONS' && <AdminVisualizations />}
      {appState === 'ADMIN_AUDIT' && <AdminAudit />}
      {appState === 'ADMIN_RESEARCHERS' && <AdminResearchers />}
      {appState === 'CONSENT' && <ConsentForm />}
      {appState === 'PARTICIPANT_FORM' && <ParticipantForm />}
      {appState === 'CALIBRATION' && <CalibrationScreen />}
      {appState === 'INSTRUCTIONS' && <InstructionsScreen />}
      {appState === 'PRACTICE' && <PracticeScreen />}
      {appState === 'PUPIL_BASELINE' && <PupilBaselineScreen />}
      {appState === 'BLOCK_TRANSITION' && <BlockTransitionScreen />}
      {appState === 'TRIAL' && <TrialScreen />}
      {appState === 'INTER_TRIAL_INTERVAL' && <InterTrialInterval />}
      {appState === 'NASA_TLX' && <NasaTlxForm />}
      {appState === 'POST_EXPERIMENT_J' && <PostExperimentJ />}
      {appState === 'PARTICIPANT_EXPERIENCE_K' && <ParticipantExperienceK />}
      {appState === 'RESEARCHER_NOTES_L' && <ResearcherNotesL />}
      {appState === 'RESULTS_REPORT' && <ResultsReport />}
    </>
  )
}