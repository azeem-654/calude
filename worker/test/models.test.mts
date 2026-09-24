/**
 * Choosing Gemini models from what the key says it has.
 *
 * The fixed list failed the whole product on 2026-09-24 ("gemini-2.5-flash is
 * no longer available to new users"). These pin the choice: newest version
 * first, lite before full, stable before preview, never an embedding or an
 * image model.
 */
import { pickModels } from '../src/lib/ai.ts';

let pass = 0; let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

eq('newest version, lite first, then the full one, then an older full one',
  pickModels(['models/gemini-2.5-flash', 'models/gemini-3.6-flash', 'models/gemini-3.6-flash-lite', 'models/gemini-3.5-flash', 'models/text-embedding-004']),
  ['gemini-3.6-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']);
eq('stable is preferred over preview',
  pickModels(['models/gemini-4.0-flash-preview-11-2026', 'models/gemini-3.6-flash']),
  ['gemini-3.6-flash']);
eq('preview is used when it is all there is',
  pickModels(['models/gemini-4.0-flash-preview']),
  ['gemini-4.0-flash-preview']);
eq('pro, image and embedding models are never chosen',
  pickModels(['models/gemini-3.6-pro', 'models/gemini-3.6-flash-image', 'models/embedding-001']),
  []);
eq('a single version is fine', pickModels(['models/gemini-3.6-flash']), ['gemini-3.6-flash']);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
