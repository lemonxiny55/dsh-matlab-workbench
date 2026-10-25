import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixturePng} from './fixture-png.mjs';
import {prepareRun,collectFigure,listFigures,matlabLiteral,requireId,checkedDirectory} from '../core/figures.mjs';
const helper=fileURLToPath(new URL('../matlab',import.meta.url));
async function fixture(){const root=path.resolve('.m1','test-'+randomUUID());await fs.mkdir(root,{recursive:true});return root;}
async function exportFixture(run){
 await fs.writeFile(path.join(run.runDir,run.imageId+'.png'),fixturePng());
 await fs.writeFile(path.join(run.runDir,'figure.json'),JSON.stringify({schemaVersion:1,imageId:run.imageId,file:run.imageId+'.png',title:'test',exportedUtc:'2026-10-23T00:00:00.000Z'}));
}
test('MATLAB literals preserve apostrophes and reject control injection',()=>{
 assert.equal(matlabLiteral("C:/中文 test/o'hare"),"'C:/中文 test/o''hare'");
 assert.throws(()=>matlabLiteral('x\nplot(1)'));
 for(const id of ['../file','CON','x:y','a/b','',randomUUID()+'/x'])assert.throws(()=>requireId(id));
});
test('unique preparation, incomplete exclusion, collect hashes and immutable artifacts',async()=>{
 const root=await fixture(),a=await prepareRun(root,helper),b=await prepareRun(root,helper);
 assert.notEqual(a.runId,b.runId);assert.notEqual(a.imageId,b.imageId);
 assert.equal(a.status,'prepared');assert.ok(path.isAbsolute(a.runDir));
 assert.deepEqual(await listFigures(root),[]);
 await assert.rejects(collectFigure(root,a.runId));
 await exportFixture(a);
 const artifact=await collectFigure(root,a.runId);
 assert.equal(artifact.status,'artifact_ready');assert.match(artifact.sha256,/^[a-f0-9]{64}$/);assert.ok(artifact.width>0);
 assert.deepEqual(await collectFigure(root,a.runId),artifact);
 assert.equal((await listFigures(root)).length,1);
 await fs.appendFile(artifact.path,'changed');
 await assert.rejects(collectFigure(root,a.runId),/changed|PNG/);
});
test('path escape, forged metadata, and partial PNG fail closed',async()=>{
 const root=await fixture(),run=await prepareRun(root,helper);
 await assert.rejects(collectFigure(root,'../outside'),/UUID/);
 await assert.rejects(checkedDirectory('relative/path'),/absolute/);
 await exportFixture(run);
 const meta=path.join(run.runDir,'figure.json');
 await fs.writeFile(meta,JSON.stringify({schemaVersion:1,imageId:run.imageId,file:'../other.png',title:'test'}));
 await assert.rejects(collectFigure(root,run.runId),/metadata/);
 await exportFixture(run);await fs.writeFile(path.join(run.runDir,run.imageId+'.png'),'partial');
 await assert.rejects(collectFigure(root,run.runId),/PNG/);
});
test('header-only PNG and CRC corruption cannot be indexed as complete images',async()=>{
 const root=await fixture(),run=await prepareRun(root,helper);await exportFixture(run);
 const file=path.join(run.runDir,run.imageId+'.png'),bytes=await fs.readFile(file);
 await fs.writeFile(file,bytes.subarray(0,33));
 await assert.rejects(collectFigure(root,run.runId),/PNG/);
 const corrupt=Buffer.from(bytes);corrupt[45]^=1;await fs.writeFile(file,corrupt);
 await assert.rejects(collectFigure(root,run.runId),/PNG/);
});
test('precise metric payload must declare MATLAB provenance and retain data hash',async()=>{
 const root=await fixture(),run=await prepareRun(root,helper);await exportFixture(run);
 const metrics=path.join(run.runDir,'metrics.json');
 await fs.writeFile(metrics,JSON.stringify({overshoot:31,source:'model estimate'}));
 await assert.rejects(collectFigure(root,run.runId),/provenance/);
 await fs.writeFile(metrics,JSON.stringify({source:'MATLAB',method:'sample max',sampleInterval_s:0.002,window_s:12,overshoot_percent:31}));
 await assert.rejects(collectFigure(root,run.runId));
 await fs.writeFile(path.join(run.runDir,'samples.csv'),'0,0\n1,1\n');
 assert.match((await collectFigure(root,run.runId)).data.sha256,/^[a-f0-9]{64}$/);
});
test('junction paths cannot redirect artifact storage',async t=>{
 const root=await fixture(),outside=await fixture();
 const link=path.join(root,'.dsh-matlab');
 try {await fs.symlink(outside,link,'junction');}catch(e){if(e.code==='EPERM'){t.skip('Sandbox denies junction creation; separate elevated real test retained');return;}throw e;}
 await assert.rejects(prepareRun(root,helper),/links/);
 await fs.rmdir(link); // non-recursive removal of exact test link only
 assert.ok((await fs.stat(outside)).isDirectory());
});
