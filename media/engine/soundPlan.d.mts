/** Types for soundPlan.mjs — the sound fixes as named steps (engine passes, Progress, the live preview). */
export interface GateSpec { threshold: number; ratio: number; range: number; attack: number; release: number; knee: number }
export type WebStep =
  | { t: 'hp'; f: number }
  | { t: 'notch'; f: number; q: number }
  | { t: 'peak'; f: number; q: number; g: number }
  | { t: 'rnn'; mix: number }
  | ({ t: 'gate' } & GateSpec)
  | { t: 'comp'; threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number };
export interface SoundStep { key: string; label: string; ff: string[]; web: WebStep[]; webNote?: string; tool?: 'dfn' }
export interface SoundAudio { studio?: boolean; strength?: number; denoise?: string; hum?: string; declick?: boolean; gate?: boolean; voice?: boolean; speechOnly?: boolean }
export interface SoundOpts { cbModel?: string; speech?: [number, number][] }
export const GATE: GateSpec;
export const NOISE_WORDS: Record<string, string>;
export function soundSteps(audio: SoundAudio | null | undefined, rnnModel?: string, opts?: SoundOpts): SoundStep[];
export function wantsIsolation(audio: SoundAudio | null | undefined): boolean;
export function wantsSpeechOnly(audio: SoundAudio | null | undefined): boolean;
export function speechVolume(spans: [number, number][] | null | undefined): string;
export const SPEECH_FLOOR: number;
export function voiceFilters(audio: SoundAudio | null | undefined, rnnModel?: string, opts?: SoundOpts): string[];
export function needsSoundPasses(audio: SoundAudio | null | undefined): boolean;
