import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixturePng} from './fixture-png.mjs';
import {prepareSweep,collectSweep,listSweeps} from '../core/sweeps.mjs';
import {apply} from '../dsh/host/index.mjs';
const helper=fileURLToPath(new URL('../matlab',import.meta.url));
const gains=[{kp:1,ki:0.5,kd:0.2},{kp:3,ki:1,kd:0.5}];
const fixture=async()=>{const dir=path.resolve('.m1','m2-test-'+randomUUID());await fs.mkdir(dir,{recursive:true});return dir;};
async function exportFigure(item,metrics) {
  await fs.writeFile(path.join(item.runDir,item.imageId+'.png'),fixturePng());
  await fs.writeFile(path.join(item.runDir,'figure.json'),JSON.stringify({schemaVersion:1,imageId:item.imageId,file:item.imageId+'.png',title:'PID',exportedUtc:'2026-10-24T00:00:00Z'}));
  if(metrics){
    await fs.writeFile(path.join(item.runDir,'metrics.json'),JSON.stringify(metrics));
    await fs.writeFile(path.join(item.runDir,'samples.csv'),'0,0,0\n12,1,1\n');
  }
}
const metrics=(p,index)=>({schemaVersion:2,source:'MATLAB',kind:'pid_step_response',method:'ode45 sampled',sampleInterval_s:0.01,window_s:12,integratedAbsoluteError:2-index,integratedSquaredError:3-index,maxAbsoluteControl:5,overshoot_percent:0,analyticSteadyStateError:0,pid:p,settlingStatus:'within_recorded_window'});
test('prepares bounded PID gains and immutable sweep records with executable MATLAB code',async()=>{
  const dir=await fixture();
  for(const invalid of [[],[gains[0]],[gains[0],gains[0]],[{kp:1,ki:1,kd:0},{kp:-1,ki:1,kd:0}],[{kp:1,ki:1,kd:0},{kp:Infinity,ki:0,kd:0}],[{kp:0,ki:90,kd:0},{kp:1,ki:1,kd:1}]]){
    await assert.rejects(prepareSweep(dir,helper,invalid));
  }
  const sweep=await prepareSweep(dir,helper,gains);
  assert.equal(sweep.items.length,2);assert.equal(new Set(sweep.items.map(x=>x.runId)).size,2);
  assert.match(sweep.executeCode,/dsh_m2_pid_sweep/);
  assert.equal(sweep.items[0].parameters.ki,0.5);
  assert.deepEqual(await listSweeps(dir),[]);
  await assert.rejects(collectSweep(dir,sweep.sweepId),/incomplete/);
});
test('whole-sweep gate rejects partial success, verifies MATLAB provenance, detects later mutations',async()=>{
  const dir=await fixture(),sweep=await prepareSweep(dir,helper,gains);
  for(const [index,item] of sweep.items.entries())await exportFigure(item,metrics(item.parameters,index));
  await exportFigure(sweep.comparison,null);
  await assert.rejects(collectSweep(dir,sweep.sweepId),/incomplete/);
  await fs.writeFile(path.join(sweep.sweepDir,'completed.json'),JSON.stringify({schemaVersion:2,sweepId:sweep.sweepId,runCount:2,completedUtc:'2026-10-24T00:00:00Z'}));
  const group=await collectSweep(dir,sweep.sweepId);
  assert.equal(group.figures.length,3);assert.deepEqual(group.figures.slice(0,2).map(x=>x.provenance.parameters),gains);
  assert.equal((await listSweeps(dir)).length,1);
  const csv=path.join(sweep.items[0].runDir,'samples.csv');
  await fs.appendFile(csv,'6,broken\n');
  await assert.rejects(collectSweep(dir,sweep.sweepId),/changed/);
});
test('registered Host tools preserve session ownership and advertise collection contract',async()=>{
  const dir=await fixture(),tools=new Map(),disposals=[];
  const ctx={tools:{register:def=>{tools.set(def.name,def);return()=>disposals.push(def.name);}},workingDirectory:{ensure:async()=>dir},sessionProjections:{register:()=>()=>{}},systemPrompt:{section:()=>()=>{}}};
  const dispose=apply(ctx);
  assert.ok(tools.has('dsh_matlab_prepare_sweep'));assert.ok(tools.has('dsh_matlab_collect_sweep'));
  const exec={agent:{id:'test'},signal:new AbortController().signal};
  const sweep=await tools.get('dsh_matlab_prepare_sweep').execute({parameters:gains},exec);
  assert.equal(sweep.items.length,2);
  await assert.rejects(tools.get('dsh_matlab_collect_sweep').execute({sweepId:sweep.sweepId},exec),/incomplete/);
  await exportFigure(sweep.items[0],metrics(sweep.items[0].parameters,0));
  await assert.rejects(tools.get('dsh_matlab_collect').execute({runId:sweep.items[0].runId},exec),/whole sweep/);
  await assert.rejects(fs.access(path.join(sweep.items[0].runDir,'artifact.json')),{code:'ENOENT'});
  const standalone=await tools.get('dsh_matlab_list_figures').execute({},exec);
  assert.deepEqual(standalone.figures,[]);
  await assert.rejects(tools.get('dsh_matlab_prepare_sweep').execute({parameters:gains},{...exec,agent:null}),/session-owned/);
  dispose();assert.ok(disposals.includes('dsh_matlab_collect_sweep'));
});
