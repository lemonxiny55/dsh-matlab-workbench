// Real MATLAB integration exercise, opt-in: npm run test:matlab:m2
// All generated experiment data and stdout remain in the ignored .m1 directory.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareSweep,collectSweep} from '../../core/sweeps.mjs';
import {matlabLiteral} from '../../core/figures.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url)),helper=path.join(repo,'matlab');
const base=path.join(repo,'.m1','m2-real-'+randomUUID());
await fs.mkdir(base,{recursive:true});
const parameterSets=[{kp:1,ki:0.5,kd:0.2},{kp:3,ki:1,kd:0.5},{kp:2,ki:0.8,kd:0.9}];
const sweep=await prepareSweep(base,helper,parameterSets);
const m1Test=path.join(helper,'test_dsh_m1_save_figure.m');
const batch=`${sweep.setupCode} ${sweep.executeCode} results=runtests(${matlabLiteral(m1Test)}); assert(all([results.Passed]),'DSHM2:M1Regression','M1 MATLAB tests failed'); try, dsh_m2_pid_sweep(${matlabLiteral(sweep.sweepDir)}); error('DSHM2:UnexpectedRerun','The rerun should have failed'); catch err, assert(strcmp(err.identifier,'DSHM2:Exists'),'DSHM2:RerunGuard','Unexpected rerun error: %s',err.message); end; disp('DSH_M2_REAL_VALIDATION_OK');`;
const executable=process.env.MATLAB_EXE||'matlab';
const output=await new Promise((resolve,reject)=>{
  const child=spawn(executable,['-batch',batch],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{stdout+=chunk;process.stdout.write(chunk);});
  child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
  child.once('error',reject);
  child.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));
});
await fs.writeFile(path.join(base,'matlab-output.json'),JSON.stringify({...output,sweepId:sweep.sweepId},null,2));
assert.equal(output.code,0,`MATLAB failed; evidence in ${base}`);
assert.match(output.stdout,/DSH_M2_SWEEP_SUCCEEDED/);
assert.match(output.stdout,/DSH_M2_REAL_VALIDATION_OK/);
const collected=await collectSweep(base,sweep.sweepId);
assert.equal(collected.figures.length,parameterSets.length+1);
for(const [index,figure] of collected.figures.slice(0,-1).entries()) {
  const m=figure.metrics;
  assert.deepEqual(m.pid,parameterSets[index]);
  assert.equal(m.sampleInterval_s,0.01);assert.equal(m.window_s,12);
  for(const value of [m.integratedAbsoluteError,m.integratedSquaredError,m.maxAbsoluteControl,m.overshoot_percent,m.analyticSteadyStateError])assert.ok(Number.isFinite(value));
  assert.ok(figure.data.bytes>1000);
  assert.ok(figure.bytes>1000);
}
console.log(JSON.stringify({realMATLAB:'PASS',sweepId:sweep.sweepId,runCount:parameterSets.length,figures:collected.figures.length,metrics:collected.figures.slice(0,-1).map(x=>({pid:x.metrics.pid,IAE:x.metrics.integratedAbsoluteError,settling:x.metrics.sampledSettlingTime_s,overshoot:x.metrics.overshoot_percent})),evidence:base},null,2));
