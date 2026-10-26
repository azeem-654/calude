/**
 * Industry snapshots as data, and the install merge (worker/src/lib/snapshots.ts).
 *
 *   npm run test:snapshots
 *
 * Every snapshot in the registry must pass its own checks and name only
 * workflow templates that exist. The merge must only ever add: a second
 * install changes nothing, a customer's edits survive, a deleted item stays
 * deleted unless restore is asked for, a later version's new stage lands in
 * its place, and a document that is not a list is refused, not replaced.
 */
import { SNAPSHOTS, planCounts, planInstall, snapshotById, snapshotForIndustry, validateSnapshot, type Snapshot } from '../worker/src/lib/snapshots';
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 400)}`}`); };

console.log('\nThe registry');
const keys = new Set(TEMPLATES.map(t => t.key));
for (const s of SNAPSHOTS) {
  ok(`${s.title} passes its checks`, validateSnapshot(s).length === 0, validateSnapshot(s));
  ok(`${s.title} names only templates that exist`, s.templates.every(k => keys.has(k)), s.templates.filter(k => !keys.has(k)));
  ok(`${s.title} quotes no prices or percentages anywhere`, !/[$%£€]/.test(JSON.stringify(s)));
}
ok('one snapshot per microsite slug', ['hvac', 'roofing', 'medical-billing'].every(i => snapshotForIndustry(i)) && !snapshotForIndustry('dentist'));
ok('the medical billing snapshot keeps patient data out before a BAA', /patient/i.test(JSON.stringify(snapshotById('medical_billing')!.pipeline.stages[0].playbook)));
const broken: Snapshot = { ...snapshotById('hvac')!, pipeline: { ...snapshotById('hvac')!.pipeline, stages: [{ id: 'x', name: '', color: 'red', playbook: ['Save 20%'] }] } };
const probs = validateSnapshot(broken);
ok('the checks catch a bad snapshot, item by item', probs.length >= 4 && probs.some(p => /percentage/.test(p)), probs);

const H = snapshotById('hvac')!;
const AT = '2026-10-26T00:00:00.000Z';
const mine = [{ id: 'pipeline-default', name: 'Sales Pipeline', stages: [{ id: 'stage-new', name: 'New Lead', color: '#6366f1', deals: [{ id: 'd1', title: 'Big job' }] }] }];
const myFields = [{ key: 'gate_code', label: 'Gate code', createdAt: AT }];

console.log('\nA first install');
const p1 = planInstall(H, JSON.stringify(mine), JSON.stringify(myFields), [], false, AT)!;
const pipes1 = JSON.parse(p1.pipelines!);
const fields1 = JSON.parse(p1.fields!);
ok('adds the pipeline, every stage and every field', planCounts(p1.items).add === 1 + H.pipeline.stages.length + H.fields.length, planCounts(p1.items));
ok('the customer’s own pipeline and its deals are untouched', JSON.stringify(pipes1[0]) === JSON.stringify(mine[0]));
ok('…and so is their own field', fields1[0].key === 'gate_code' && fields1.length === 1 + H.fields.length);
ok('stages carry their checklists and the snapshot’s source stamp', pipes1[1].stages[0].playbook.length === H.pipeline.stages[0].playbook.length && pipes1[1].source.origin === 'industry-snapshot' && pipes1[1].source.refId === 'hvac@1');
ok('into an empty workspace too', planInstall(H, null, null, [], false, AT)!.changes);

console.log('\nInstalling again, and after the customer has been at it');
const added = p1.items.filter(i => i.status === 'add').map(i => i.key);
const p2 = planInstall(H, p1.pipelines, p1.fields, added, false, AT)!;
ok('a second install changes nothing', !p2.changes && p2.pipelines === null && p2.fields === null && planCounts(p2.items).present === p2.items.length);
const edited = JSON.parse(p1.pipelines!);
edited[1].stages[0].name = 'Fresh lead';                 // renamed
edited[1].stages[0].playbook = [{ id: 'mine', text: 'My own step' }];
edited[1].stages.splice(2, 1);                             // deleted "Estimate sent"
const p3 = planInstall(H, JSON.stringify(edited), p1.fields, added, false, AT)!;
ok('a renamed stage with an edited checklist is left exactly as the customer has it', !p3.changes && p3.items.find(i => i.key.endsWith('-new'))!.label === 'Fresh lead');
ok('a deleted stage is not put back, and the preview says so', p3.items.find(i => i.key.endsWith('-estimate'))!.status === 'removed');
const p4 = planInstall(H, JSON.stringify(edited), p1.fields, added, true, AT)!;
const back = JSON.parse(p4.pipelines!)[1].stages;
ok('…unless restore is asked for, when it returns in its place', back[2].id.endsWith('-estimate') && back[0].name === 'Fresh lead' && p4.items.find(i => i.key.endsWith('-estimate'))!.status === 'restore', back.map((s: { id: string }) => s.id));
const noPipe = JSON.parse(p1.pipelines!).slice(0, 1);
const p5 = planInstall(H, JSON.stringify(noPipe), p1.fields, added, false, AT)!;
ok('a deleted pipeline stays deleted', !p5.pipelines && p5.items[0].status === 'removed');

console.log('\nA later version');
const v2: Snapshot = { ...H, version: 2, history: [{ version: 2, date: '2026-11-01', note: 'Adds a maintenance stage.' }, ...H.history],
  pipeline: { ...H.pipeline, stages: [...H.pipeline.stages.slice(0, 5), { id: 'snap-hvac-maint', name: 'Maintenance due', color: '#14b8a6', playbook: ['Offer the next service visit'] }, H.pipeline.stages[5]] } };
ok('version 2 passes its checks', validateSnapshot(v2).length === 0, validateSnapshot(v2));
const up = planInstall(v2, JSON.stringify(edited), p1.fields, added, false, AT)!;
const upStages = JSON.parse(up.pipelines!)[1].stages.map((s: { id: string }) => s.id);
ok('an upgrade adds only the new stage, after the stage before it', planCounts(up.items).add === 1 && upStages.indexOf('snap-hvac-maint') === upStages.indexOf('snap-hvac-won') + 1, upStages);
ok('…without bringing back what the customer deleted', !upStages.includes('snap-hvac-estimate'));

console.log('\nWhat it refuses');
ok('a pipelines document that is not a list is refused, not replaced', planInstall(H, '{"oops":1}', null, [], false, AT) === null);
ok('…and so is one that is not JSON', planInstall(H, null, 'not json', [], false, AT) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
