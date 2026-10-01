/**
 * Choices offered in the assistant's settings. The values are passed straight to
 * `actions.start({ locale, voiceId })`. The integration team owns the real lists:
 * edit or replace these to match what the voice service supports.
 */
export const LOCALES = [
  { id: 'en-IN', label: 'English (India)' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
] as const

export const VOICES = [
  { id: 'default', label: 'Warm, default' },
  { id: 'calm-low', label: 'Calm, lower' },
  { id: 'clear-bright', label: 'Clear, brighter' },
] as const

export const CAPTION_SIZES = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
] as const

export type CaptionSize = (typeof CAPTION_SIZES)[number]['id']
