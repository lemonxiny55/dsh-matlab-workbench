import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkedDirectory, prepareRun, collectFigure, matlabLiteral, requireId} from './figures.mjs';

const maxRuns=12;
function validateParameters(parameters) {
  if(!Array.isArray(parameters)||parameters.length<2||parameters.length>maxRuns)throw Error('PID sweep requires 2–12 parameter sets');
  const seen=new Set();
  return parameters.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='kd,ki,kp')throw Error(`Invalid PID row ${index+1}`);
    for(const name of ['kp','ki','kd'])if(typeof row[name]!=='number'||!Number.isFinite(row[name])||row[name]<0||row[name]>100)throw Error(`Invalid ${name} in PID row ${index+1}: use a finite number from 0 to 100`);
    // The sample plant has a stable closed loop iff this Routh condition holds for ki>0.
    const a2=2*0.48*3+9*row.kd,a1=9*(1+row.kp),a0=9*row.ki;
    if(row.ki>0&&a2*a1<=a0)throw Error(`Unstable PID row ${index+1} for the documented sample plant`);
    const key=JSON.stringify([row.kp,row.ki,row.kd]);
    if(seen.has(key))throw Error(`Duplicate PID row ${index+1}: each experiment must use different gains`);
    seen.add(key);
    return {kp:row.kp,ki:row.ki,kd:row.kd};
  });
}
async function child(parent,name,create=false) {
  const root=await checkedDirectory(parent),target=path.join(root,name);
  if(create) { try {await fs.mkdir(target);}catch(e){if(e.code!=='EEXIST')throw e;} }
  return checkedDirectory(target);
}
async function sweepsRoot(workspace,create=false) {
  const root=await child(await checkedDirectory(workspace),'.dsh-matlab',create);
  return child(root,'sweeps',create);
}
async function sweepDir(workspace,sweepId) {return child(await sweepsRoot(workspace),requireId(sweepId));}
async function readRecord(dir,name) {
  const target=path.join(await checkedDirectory(dir),name),stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)throw Error(`Invalid sweep record: ${name}`);
  return JSON.parse(await fs.readFile(target,'utf8'));
}
export async function prepareSweep(workspace,helperDir,parameters) {
  const rows=validateParameters(parameters);
  const base=await checkedDirectory(workspace),helper=await checkedDirectory(helperDir);
  const root=await sweepsRoot(base,true),sweepId=randomUUID(),dir=await child(root,sweepId,true);
  const items=[];
  for(const [index,params] of rows.entries()) {
    const run=await prepareRun(base,helper,{kind:'pid_sweep',sweepId,index,parameters:params});
    items.push({index,parameters:params,runId:run.runId,imageId:run.imageId,runDir:run.runDir});
  }
  const comparison=await prepareRun(base,helper,{kind:'pid_comparison',sweepId});
  const record={schemaVersion:2,kind:'pid_sweep',status:'prepared',sweepId,sweepDir:dir,createdUtc:new Date().toISOString(),plant:{model:'y_second_order_pid',zeta:0.48,wn_rad_s:3,reference:1,sampleInterval_s:0.01,window_s:12},items,comparison:{runId:comparison.runId,imageId:comparison.imageId,runDir:comparison.runDir}};
  await fs.writeFile(path.join(dir,'sweep.json'),JSON.stringify(record,null,2),{flag:'wx'});
  return {...record,setupCode:`addpath(${matlabLiteral(helper)});`,executeCode:`dsh_m2_pid_sweep(${matlabLiteral(dir)});`,next:'Run setupCode and executeCode through the official MATLAB MCP. After the success marker, call dsh_matlab_collect_sweep; then read_image for each returned PNG, especially the comparison overlay.'};
}
async function loadSweep(workspace,sweepId) {
  const dir=await sweepDir(workspace,sweepId),record=await readRecord(dir,'sweep.json');
  if(record.schemaVersion!==2||record.kind!=='pid_sweep'||record.sweepId!==sweepId||record.sweepDir!==dir||record.status!=='prepared')throw Error('Invalid sweep manifest');
  const parameters=validateParameters(record.items?.map(x=>x.parameters));
  if(!Array.isArray(record.items)||!record.comparison||record.items.length!==parameters.length)throw Error('Invalid sweep items');
  const ids=new Set();
  for(const [index,item] of record.items.entries()) {
    requireId(item.runId);requireId(item.imageId);
    if(item.index!==index||ids.has(item.runId)||path.dirname(item.runDir)!==path.join(await checkedDirectory(workspace),'.dsh-matlab','runs')||path.basename(item.runDir)!==item.runId)throw Error('Invalid sweep run path');
    ids.add(item.runId);
  }
  requireId(record.comparison.runId);requireId(record.comparison.imageId);
  if(ids.has(record.comparison.runId)||record.comparison.runDir!==path.join(await checkedDirectory(workspace),'.dsh-matlab','runs',record.comparison.runId))throw Error('Invalid comparison run');
  return record;
}
export async function collectSweep(workspace,sweepId) {
  const manifest=await loadSweep(workspace,requireId(sweepId));
  let completion;
  try {completion=await readRecord(manifest.sweepDir,'completed.json');} catch(e){if(e.code==='ENOENT')throw Error('Sweep is incomplete: no MATLAB completion record');throw e;}
  if(completion.schemaVersion!==2||completion.sweepId!==sweepId||completion.runCount!==manifest.items.length||typeof completion.completedUtc!=='string')throw Error('Invalid MATLAB completion record');
  const figures=[];
  for(const item of manifest.items) {
    const figure=await collectFigure(workspace,item.runId);
    const m=figure.metrics;
    if(figure.imageId!==item.imageId||figure.provenance?.kind!=='pid_sweep'||figure.provenance.sweepId!==sweepId||figure.provenance.index!==item.index||JSON.stringify(figure.provenance.parameters)!==JSON.stringify(item.parameters)||m?.source!=='MATLAB'||m?.schemaVersion!==2||m?.kind!=='pid_step_response'||JSON.stringify(m.pid)!==JSON.stringify(item.parameters)||m.sampleInterval_s!==0.01||m.window_s!==12||!['within_recorded_window','not_determined_in_window'].includes(m.settlingStatus)||!['integratedAbsoluteError','integratedSquaredError','maxAbsoluteControl','overshoot_percent','analyticSteadyStateError'].every(key=>Number.isFinite(m[key])&&m[key]>=0)||!figure.data)throw Error('Sweep artifact or MATLAB metrics mismatch');
    figures.push(figure);
  }
  const comparison=await collectFigure(workspace,manifest.comparison.runId);
  if(comparison.imageId!==manifest.comparison.imageId||comparison.provenance?.kind!=='pid_comparison'||comparison.provenance.sweepId!==sweepId)throw Error('Comparison artifact mismatch');
  figures.push(comparison);
  return {kind:'dsh-matlab-figures',sweepId,figures,comparisonMetric:'integratedAbsoluteError',note:'IAE is integrated over the fixed 12 s window. Lower is better for this example; verify settling and control effort separately.'};
}
export async function listSweeps(workspace) {
  let root;
  try {root=await sweepsRoot(workspace);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const entries=await fs.readdir(root,{withFileTypes:true}),results=[];
  for(const entry of entries) {
    if(!requireIdIfValid(entry.name))continue;
    if(entry.isSymbolicLink())throw Error('Unexpected sweep link');
    if(!entry.isDirectory())continue;
    try {results.push(await collectSweep(workspace,entry.name));}
    catch(e){if(e.message==='Sweep is incomplete: no MATLAB completion record')continue;throw e;}
  }
  return results;
}
function requireIdIfValid(value) {try{requireId(value);return true;}catch{return false;}}
