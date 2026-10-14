'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'

export default function InterTrialInterval() {
  const config = useAppStore((s) => s.config)
  const setAppState = useAppStore((s) => s.setAppState)
  const duration = config.interTrialIntervalMs

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setAppState('TRIAL')
    }, duration)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [duration, setAppState])

  return (
    <div className="min-h-screen bg-black" />
  )
}
