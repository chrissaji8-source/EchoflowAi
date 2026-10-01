/**
 * The contract between the assistant UI and its session provider.
 *
 * The live provider in `echoflow.tsx` owns microphone capture, the WebSocket,
 * browser transcription, and playback. The optional `preview.tsx` provider is a
 * scripted UI mock and is not connected by `App.tsx`.
 *
 * The shared vocabulary (phases, transcript turns, errors, and permissions)
 * lives in `./types.ts`.
 */
import { createContext, useContext, type RefObject } from 'react'
import type {
  ConnectionState,
  MicPermission,
  TranscriptTurn,
  VoiceEndReason,
  VoiceError,
  VoiceErrorCode,
  VoicePhase,
  VoiceSessionConfig,
} from './types'

/**
 * Live loudness, 0..1. The engine mutates this object in place (20-60 Hz) and the
 * visuals read it every animation frame. Do NOT mirror it into React state.
 */
export interface VoiceLevels {
  /** The person's voice, after mute. */
  input: number
  /** The assistant's voice, after volume scaling. */
  output: number
}

export interface VoiceActions {
  /** Begin a conversation. Called from the Start button's click handler. */
  start(config: VoiceSessionConfig): void
  /** End the conversation. The transcript stays available. */
  end(): void
  setMuted(muted: boolean): void
  /** Stop the assistant mid-sentence. */
  interrupt(): void
  /** A typed message from the person. If no session is active, config starts a text-only session without microphone access. */
  sendText(text: string, config?: VoiceSessionConfig): void
  /** Assistant volume, 0..1. */
  setOutputVolume(volume: number): void
  /** Back to `idle`, clearing the transcript. */
  reset(): void
}

export interface VoiceSession {
  phase: VoicePhase
  connection: ConnectionState
  micPermission: MicPermission
  turns: readonly TranscriptTurn[]
  error: VoiceError | null
  endReason: VoiceEndReason | null
  muted: boolean
  /** Epoch ms when the call went live, else null. */
  startedAt: number | null
  /** Epoch ms when the call ended, else null. */
  endedAt: number | null
  /** `true` shows the "Preview - no AI connected" badge. */
  isPreview: boolean
  /** Whether the typed-message box should be offered. */
  textInput: boolean
  levels: RefObject<VoiceLevels>
  actions: VoiceActions
  /** Only the preview provides this. Lets reviewers jump to any UI state. */
  debug?: {
    forcePhase(phase: VoicePhase): void
    forceError(code: VoiceErrorCode): void
  }
}

export const VoiceSessionContext = createContext<VoiceSession | null>(null)

export function useVoiceSession(): VoiceSession {
  const session = useContext(VoiceSessionContext)
  if (!session) throw new Error('useVoiceSession must be used inside a voice session provider.')
  return session
}
