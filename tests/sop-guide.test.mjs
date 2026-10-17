import test from 'node:test';
import assert from 'node:assert/strict';
import {sopView} from '../src/sop-guide.js';
import {to01,authorSteps} from '../src/sop-data.js';
import {seed} from '../src/model.js';
import {esc} from '../src/api.js';
test('warranty guide is scoped, reference-only and does not modify vehicle status',()=>{
 const state=seed(),before=structuredClone(state),view=page=>sopView({state,garage:'demo-north',page});
 const picker=view('sops/to01/mechanic');assert.match(picker,/DEMO-271/);assert.ok(!picker.includes('DEMO-315'));
 assert.match(view('sops/to01/mechanic/DEMO-315/warranty'),/Bus unavailable/);
 assert.match(view('sops/to01/mechanic/DEMO-271/warranty'),/Is this defect covered/);
 assert.match(view('sops/to01/mechanic/DEMO-271/covered'),/shift check sheet is not required/);
 assert.match(view('sops/to01/mechanic/DEMO-271/unknown'),/Do not assume/);
 assert.match(view('sops/to01/mechanic/DEMO-271/not-covered'),/actual diagnostic check sheets have not yet been supplied/);
 assert.deepEqual(state,before);
});
test('full SOP preserves all supplied clauses and history; links back to the same step',()=>{
 const state=seed(),page='sops/to01/full?return='+encodeURIComponent('sops/to01/author/3');const html=sopView({state,garage:'demo-north',page});
 for(const [,text] of [...to01.sections,...to01.clauses])assert.ok(html.includes(esc(text)));
 for(const row of to01.history)for(const value of row)assert.ok(html.includes(esc(value)));
 assert.ok(html.includes(esc(to01.note)));assert.match(html,/data-go="sops\/to01\/author\/3"/);
 assert.equal(to01.clauses.length,10);
});
test('each authoring step exposes source reference and full SOP without implying approval',()=>{
 const state=seed();for(let n=0;n<authorSteps.length;n++){const html=sopView({state,garage:'demo-north',page:'sops/to01/author/'+n});assert.ok(html.includes(`<h1>${esc(authorSteps[n].title)}</h1>`));assert.match(html,/technical review pending/);assert.match(html,/View full SOP/);assert.ok(html.includes(esc(authorSteps[n].ref)));}
});
