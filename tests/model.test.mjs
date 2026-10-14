import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,addRecord,submitAction,scoped} from '../src/model.js';
test('defect creates one linked action without releasing vehicle',()=>{const s=seed(),v=s.vehicles[0],status=v.status,n=s.actions.length;const r=addRecord(s,'faults',{title:'Test defect',description:'Test evidence',garage:v.garage,vehicle:v.id});assert.equal(s.actions.length,n+1);assert.equal(s.actions[0].source,r.id);assert.equal(v.status,status);});
test('reject cross-garage vehicle associations without mutation',()=>{const s=seed(),n=s.faults.length;assert.throws(()=>addRecord(s,'faults',{title:'Test',description:'Test',garage:'demo-south',vehicle:'DEMO-271'}));assert.equal(s.faults.length,n);assert.equal(scoped(s.vehicles,'demo-south').length,1);});
test('work evidence goes to review, not closure or vehicle release',()=>{const s=seed(),a=s.actions[0];assert.throws(()=>submitAction(s,a.id,' '));submitAction(s,a.id,'Repair evidence');assert.equal(a.status,'Awaiting review');assert.equal(s.vehicles[1].status,'Held for review');});
