import test from 'node:test';import assert from 'node:assert/strict';
import {emptyState,foldFigures,stateSchema} from '../dsh/host/projection.mjs';
const call=(id,name,args)=>({type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}});
const result=(id,content,isError=false)=>({type:'tool/result',data:{message:{toolCallId:id,content,isError}}});
test('session fold joins index and actual image attachments without reading disk',()=>{
 let state=emptyState();assert.equal(foldFigures(state,{type:'assistant/message'}),state);
 const figure={schemaVersion:1,imageId:'fig-1',path:'C:/work/figure.png',title:'step'};
 state=foldFigures(state,call('a','dsh_matlab_collect',{runId:'r'}));
 state=foldFigures(state,result('a',[{type:'text',text:JSON.stringify({kind:'dsh-matlab-figures',figures:[figure]})}]));
 assert.equal(state.figures[0].attachment,undefined);
 state=foldFigures(state,call('b','read_image',{file_path:'C:\\work\\figure.png'}));
 const attachment={attachmentId:'sha256:test',mediaType:'image/png'};
 state=foldFigures(state,result('b',[{type:'image',attachment}]));
 assert.deepEqual(state.figures[0].attachment,attachment);assert.deepEqual(state.calls,{});
 assert.deepEqual(emptyState().figures,[]); // another session has no figures
 assert.equal(stateSchema.parse(state),state);
});
test('failed image reads and unrelated calls cannot mark a figure visually read',()=>{
 let state=emptyState();state=foldFigures(state,call('a','read_image',{file_path:'C:/x.png'}));
 state=foldFigures(state,result('a',[{type:'image',attachment:{attachmentId:'bad'}}],true));
 assert.deepEqual(state.images,{});
 const before=state;assert.equal(foldFigures(state,call('b','unrelated',{})),before);
 assert.throws(()=>stateSchema.parse(null));
});
test('image-first order replays and attaches only the matching path',()=>{
 let state=emptyState();state=foldFigures(state,call('i','read_image',{file_path:'C:/one.png'}));
 state=foldFigures(state,result('i',[{type:'image',attachment:{attachmentId:'sha256:one'}}]));
 state=foldFigures(state,call('c','dsh_matlab_list_figures',{}));
 state=foldFigures(state,result('c',[{type:'text',text:JSON.stringify({kind:'dsh-matlab-figures',figures:[{schemaVersion:1,imageId:'one',path:'C:/one.png'},{schemaVersion:1,imageId:'two',path:'C:/two.png'}]})}]));
 assert.equal(state.figures[0].attachment.attachmentId,'sha256:one');assert.equal(state.figures[1].attachment,undefined);
});
test('whole sweep collection projects all run figures and overlay, with attachment only after read_image',()=>{
 let state=emptyState();
 const figures=[{schemaVersion:1,imageId:'pid-1',path:'D:/a.png',provenance:{kind:'pid_sweep',sweepId:'x'}},{schemaVersion:1,imageId:'overlay',path:'D:/overlay.png',provenance:{kind:'pid_comparison',sweepId:'x'}}];
 state=foldFigures(state,call('s','dsh_matlab_collect_sweep',{sweepId:'x'}));
 state=foldFigures(state,result('s',[{type:'text',text:JSON.stringify({kind:'dsh-matlab-figures',sweepId:'x',figures})}]));
 assert.equal(state.figures.length,2);assert.equal(state.figures[1].attachment,undefined);
 state=foldFigures(state,call('i','read_image',{file_path:'D:/overlay.png'}));
 state=foldFigures(state,result('i',[{type:'image',attachment:{attachmentId:'overlay-attachment'}}]));
 assert.equal(state.figures[1].attachment.attachmentId,'overlay-attachment');
});
test('M3 records prepared, MCP execution, verified collection and image-ready separately',()=>{
 let state=emptyState(),id='test-sweep',sweepDir='D:/isolated/sweeps/test-sweep';
 state=foldFigures(state,call('p','dsh_matlab_prepare_sweep',{parameters:[{kp:1,ki:0.5,kd:0.2},{kp:3,ki:1,kd:0.5}]}));
 assert.equal(state.activity.phase,'preparing');
 state=foldFigures(state,result('p',[{type:'text',text:JSON.stringify({kind:'pid_sweep',status:'prepared',sweepId:id,sweepDir,items:[{},{}]})}]));
 assert.equal(state.sweeps[id].phase,'prepared');
 state=foldFigures(state,call('m','mcp__matlab__evaluate_matlab_code',{code:`dsh_m2_pid_sweep('${sweepDir}')`}));
 assert.equal(state.sweeps[id].phase,'running');
 state=foldFigures(state,result('m',[{type:'text',text:'DSH_M2_SWEEP_SUCCEEDED'}]));
 assert.equal(state.sweeps[id].phase,'awaiting-collection');
 state=foldFigures(state,call('c','dsh_matlab_collect_sweep',{sweepId:id}));
 assert.equal(state.sweeps[id].phase,'verifying');
 const figures=[{schemaVersion:1,imageId:'a',path:'D:/a.png',provenance:{sweepId:id}},{schemaVersion:1,imageId:'b',path:'D:/b.png',provenance:{sweepId:id}}];
 state=foldFigures(state,result('c',[{type:'text',text:JSON.stringify({kind:'dsh-matlab-figures',sweepId:id,figures})}]));
 assert.equal(state.sweeps[id].phase,'loading');
 for(const [i,figure] of figures.entries()){
   state=foldFigures(state,call('r'+i,'read_image',{file_path:figure.path}));
   state=foldFigures(state,result('r'+i,[{type:'image',attachment:{attachmentId:'attachment-'+i}}]));
 }
 assert.equal(state.sweeps[id].phase,'complete');assert.equal(state.sweeps[id].imagesLoaded,2);
});
test('M3 does not confuse an MCP text error or failed collection with verified success',()=>{
 let state=emptyState(),id='unknown';
 state={...state,activeSweepId:id,sweeps:{[id]:{phase:'prepared',sweepDir:'D:/a'}}};
 state=foldFigures(state,call('m','mcp__matlab__evaluate_matlab_code',{code:'dsh_m2_pid_sweep("D:/a")'}));
 state=foldFigures(state,result('m',[{type:'text',text:'Error using dsh_m2_pid_sweep'}],false));
 assert.equal(state.sweeps[id].phase,'unknown');
 state=foldFigures(state,call('c','dsh_matlab_collect_sweep',{sweepId:id}));
 state=foldFigures(state,result('c',[{type:'text',text:'Sweep is incomplete'}],true));
 assert.equal(state.sweeps[id].phase,'verify-failed');
 assert.match(state.sweeps[id].error,/incomplete/);
});
test('M3 rejects misleading MCP completion text and malformed collection responses',()=>{
 let state=emptyState(),id='misleading';
 state={...state,activeSweepId:id,sweeps:{[id]:{phase:'prepared',sweepDir:'D:/sweeps/misleading'}}};
 state=foldFigures(state,call('m','mcp__matlab__evaluate_matlab_code',{code:'execute("D:/sweeps/misleading")'}));
 state=foldFigures(state,result('m',[{type:'text',text:'Error using run: DSH_M2_SWEEP_SUCCEEDED was expected'}]));
 assert.equal(state.sweeps[id].phase,'unknown');
 state=foldFigures(state,call('c','dsh_matlab_collect_sweep',{sweepId:id}));
 state=foldFigures(state,result('c',[{type:'text',text:'Execution never completed'}]));
 assert.equal(state.sweeps[id].phase,'verify-failed');
 assert.match(state.sweeps[id].error,/never completed/);
});
test('M3 shows read_image failures and only completes after verified image attachments',()=>{
 let state=emptyState(),id='images',figure={schemaVersion:1,imageId:'image-one',path:'D:/one.png',provenance:{sweepId:id}};
 state=foldFigures(state,call('c','dsh_matlab_collect_sweep',{sweepId:id}));
 state=foldFigures(state,result('c',[{type:'text',text:JSON.stringify({kind:'dsh-matlab-figures',sweepId:id,figures:[figure]})}]));
 assert.equal(state.sweeps[id].phase,'loading');
 state=foldFigures(state,call('r','read_image',{file_path:figure.path}));
 state=foldFigures(state,result('r',[{type:'text',text:'Attachment access failed'}],true));
 assert.equal(state.sweeps[id].phase,'image-failed');
 assert.match(state.sweeps[id].error,/Attachment access failed/);
 state=foldFigures(state,call('r2','read_image',{file_path:figure.path}));
 state=foldFigures(state,result('r2',[{type:'image',attachment:{attachmentId:'png-attached'}}]));
 assert.equal(state.sweeps[id].phase,'complete');
});
