// DSH event adapter: pure replay fold; no filesystem reads or custom events.
const keyPath=value=>String(value).replaceAll('\\','/').toLowerCase();
const matlabExecution=name=>/matlab.*(evaluate_matlab_code|run_matlab_file)/i.test(name);
const textResult=message=>message?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')||'';
const matlabSucceeded=message=>!message?.isError&&/(?:^|\r?\n)\s*DSH_M2_SWEEP_SUCCEEDED\s*(?:\r?\n|$)/.test(textResult(message))&&!/(?:^|\r?\n)\s*(?:Error using|Error:|Exception:|Failed:)/i.test(textResult(message));
const sweepForFigure=figure=>figure?.provenance?.sweepId;
export const emptyState=()=>({calls:{},figures:[],images:{},sweeps:{},activity:null,activeSweepId:null});
export const stateSchema={parse(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.figures)||!value.calls||!value.images)throw Error('Invalid MATLAB projection state');
  return value;
}};
function updateSweep(next,id,patch) {
  if(!id)return;
  next.sweeps={...(next.sweeps||{}),[id]:{...(next.sweeps?.[id]||{}),...patch}};
}
function refreshImages(next,id) {
  if(!id||!next.sweeps?.[id])return;
  const figures=next.figures.filter(f=>sweepForFigure(f)===id),expected=next.sweeps[id].imageCount;
  if(!expected||figures.length!==expected)return;
  const available=figures.filter(f=>f.attachment?.attachmentId).length;
  updateSweep(next,id,{phase:available===expected?'complete':'loading',imagesLoaded:available});
}
export function foldFigures(state,event) {
  if(event.type==='tool/call') {
    const {callId,name,arguments:raw}=event.data;
    if(!['dsh_matlab_prepare_sweep','dsh_matlab_collect','dsh_matlab_list_figures','dsh_matlab_collect_sweep','dsh_matlab_list_sweeps','read_image'].includes(name)&&!matlabExecution(name))return state;
    let args;try {args=typeof raw==='string'?JSON.parse(raw):raw;}catch {args={};}
    const next={...state,calls:{...state.calls,[callId]:{name,args}},sweeps:state.sweeps||{}};
    if(name==='dsh_matlab_prepare_sweep')next.activity={phase:'preparing'};
    if(name==='dsh_matlab_collect_sweep')updateSweep(next,args?.sweepId,{phase:'verifying',error:null});
    if(matlabExecution(name)) {
      const id=state.activeSweepId,sweep=id&&state.sweeps?.[id];
      if(sweep?.sweepDir&&JSON.stringify(args).includes(sweep.sweepDir)&&['prepared','running','awaiting-collection','unknown'].includes(sweep.phase)){
        next.calls[callId].sweepId=id;
        updateSweep(next,id,{phase:'running',error:null});
      }
    }
    return next;
  }
  if(event.type!=='tool/result')return state;
  const message=event.data.message,callId=message?.toolCallId,call=state.calls[callId];
  if(!call)return state;
  const calls={...state.calls}; delete calls[callId];
  const next={...state,calls,sweeps:state.sweeps||{}};
  if(call.name==='dsh_matlab_prepare_sweep') {
    if(message.isError){next.activity={phase:'error',error:textResult(message).slice(0,300)||'Preparation failed'};return next;}
    let data;try{data=JSON.parse(textResult(message));}catch{}
    if(data?.status==='prepared'&&data?.kind==='pid_sweep'&&typeof data.sweepId==='string'){
      next.activeSweepId=data.sweepId;
      updateSweep(next,data.sweepId,{phase:'prepared',runCount:data.items?.length||0,sweepDir:data.sweepDir});
      next.activity=null;
    }else next.activity={phase:'error',error:'Invalid preparation response'};
    return next;
  }
  if(call.sweepId) {
    // MCP may return MATLAB errors as ordinary text even when isError=false.
    updateSweep(next,call.sweepId,{phase:matlabSucceeded(message)?'awaiting-collection':'unknown',error:matlabSucceeded(message)?null:textResult(message).slice(0,300)||'MATLAB MCP completion not confirmed'});
    return next;
  }
  if(call.name==='dsh_matlab_collect_sweep'&&message.isError){updateSweep(next,call.args?.sweepId,{phase:'verify-failed',error:textResult(message).slice(0,300)||'Artifact verification failed'});return next;}
  if(message.isError&&call.name!=='read_image')return next;
  if(call.name==='read_image') {
    const attachment=message.content?.find(c=>c.type==='image')?.attachment;
    const target=state.figures.find(f=>keyPath(f.path)===keyPath(call.args?.file_path));
    if(message.isError||!attachment?.attachmentId||typeof call.args?.file_path!=='string'){
      if(target&&sweepForFigure(target))updateSweep(next,sweepForFigure(target),{phase:'image-failed',error:textResult(message).slice(0,300)||'read_image returned no image attachment'});
      return next;
    }
    const key=keyPath(call.args.file_path);
    next.images={...state.images,[key]:attachment};
    next.figures=state.figures.map(f=>keyPath(f.path)===key?{...f,attachment}:f);
    for(const figure of next.figures)if(keyPath(figure.path)===key)refreshImages(next,sweepForFigure(figure));
    return next;
  }
  let payload; try { payload=JSON.parse(textResult(message)); } catch {}
  if(payload?.kind!=='dsh-matlab-figures'||!Array.isArray(payload.figures)){
    if(call.name==='dsh_matlab_collect_sweep')updateSweep(next,call.args?.sweepId,{phase:'verify-failed',error:textResult(message).slice(0,300)||'Invalid sweep collection response'});
    return next;
  }
  if(call.name==='dsh_matlab_collect_sweep'&&payload.sweepId!==call.args?.sweepId){
    updateSweep(next,call.args?.sweepId,{phase:'verify-failed',error:'Sweep ID mismatch in collection response'});
    return next;
  }
  const figures=new Map(state.figures.map(f=>[f.imageId,f]));
  for(const figure of payload.figures) {
    if(figure?.schemaVersion!==1||typeof figure.imageId!=='string'||typeof figure.path!=='string')continue;
    const attachment=state.images[keyPath(figure.path)];
    figures.set(figure.imageId,{...figure,...attachment?{attachment}:{}});
  }
  next.figures=[...figures.values()];
  if(call.name==='dsh_matlab_collect_sweep'&&payload.sweepId){
    updateSweep(next,payload.sweepId,{phase:'loading',imageCount:payload.figures.length,error:null});
    refreshImages(next,payload.sweepId);
  }
  if(call.name==='dsh_matlab_list_sweeps')for(const id of payload.sweeps||[]){
    updateSweep(next,id,{phase:'loading',imageCount:next.figures.filter(f=>sweepForFigure(f)===id).length,error:null});
    refreshImages(next,id);
  }
  return next;
}
