window.__ModuleLoader__.load({
  id:'dsh-matlab-workbench',
  factory(require) {
    const React=require('react'),h=React.createElement;
    const dictionaries={
      zh:{figures:{tab:'MATLAB 图像',empty:'尚无已收集图像。请先运行 MATLAB，再调用 dsh_matlab_collect。',pending:'等待 Agent 调用 read_image',loading:'正在载入图像…',failed:'图像载入失败',source:'MATLAB 数值结果',expand:'放大 / 收起',boundary:'图像用于定性观察；精确数值来自 MATLAB 数据计算。'},compare:{tab:'PID 实验对比',empty:'尚无已完成并收集的 PID 扫描。',boundary:'指标由 MATLAB ode45 数据计算。按 12 秒窗口内 IAE 比较，不能代替稳定性、控制量和实际对象的验证。',overlay:'MATLAB 曲线叠加图',run:'组别',gain:'PID 参数 (Kp / Ki / Kd)',iae:'IAE ↓',ise:'ISE',overshoot:'超调 %',settling:'2% 调节时间 (s)',effort:'最大控制量',best:'本组最低 IAE',unknown:'未确定',curves:'单组实验曲线',status:'当前状态',preparing:'正在准备参数…',prepared:'已准备：请由 Agent 使用官方 MATLAB MCP 执行',running:'MATLAB MCP 正在执行…',awaiting:'MCP 返回了完成标记，等待产物核验',verifying:'正在校验全部 MATLAB 产物…',loading:'已核验指标，等待 read_image 附件',complete:'全部指标及图像已就绪',failed:'校验失败；检查 MATLAB 运行日志，勿自动重试',uncertain:'MCP 状态不确定；确认执行是否结束后再操作',none:'等待 Agent 准备扫描',images:'图像附件'},setup:{tab:'PID 参数准备',guide:'每行一组 Kp, Ki, Kd，用英文逗号分隔。2–12 组；各值在 0–100 内。这里仅校验并生成消息，不运行 MATLAB。',label:'PID 参数（每行 Kp,Ki,Kd）',validate:'检查并生成 Agent 指令',ready:'将以下指令复制到当前会话发送给 Agent',instruction:'请使用 dsh_matlab_prepare_sweep 准备以下参数，通过官方 MATLAB MCP 执行 setupCode 和 executeCode；核验完成标记后调用 dsh_matlab_collect_sweep，再用 read_image 读取全部 PNG。不可根据图像猜测精确指标，执行失败时不要自动重试。参数：',error:'参数有误',rowCount:'请输入 2–12 组 PID 参数',format:'第 {row} 行：请按 Kp,Ki,Kd 输入三个数字',range:'第 {row} 行：各参数必须是 0–100 的有限数值',unstable:'第 {row} 行：参数使示例对象闭环不稳定',duplicate:'第 {row} 行：与前面的参数组重复'}},
      en:{figures:{tab:'MATLAB Figures',empty:'No collected figures. Run MATLAB, then call dsh_matlab_collect.',pending:'Waiting for the Agent to call read_image',loading:'Loading image…',failed:'Image load failed',source:'MATLAB numerical results',expand:'Expand / collapse',boundary:'Images support qualitative observations; precise metrics come from MATLAB data calculations.'},compare:{tab:'PID Experiments',empty:'No completed and collected PID sweeps in this session.',boundary:'Metrics come from MATLAB ode45 samples. Compare IAE over 12 seconds alongside stability, control effort and real plant checks.',overlay:'MATLAB overlay',run:'Run',gain:'PID gains (Kp / Ki / Kd)',iae:'IAE ↓',ise:'ISE',overshoot:'Overshoot %',settling:'2% settling time (s)',effort:'Max control',best:'Lowest IAE in sweep',unknown:'Undetermined',curves:'Individual response curves',status:'Status',preparing:'Preparing PID parameters…',prepared:'Prepared: ask the Agent to execute via official MATLAB MCP',running:'Executing in MATLAB MCP…',awaiting:'MCP returned completion marker; verify all artifacts',verifying:'Verifying all MATLAB artifacts…',loading:'Metrics verified; awaiting read_image attachments',complete:'Metrics and images ready',failed:'Verification failed; inspect MATLAB log and do not retry automatically',uncertain:'Unknown MCP outcome; confirm execution stopped before proceeding',none:'Ask Agent to prepare a sweep',images:'Image attachments'},setup:{tab:'PID Input',guide:'One Kp, Ki, Kd set per line, comma-separated. 2–12 rows; values between 0 and 100. This only validates and drafts an Agent message. MATLAB is not executed here.',label:'PID parameters (Kp,Ki,Kd per line)',validate:'Validate and build Agent message',ready:'Copy this instruction into the current session for the Agent',instruction:'Use dsh_matlab_prepare_sweep for these parameters, run setupCode and executeCode via official MATLAB MCP, verify the completion marker, call dsh_matlab_collect_sweep, then read_image for all PNGs. Never guess precise metrics from images or automatically retry failed writes. Parameters: ',error:'Invalid PID parameters',rowCount:'Enter 2–12 PID parameter rows',format:'Row {row}: enter three numeric values as Kp,Ki,Kd',range:'Row {row}: values must be finite and between 0 and 100',unstable:'Row {row}: gains are unstable for the sample plant',duplicate:'Row {row}: duplicate gain set'}}
    };
    function FigureImage({figure,sessionId,loadAttachment,t}) {
      const [state,setState]=React.useState({key:null,url:null,error:null});
      const attachmentId=figure.attachment?.attachmentId;
      const key=JSON.stringify([sessionId,attachmentId]);
      React.useEffect(()=>{
        let active=true;
        setState({key,url:null,error:null});
        if(attachmentId) loadAttachment({sessionId,attachmentId}).then(result=>{
          if(!active)return;
          if(!result.ok)throw Error(result.error?.message||'Attachment unavailable');
          const value=result.value;
          if(!/^image\/(png|jpeg|webp|gif)$/.test(value.attachment.mediaType))throw Error('Unsupported image type');
          setState({key,url:`data:${value.attachment.mediaType};base64,${value.data}`,error:null});
        }).catch(error=>{if(active)setState({key,url:null,error:String(error.message)});});
        return ()=>{active=false;};
      },[sessionId,attachmentId,loadAttachment]);
      if(!attachmentId)return h('p',{role:'status'},t('figures.pending'));
      if(state.key!==key)return h('p',{role:'status'},t('figures.loading'));
      if(state.error)return h('p',{role:'alert'},`${t('figures.failed')}: ${state.error}`);
      if(!state.url)return h('p',{role:'status'},t('figures.loading'));
      return h('details',{open:true},h('summary',null,t('figures.expand')),h('img',{src:state.url,alt:figure.title,style:{display:'block',maxWidth:'100%',height:'auto'}}));
    }
    function validateRows(input,t) {
      const fail=(reason,index)=>{throw Error(t('setup.'+reason).replace('{row}',String(index+1)));};
      const lines=input.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      if(lines.length<2||lines.length>12)fail('rowCount',0);
      const seen=new Set();
      return lines.map((line,index)=>{
        const fields=line.split(',').map(value=>value.trim());
        if(fields.length!==3||fields.some(v=>!v||!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v)))fail('format',index);
        const [kp,ki,kd]=fields.map(Number);
        if([kp,ki,kd].some(value=>!Number.isFinite(value)||value<0||value>100))fail('range',index);
        if(ki>0&&(2*0.48*3+9*kd)*9*(1+kp)<=9*ki)fail('unstable',index);
        const key=JSON.stringify([kp,ki,kd]);
        if(seen.has(key))fail('duplicate',index);
        seen.add(key);
        return {kp,ki,kd};
      });
    }
    function SetupView({t}) {
      const [draft,setDraft]=React.useState('1,0.5,0.2\n3,1,0.5\n2,0.8,0.9');
      const [result,setResult]=React.useState(null);
      const check=()=>{try{setResult({parameters:validateRows(draft,t)});}catch(error){setResult({error:error.message});}};
      return h('section',{'aria-label':t('setup.tab'),style:{padding:20,overflow:'auto',height:'100%',color:'var(--dsw-alias-text-primary)'}},
        h('h2',null,t('setup.tab')),h('p',null,t('setup.guide')),
        h('label',{htmlFor:'dsh-pid-input'},t('setup.label')),
        h('textarea',{id:'dsh-pid-input',rows:7,value:draft,onChange:event=>{setDraft(event.target.value);setResult(null);},style:{display:'block',width:'100%',maxWidth:620,margin:'12px 0',fontFamily:'monospace'}}),
        h('button',{type:'button',onClick:check},t('setup.validate')),
        result?.error?h('p',{role:'alert'},`${t('setup.error')}: ${result.error}`):null,
        result?.parameters?h('div',{role:'status'},h('p',null,t('setup.ready')),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',userSelect:'text',padding:12,border:'1px solid var(--dsw-alias-border-base)'}},t('setup.instruction')+JSON.stringify({parameters:result.parameters}))):null);
    }
    return {inject:['slots','locale','remote','remote.session'],apply(ctx) {
      const flat=Object.fromEntries(Object.entries(dictionaries).map(([language,dict])=>[language,Object.fromEntries(Object.entries(dict).flatMap(([group,entries])=>Object.entries(entries).map(([key,value])=>[group+'.'+key,value])))]));
      ctx.effect(()=>ctx.locale.register('matlabWorkbench',flat));
      const t=ctx.locale.bind('matlabWorkbench');
      // Keep one function per plugin lifetime, independent of service proxy identity.
      // Desktop 0.2.1 accepts exactly one argument; it exposes no per-read abort.
      const loadAttachment=request=>ctx.remote.session.attachment(request);
      function FigureView(props) {
        const snapshot=props.useProjection('matlabFigures');
        const figures=snapshot?.figures||[];
        return h('section',{'aria-label':t('figures.tab'),'data-dsh-matlab-figure-view':'active',style:{padding:20,overflow:'auto',height:'100%',color:'var(--dsw-alias-text-primary)',background:'var(--dsw-alias-bg-base)'}},
          h('h2',null,t('figures.tab')),h('p',null,t('figures.boundary')),
          figures.length?figures.map(figure=>h('article',{key:figure.imageId,style:{border:'1px solid var(--dsw-alias-border-base)',borderRadius:8,padding:16,marginBottom:16}},
            h('h3',null,figure.title),h('div',null,figure.imageId),
            h(FigureImage,{figure,sessionId:props.sessionId,loadAttachment,t}),
            h('p',{style:{overflowWrap:'anywhere'}},`${figure.width} × ${figure.height} · SHA-256 ${figure.sha256}`),
            figure.metrics?h('details',null,h('summary',null,t('figures.source')),h('pre',{style:{whiteSpace:'pre-wrap'}},JSON.stringify(figure.metrics,null,2))):null
          )):h('p',null,t('figures.empty')));
      }
      const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(3):t('compare.unknown');
      function ComparisonView(props) {
        const snapshot=props.useProjection('matlabFigures'),figures=snapshot?.figures||[],sweeps=snapshot?.sweeps||{};
        const groups=new Map();
        for(const figure of figures) {
          const provenance=figure.provenance;
          if(!provenance?.sweepId||!['pid_sweep','pid_comparison'].includes(provenance.kind))continue;
          if(!groups.has(provenance.sweepId))groups.set(provenance.sweepId,{rows:[],overlay:null});
          const group=groups.get(provenance.sweepId);
          if(provenance.kind==='pid_comparison')group.overlay=figure;
          else if(figure.metrics?.source==='MATLAB'&&figure.metrics.kind==='pid_step_response')group.rows.push(figure);
        }
        for(const sweepId of Object.keys(sweeps))if(!groups.has(sweepId))groups.set(sweepId,{rows:[],overlay:null});
        const complete=[...groups];
        return h('section',{'aria-label':t('compare.tab'),style:{padding:20,overflow:'auto',height:'100%',color:'var(--dsw-alias-text-primary)',background:'var(--dsw-alias-bg-base)'}},
          h('h2',null,t('compare.tab')),h('p',null,t('compare.boundary')),
          snapshot?.activity?h('p',{role:snapshot.activity.error?'alert':'status'},snapshot.activity.error||t('compare.preparing')):null,
          complete.length?complete.map(([sweepId,group])=>{
            const current=sweeps[sweepId],phase=current?.phase||'complete';
            const status={prepared:'prepared',running:'running','awaiting-collection':'awaiting',verifying:'verifying',loading:'loading',complete:'complete','verify-failed':'failed','image-failed':'failed',unknown:'uncertain'}[phase]||'none';
            const rows=group.rows.slice().sort((a,b)=>a.provenance.index-b.provenance.index);
            const valid=rows.filter(f=>Number.isFinite(f.metrics.integratedAbsoluteError));
            const best=valid.length?valid.reduce((a,b)=>a.metrics.integratedAbsoluteError<=b.metrics.integratedAbsoluteError?a:b):null;
            const headers=['run','gain','iae','ise','overshoot','settling','effort'].map(name=>h('th',{key:name,scope:'col',style:{padding:8,textAlign:'left'}},t('compare.'+name)));
            return h('article',{key:sweepId,style:{border:'1px solid var(--dsw-alias-border-base)',padding:16,borderRadius:8,marginBottom:18}},
              h('h3',null,`Sweep ${sweepId}`),
              h('p',{role:phase==='verify-failed'||phase==='image-failed'||phase==='unknown'?'alert':'status'},`${t('compare.status')}: ${t('compare.'+status)}${current?.imagesLoaded!==undefined?' · '+t('compare.images')+': '+current.imagesLoaded+'/'+current.imageCount:''}${current?.error?' · '+current.error:''}`),
              rows.length>=2&&group.overlay?h('div',{style:{overflowX:'auto'}},h('table',{style:{width:'100%',borderCollapse:'collapse'}},
                h('thead',null,h('tr',null,...headers)),
                h('tbody',null,...rows.map(figure=>{
                  const m=figure.metrics,p=figure.provenance.parameters;
                  const values=[`${figure.provenance.index+1}${best?.imageId===figure.imageId?' ★':''}`,`${numeric(p.kp)} / ${numeric(p.ki)} / ${numeric(p.kd)}`,numeric(m.integratedAbsoluteError),numeric(m.integratedSquaredError),numeric(m.overshoot_percent),m.settlingStatus==='within_recorded_window'?numeric(m.sampledSettlingTime_s):t('compare.unknown'),numeric(m.maxAbsoluteControl)];
                  return h('tr',{key:figure.imageId,title:best?.imageId===figure.imageId?t('compare.best'):''},...values.map((value,index)=>h('td',{key:index,style:{padding:8,borderTop:'1px solid var(--dsw-alias-border-base)'}},value)));
                })))):null,
              group.overlay?h('div',null,h('h4',null,t('compare.overlay')),h(FigureImage,{figure:group.overlay,sessionId:props.sessionId,loadAttachment,t})):null,
              rows.length?h('details',null,h('summary',null,t('compare.curves')),...rows.map(row=>h('div',{key:row.imageId},h('h4',null,`${t('compare.run')} ${row.provenance.index+1}`),h(FigureImage,{figure:row,sessionId:props.sessionId,loadAttachment,t})))):null);
          }):h('p',null,t('compare.empty')));
      }
      ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'matlab-pid-setup',order:29,label:()=>t('setup.tab')},props=>SetupView({...props,t})));
      ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'matlab-figures',order:30,label:()=>t('figures.tab')},FigureView));
      ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'matlab-pid-comparison',order:31,label:()=>t('compare.tab')},ComparisonView));
    }};
  }
});
