import {fileURLToPath} from 'node:url';
import {prepareRun,collectStandaloneFigure,listFigures,requireId} from '../../core/figures.mjs';
import {prepareSweep,collectSweep,listSweeps} from '../../core/sweeps.mjs';
import {emptyState,foldFigures,stateSchema} from './projection.mjs';

export const inject=['tools','systemPrompt','sessionProjections','workingDirectory'];
const helperDir=fileURLToPath(new URL('../../matlab/',import.meta.url));
const output={schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
export function apply(ctx) {
  const disposers=[];
  const workspace=async exec=>{
    exec.signal.throwIfAborted();
    if(!exec.agent)throw Error('A session-owned Agent invocation is required');
    const cwd=await ctx.workingDirectory.ensure(exec.agent,exec.signal);
    exec.signal.throwIfAborted();
    return cwd;
  };
  const register=(name,description,properties,required,execute)=>{
    disposers.push(ctx.tools.register({name,description,parameters:{type:'object',properties,required,additionalProperties:false},output,
      async execute(args,exec){
        if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(properties,k)))throw Error('Invalid arguments');
        for(const key of required)if(!(key==='parameters'?Array.isArray(args[key]):typeof args[key]==='string'))throw Error(`${key} is required`);
        return execute(args,exec);
      }
    }));
  };
  try {
    disposers.push(ctx.sessionProjections.register({key:'matlabFigures',stateSchema,init:emptyState,apply:foldFigures,stateVersion:1,wire:{viewSchema:stateSchema,view:state=>state}}));
    register('dsh_matlab_prepare','Prepare a unique workspace run and safe MATLAB helper code. Does not execute MATLAB or save an image.',{},[],async (_args,exec)=>prepareRun(await workspace(exec),helperDir,{execution:'unknown',scriptHash:'unknown'}));
    register('dsh_matlab_collect','Verify one completed MATLAB export and index it. Returns a PNG path; call read_image to provide actual visual input. Does not claim simulation success.',{runId:{type:'string'}},['runId'],async (args,exec)=>{
      requireId(args.runId); const figure=await collectStandaloneFigure(await workspace(exec),args.runId);
      exec.signal.throwIfAborted();
      return {kind:'dsh-matlab-figures',figures:[figure],next:`Call read_image with file_path=${figure.path}. Precise metrics are MATLAB-computed; never replace them with visual estimates.`};
    });
    register('dsh_matlab_list_figures','Revalidate standalone M1 figure artifacts; use list_sweeps for complete M2 scans.',{},[],async (_args,exec)=>({kind:'dsh-matlab-figures',figures:await listFigures(await workspace(exec),{includeSweeps:false})}));
    register('dsh_matlab_prepare_sweep','Prepare 2–12 PID gain combinations for the fixed documented second-order MATLAB sample plant. Does not run MATLAB.',{
      parameters:{type:'array',minItems:2,maxItems:12,items:{type:'object',properties:{kp:{type:'number'},ki:{type:'number'},kd:{type:'number'}},required:['kp','ki','kd'],additionalProperties:false}}
    },['parameters'],async (args,exec)=>prepareSweep(await workspace(exec),helperDir,args.parameters));
    register('dsh_matlab_collect_sweep','Verify an entire completed MATLAB PID sweep: all per-run CSV, metrics, PNG and overlay. Incomplete sweeps fail without indexing.',{
      sweepId:{type:'string'}
    },['sweepId'],async (args,exec)=>{
      requireId(args.sweepId);const result=await collectSweep(await workspace(exec),args.sweepId);
      exec.signal.throwIfAborted();
      return {...result,next:'Call read_image once for EACH returned figure path, especially the overlay; the Desktop comparison tab will display numerical metrics from MATLAB and the overlay after the attachment arrives.'};
    });
    register('dsh_matlab_list_sweeps','Revalidate and list only completed, whole PID sweeps with verified artifacts.',{},[],async (_args,exec)=>{
      const groups=await listSweeps(await workspace(exec));return {kind:'dsh-matlab-figures',figures:groups.flatMap(group=>group.figures),sweeps:groups.map(group=>group.sweepId)};
    });
    disposers.push(ctx.systemPrompt.section({name:'dsh-matlab-workbench',order:9050,text:
      'For MATLAB figures: dsh_matlab_prepare prepares unique absolute paths and helper code; it does not execute. Execute with the official MATLAB MCP. Pass an explicit figure handle to dsh_m1_save_figure, then dsh_matlab_collect and read_image on its exact path. For M2 PID sweeps, call dsh_matlab_prepare_sweep with an array of {kp,ki,kd}; execute its setupCode and executeCode through the official MATLAB MCP, check DSH_M2_SWEEP_SUCCEEDED, then call dsh_matlab_collect_sweep and read_image for every returned path. Use only verified completed sweeps in comparison. The example is a fixed second-order plant, with derivative on measurement, 12 second window and ode45. Compare MATLAB computed IAE (lower over this window), settling status, and control effort, without treating a ranking as universally optimal. The MATLAB Figures tab displays only collected artifacts referenced by this session. A displayed figure is not evidence the model has seen it. Describe image observations separately from numerical results. Missing, failed, timed-out or cancelled execution is not success; cancellation does not prove MATLAB has stopped. Do not retry writes automatically.'}));
    ctx.logger?.info?.('DSH_M1_HOST_APPLY');
  } catch(error) { for(const dispose of disposers.reverse())dispose(); throw error; }
  return ()=>{for(const dispose of disposers.reverse())dispose();ctx.logger?.info?.('DSH_M1_HOST_DISPOSE');};
}
