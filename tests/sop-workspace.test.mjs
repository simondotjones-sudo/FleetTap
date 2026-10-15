import test from 'node:test';
import assert from 'node:assert/strict';
import {saveContent,visibleContent} from '../src/content-model.js';
import {sopWorkspaceView} from '../src/sop-workspace.js';
import {sopView} from '../src/sop-guide.js';
import {seed} from '../src/model.js';

test('drafts require review to publish and no browser values can set source or approver',()=>{
 const data={sops:[]},draft=saveContent(data,'sops',{title:'Handover'},'Admin');
 assert.equal(draft.status,'Draft');assert.equal(visibleContent(data).sops.length,0);
 const v={id:draft.id,title:'Handover',summary:'Safe shift handover.',steps:'Check area\nHand over',instructions:'Full instructions.',status:'Published'};
 assert.throws(()=>saveContent(data,'sops',v,'Admin'),/reviewed and approved/);
 assert.throws(()=>saveContent(data,'sops',{...v,approved:'yes',reviewDate:'2026-02-30'},'Admin'),/valid review date/);
 const published=saveContent(data,'sops',{...v,approved:'yes',sourceId:'forged',approvedBy:'forged'},'Trusted admin');
 assert.equal(published.sourceId,null);assert.equal(published.approvedBy,'Trusted admin');
 assert.equal(visibleContent(data).sops.length,1);assert.equal(visibleContent(data).sops[0].audit,undefined);
 const next=saveContent(data,'sops',{...v,status:'Draft'},'Admin');assert.equal(next.approvedAt,null);assert.equal(next.audit[1].previous.approvedBy,'Trusted admin');assert.equal(visibleContent(data).sops.length,0);
});
test('SOP opens on overview, exposes source safely, blocks draft deep links and retains PM3 warning',()=>{
 const data={sops:[]},x=saveContent(data,'sops',{title:'Example <SOP>',summary:'Overview <text>',steps:'First step',instructions:'Full text'},'Admin');
 const c={page:'org-sop/'+x.id,content:data,garage:'demo-north',organisation:'org',state:seed(),me:{role:'organisation_admin'}};
 let html=sopWorkspaceView(c);assert.match(html,/Overview &lt;text&gt;/);assert.match(html,/Start guide/);assert.match(html,/No source PDF attached/);assert.doesNotMatch(html,/Step 1 of/);
 assert.match(sopWorkspaceView({...c,me:{role:'mechanic'}}),/SOP unavailable/);
 assert.match(sopWorkspaceView({...c,page:'org-sop/'+x.id+'/0',me:{role:'mechanic'}}),/SOP unavailable/);
 x.status='Published';x.sourceId='source';x.sourceName='<file>.pdf';html=sopWorkspaceView(c);assert.match(html,/View source PDF/);assert.match(html,/&lt;file&gt;.pdf/);assert.match(html,/sop-documents\?garage=demo-north&amp;id=source/);
 const staff=sopWorkspaceView({...c,me:{role:'mechanic'}});assert.doesNotMatch(staff,/Edit SOP|Attach PDF|Source document/);
 assert.match(sopWorkspaceView({...c,page:'content/sops/generate'}),/generation is not enabled/);
 const pm3=sopView({...c,page:'sops/pm3'});assert.match(pm3,/resolve the conflict/);assert.match(pm3,/No source PDF attached to this garage/);
 c.state.inspectionTemplate={sourceId:'pm3-source',sourceName:'PM3.pdf'};
 assert.match(sopView({...c,page:'sops/pm3'}),/documents\?garage=demo-north&amp;id=pm3-source/);
});
