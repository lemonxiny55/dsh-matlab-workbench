import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function fixture(){
 let plugin,view,comparison,setup,rendering,dictionaries;const requests=[];
 const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:value=>rendering.useState(value),useEffect:(effect,deps)=>rendering.useEffect(effect,deps)};
 vm.runInNewContext(fs.readFileSync(new URL('../dsh/client/index.js',import.meta.url),'utf8'),{AbortController,window:{__ModuleLoader__:{load:row=>{plugin=row.factory(()=>React);}}}});
 const ctx={effect:fn=>fn(),locale:{register:(_ns,values)=>{dictionaries=values;return()=>{};},bind:()=>key=>dictionaries?.zh?.[key]||key},slots:{inject:(_key,fn)=>fn(),register:(options,component)=>{if(options.id==='matlab-figures')view=component;else if(options.id==='matlab-pid-comparison')comparison=component;else if(options.id==='matlab-pid-setup')setup=component;return()=>{};}}};
 // Cordis service access may return a new context-traced proxy on each read.
 Object.defineProperty(ctx,'remote',{get:()=>({session:{attachment:(...args)=>new Promise(resolve=>requests.push({args:args[0],argumentCount:args.length,resolve}))}})});
 plugin.apply(ctx);
 function find(node,predicate){if(!node||typeof node!=='object')return; if(predicate(node))return node;for(const child of (node.children??[]).flat(Infinity)){const match=find(child,predicate);if(match)return match;}}
 const figure={imageId:'id',title:'test',attachment:{attachmentId:'attachment'},sha256:'hash',width:1,height:1};
 const imageProps=(sessionId='one')=>find(view({sessionId,useProjection:()=>({figures:[figure]})}),n=>typeof n.type==='function');
 const hooks=[];let cursor=0,queue=[],updates=0;
 const runtime={
  useState(initial){const i=cursor++;hooks[i]??={value:initial};return[hooks[i].value,next=>{updates++;hooks[i].value=next;}];},
  useEffect(effect,deps){const i=cursor++;const prior=hooks[i];if(!prior||deps.some((value,j)=>!Object.is(value,prior.deps[j]))){queue.push(()=>{prior?.cleanup?.();hooks[i]={deps,cleanup:effect()};});}},
 };
 return {requests,props:imageProps,comparison,setup,render(node){cursor=0;rendering=runtime;return node.type(node.props);},commit(){const tasks=queue;queue=[];for(const task of tasks)task();},unmount(){for(const hook of hooks)hook?.cleanup?.();},get updates(){return updates;},find};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const response=data=>({ok:true,value:{attachment:{mediaType:'image/png'},data}});
test('unmount suppresses a late attachment completion without claiming transport cancellation',async()=>{
 const f=fixture();f.render(f.props());f.commit();const request=f.requests[0];
 f.unmount();const before=f.updates;
 request.resolve(response('late'));await flush();assert.equal(f.updates,before);
});
test('attachment calls obey the deployed one-argument API contract',()=>{
 const f=fixture();f.render(f.props());f.commit();assert.equal(f.requests[0].argumentCount,1);f.unmount();
});
test('ordinary projection rerenders reuse the attachment request despite new remote proxies',()=>{
 const f=fixture();f.render(f.props());f.commit();f.render(f.props());f.commit();assert.equal(f.requests.length,1);f.unmount();
});
test('session replacement isolates old reads, never paints the previous session image, and admits the new image',async()=>{
 const f=fixture();f.render(f.props('one'));f.commit();f.requests[0].resolve(response('old'));await flush();
 const old=f.render(f.props('one'));assert.ok(f.find(old,n=>n.type==='img'));
 const next=f.render(f.props('two'));assert.equal(f.find(next,n=>n.type==='img'),undefined);f.commit();
 assert.equal(f.requests[1].args.sessionId,'two');
 f.requests[1].resolve(response('new'));await flush();assert.match(f.find(f.render(f.props('two')),n=>n.type==='img').props.src,/new$/);f.unmount();
});
test('PID comparison tab renders MATLAB metrics, lowest-window-IAE marker and verified overlay',()=>{
 const f=fixture(),sweepId='sweep';
 const figures=[
  {imageId:'one',provenance:{kind:'pid_sweep',sweepId,index:0,parameters:{kp:1,ki:0.5,kd:0.2}},metrics:{source:'MATLAB',kind:'pid_step_response',integratedAbsoluteError:2,overshoot_percent:8,maxAbsoluteControl:2,settlingStatus:'within_recorded_window',sampledSettlingTime_s:5}},
  {imageId:'two',provenance:{kind:'pid_sweep',sweepId,index:1,parameters:{kp:3,ki:1,kd:0.5}},metrics:{source:'MATLAB',kind:'pid_step_response',integratedAbsoluteError:1,overshoot_percent:3,maxAbsoluteControl:4,settlingStatus:'not_determined_in_window'}},
  {imageId:'overlay',title:'comparison',provenance:{kind:'pid_comparison',sweepId},attachment:{attachmentId:'overlay-attachment'}}
 ];
 const view=f.comparison({sessionId:'sess',useProjection:()=>({figures})});
 const table=f.find(view,node=>node.type==='table');
 assert.ok(table);assert.ok(JSON.stringify(table).includes('1.000'));assert.ok(JSON.stringify(table).includes('★'));
 assert.ok(f.find(view,node=>node.type==='img')===undefined); // FigureImage loads via the attachment API
 const figure=f.find(view,node=>typeof node.type==='function');assert.equal(figure.props.figure.imageId,'overlay');
});
test('PID input tab validates stable unique gains and builds a reviewable MCP Agent request',()=>{
 const f=fixture();
 let view=f.render({type:f.setup,props:{}});
 f.find(view,n=>n.type==='button').props.onClick();
 view=f.render({type:f.setup,props:{}});
 const generated=f.find(view,n=>n.type==='pre');
 assert.match(generated.children.join(''),/dsh_matlab_prepare_sweep/);
 assert.match(generated.children.join(''),/"kd":0.9/);
 f.find(view,n=>n.type==='textarea').props.onChange({target:{value:'1,0.5,0.2\n1,0.5,0.2'}});
 view=f.render({type:f.setup,props:{}});
 f.find(view,n=>n.type==='button').props.onClick();
 view=f.render({type:f.setup,props:{}});
 assert.match(f.find(view,n=>n.props?.role==='alert').children.join(''),/重复/);
});
test('PID comparison progress reports uncertainty without showing incomplete measurements',()=>{
 const f=fixture(),view=f.comparison({sessionId:'s',useProjection:()=>({figures:[],sweeps:{s:{phase:'unknown',error:'MCP uncertain'}}})});
 assert.ok(f.find(view,n=>n.props?.role==='alert'));
 assert.equal(f.find(view,n=>n.type==='table'),undefined);
});
