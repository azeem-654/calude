/**
 * The rules a question screen is checked against, kept out of the component
 * file so it only exports components (fast refresh needs that).
 */
import type { Attachment, IntakeState, Screen } from '../../../services/projectIntake';

export const MANUAL_FIELDS = [
  { id: 'bizName', label: 'Business name', placeholder: 'Pike Plumbing & Heating' },
  { id: 'bizWhat', label: 'What it does', placeholder: 'Boiler repairs and installations across Leeds' },
  { id: 'bizWho', label: 'Who buys it', placeholder: 'Homeowners and small landlords' },
] as const;

/** What is still missing on a screen, said on the button. Empty when complete. */
export function screenBlocker(screen: Screen, state: IntakeState, files: Attachment[]): string {
  for (const q of screen.questions) {
    const v = state.known[q.id]?.value;
    const empty = v === undefined || (Array.isArray(v) ? !v.length : !String(v).trim());
    if (q.id === 'business') {
      if (empty) return 'Choose how to learn about the business';
      if (v === 'manual' && !(String(state.known.bizName?.value ?? '').trim() && String(state.known.bizWhat?.value ?? '').trim().length >= 8)) {
        return 'Say the business name and what it does';
      }
      if (v === 'upload' && !files.some(f => f.kind === 'pdf' || f.kind === 'text')) return 'Attach the company profile';
      continue;
    }
    if (q.need === 'required' && empty) return `Answer: ${q.prompt.replace(/\?$/, '').toLowerCase()}`;
  }
  return '';
}

