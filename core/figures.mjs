import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function pngDimensions(bytes) {
  if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG signature');
  let offset=8,first=true,idatBytes=0,ended=false,width=0,height=0;
  while(offset<bytes.length) {
    if(bytes.length-offset<12)throw Error('Truncated PNG chunk');
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    if(end>bytes.length)throw Error('Truncated PNG data');
    const type=bytes.toString('ascii',offset+4,offset+8);
    if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('Invalid PNG chunk CRC');
    if(first) {
      if(type!=='IHDR'||length!==13)throw Error('Invalid PNG IHDR');
      width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);first=false;
    } else if(type==='IHDR')throw Error('Duplicate PNG IHDR');
    if(type==='IDAT')idatBytes+=length;
    if(type==='IEND') { if(length!==0||end!==bytes.length)throw Error('Invalid PNG end');ended=true; }
    offset=end;
  }
  if(!ended||!idatBytes||!width||!height||width*height>40_000_000)throw Error('Incomplete PNG or invalid dimensions');
  return {width,height};
}
export function matlabLiteral(value) {
  if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) throw Error('Invalid MATLAB string');
  return `'${value.replaceAll("'", "''")}'`;
}
export function requireId(id) { if (!UUID.test(id)) throw Error('Invalid UUID'); return id; }
export async function checkedDirectory(dir) {
  if (!path.isAbsolute(dir) || /^(\\\\[?.]\\|\\\\)/.test(dir)) throw Error('An absolute local path is required');
  const absolute=path.resolve(dir);
  let current=path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    const stat=await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Directory links/reparse paths are not accepted');
  }
  const real=await fs.realpath(absolute);
  if (path.relative(absolute,real)!=='') throw Error('Physical directory differs from requested directory');
  return real;
}
async function childDirectory(parent,name,create=false) {
  await checkedDirectory(parent);
  const dir=path.join(parent,name);
  if(create) { try { await fs.mkdir(dir); } catch(e) { if(e.code!=='EEXIST')throw e; } }
  return checkedDirectory(dir);
}
async function runDirectory(workspace,runId) {
  requireId(runId);
  const root=await childDirectory(await checkedDirectory(workspace),'.dsh-matlab');
  return childDirectory(await childDirectory(root,'runs'),runId);
}
async function fileBytes(dir,name,cap) {
  await checkedDirectory(dir);
  const file=path.join(dir,name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>cap)throw Error(`Invalid or oversized artifact: ${name}`);
  const handle=await fs.open(file,'r');
  try {
    const opened=await handle.stat();
    if(opened.size!==stat.size||opened.ino!==stat.ino)throw Error('Artifact changed while opening');
    const bytes=await handle.readFile();
    if(bytes.length>cap)throw Error('Artifact exceeds limit');
    return bytes;
  } finally { await handle.close(); }
}
const json = async (dir,name) => JSON.parse((await fileBytes(dir,name,1024*1024)).toString('utf8'));
export async function prepareRun(workspace,helperDir,provenance={}) {
  const base=await checkedDirectory(workspace);
  const root=await childDirectory(base,'.dsh-matlab',true);
  const runs=await childDirectory(root,'runs',true);
  const runId=randomUUID(),imageId=randomUUID();
  const runDir=await childDirectory(runs,runId,true);
  const helper=await checkedDirectory(helperDir);
  const prepared={schemaVersion:1,status:'prepared',runId,imageId,runDir,createdUtc:new Date().toISOString(),provenance};
  await fs.writeFile(path.join(runDir,'prepared.json'),JSON.stringify(prepared,null,2),{flag:'wx'});
  return {...prepared,setupCode:`addpath(${matlabLiteral(helper)});`,exportCode:`dsh_m1_save_figure(fig, ${matlabLiteral(runDir)}, ${matlabLiteral(imageId)}, 'Simulation result');`,next:'Execute MATLAB through the official MCP; preparation is not execution. Then collect and call read_image.'};
}
export async function collectFigure(workspace,runId) {
  const dir=await runDirectory(workspace,runId);
  const prepared=await json(dir,'prepared.json');
  requireId(prepared.imageId);
  if(prepared.schemaVersion!==1||prepared.runId!==runId||prepared.runDir!==dir)throw Error('Invalid preparation record');
  const metadata=await json(dir,'figure.json');
  const name=prepared.imageId+'.png';
  if(metadata.schemaVersion!==1||metadata.imageId!==prepared.imageId||metadata.file!==name||typeof metadata.title!=='string'||metadata.title.length>200)throw Error('Figure metadata does not match preparation');
  const bytes=await fileBytes(dir,name,16*1024*1024);
  const {width,height}=pngDimensions(bytes);
  let metrics=null,data=null;
  try { metrics=await json(dir,'metrics.json'); } catch(e) { if(e.code!=='ENOENT')throw e; }
  if(metrics!==null) {
    if(metrics.source!=='MATLAB'||typeof metrics.method!=='string'||!Number.isFinite(metrics.sampleInterval_s)||!Number.isFinite(metrics.window_s))throw Error('Missing MATLAB metric provenance');
    const samples=await fileBytes(dir,'samples.csv',16*1024*1024);
    data={file:path.join(dir,'samples.csv'),sha256:hash(samples),bytes:samples.length};
  }
  const artifact={schemaVersion:1,status:'artifact_ready',runId,imageId:prepared.imageId,path:path.join(dir,name),sha256:hash(bytes),bytes:bytes.length,width,height,title:metadata.title,exportedUtc:metadata.exportedUtc,metrics,data,provenance:prepared.provenance};
  const destination=path.join(dir,'artifact.json');
  try { const prior=await json(dir,'artifact.json'); if(JSON.stringify(prior)!==JSON.stringify(artifact))throw Error('Collected artifact changed; create a new run'); }
  catch(e) { if(e.code!=='ENOENT')throw e; const temporary=path.join(dir,randomUUID()+'.tmp'); await fs.writeFile(temporary,JSON.stringify(artifact,null,2),{flag:'wx'}); await fs.rename(temporary,destination); }
  return artifact;
}
export async function collectStandaloneFigure(workspace,runId) {
  const dir=await runDirectory(workspace,runId);
  const prepared=await json(dir,'prepared.json');
  if(prepared.provenance?.sweepId)throw Error('PID runs must be indexed through dsh_matlab_collect_sweep after the whole sweep completes');
  return collectFigure(workspace,runId);
}
export async function listFigures(workspace,{includeSweeps=true}={}) {
  const root=path.join(await checkedDirectory(workspace),'.dsh-matlab','runs');
  try { await checkedDirectory(root); } catch(e) { if(e.code==='ENOENT')return []; throw e; }
  const entries=await fs.readdir(root,{withFileTypes:true}),figures=[];
  for(const entry of entries) {
    if(!UUID.test(entry.name))continue;
    if(entry.isSymbolicLink())throw Error('Unexpected run link');
    if(!entry.isDirectory())continue;
    try {
      await fs.access(path.join(root,entry.name,'artifact.json'));
      if(!includeSweeps&&(await json(path.join(root,entry.name),'prepared.json')).provenance?.sweepId)continue;
      figures.push(await collectFigure(workspace,entry.name));
    }
    catch(e) { if(e.code!=='ENOENT')throw e; }
  }
  return figures;
}
