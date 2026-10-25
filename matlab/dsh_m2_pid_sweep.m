function summary = dsh_m2_pid_sweep(sweepDir)
% Run each prepared PID experiment once. Only commit completion after all
% MATLAB CSV, numerical metrics and figure exports have succeeded.
arguments
    sweepDir (1,1) string
end
assert(isfolder(sweepDir),'DSHM2:Directory','Sweep directory is missing');
manifestPath=fullfile(sweepDir,'sweep.json');
assert(isfile(manifestPath),'DSHM2:Manifest','Host manifest is missing');
manifest=jsondecode(fileread(manifestPath));
assert(manifest.schemaVersion==2 && strcmp(manifest.kind,'pid_sweep') && ...
    strcmp(manifest.status,'prepared') && string(manifest.sweepDir)==sweepDir, ...
    'DSHM2:Manifest','Unexpected sweep manifest');
assert(numel(manifest.items)>=2 && numel(manifest.items)<=12,'DSHM2:Count','Invalid run count');
assert(~isfile(fullfile(sweepDir,'completed.json')),'DSHM2:Exists','Sweep was already completed');
assert(isfield(manifest,'comparison'),'DSHM2:Manifest','Comparison run missing');
plant=manifest.plant;
assert(plant.zeta==0.48 && plant.wn_rad_s==3 && plant.reference==1 && ...
    plant.sampleInterval_s==0.01 && plant.window_s==12, ...
    'DSHM2:Plant','Unsupported plant definition');
for index=1:numel(manifest.items)
    item=manifest.items(index);
    assert(item.index==index-1,'DSHM2:Manifest','Run index mismatch');
    checkRun(item.runDir,item.runId,item.imageId,manifest.sweepId);
    gains=item.parameters;
    assert(all(isfinite([gains.kp gains.ki gains.kd])) && ...
        all([gains.kp gains.ki gains.kd]>=0) && all([gains.kp gains.ki gains.kd]<=100), ...
        'DSHM2:Gains','Invalid PID gains');
    a2=2*plant.zeta*plant.wn_rad_s+plant.wn_rad_s^2*gains.kd;
    a1=plant.wn_rad_s^2*(1+gains.kp);
    a0=plant.wn_rad_s^2*gains.ki;
    assert(gains.ki==0 || a2*a1>a0,'DSHM2:Unstable','Unstable closed loop');
    assert(~isfile(fullfile(item.runDir,'metrics.json')) && ...
        ~isfile(fullfile(item.runDir,'samples.csv')) && ...
        ~isfile(fullfile(item.runDir,'figure.json')), ...
        'DSHM2:Exists','Refusing to overwrite existing experiment');
end
checkRun(manifest.comparison.runDir,manifest.comparison.runId, ...
    manifest.comparison.imageId,manifest.sweepId);
assert(~isfile(fullfile(manifest.comparison.runDir,'figure.json')), ...
    'DSHM2:Exists','Comparison figure already exists');

stepTime=(0:plant.sampleInterval_s:plant.window_s)';
trajectories=zeros(numel(stepTime),numel(manifest.items));
labels=cell(numel(manifest.items),1);
opts=odeset('RelTol',1e-9,'AbsTol',1e-11);
for index=1:numel(manifest.items)
    item=manifest.items(index); g=item.parameters;
    % Plant: y'' + 2*zeta*wn*y' + wn^2*y = wn^2*u.
    % PID derivative acts on the measured output to avoid setpoint kick.
    [t,x]=ode45(@(~,x)pidODE(x,g,plant),stepTime,[0;0;0],opts);
    y=x(:,1); v=x(:,2); integralError=x(:,3);
    u=g.kp*(plant.reference-y)+g.ki*integralError-g.kd*v;
    assert(all(isfinite([y;u])) && max(abs([y;u]))<1e6, ...
        'DSHM2:Diverged','Simulation output diverged');
    errorSignal=plant.reference-y;
    [peak,peakIndex]=max(y);
    lastOutside=find(abs(errorSignal)>0.02*abs(plant.reference),1,'last');
    settle=[];settleStatus='not_determined_in_window';
    if isempty(lastOutside)
        settle=t(1);settleStatus='within_recorded_window';
    elseif lastOutside<numel(t)
        settle=t(lastOutside+1);settleStatus='within_recorded_window';
    end
    if g.ki>0
        analyticFinal=plant.reference;
    else
        analyticFinal=plant.reference*g.kp/(1+g.kp);
    end
    metrics=struct('schemaVersion',2,'kind','pid_step_response', ...
        'source','MATLAB','method','ode45 sampled trajectory; MATLAB trapz and last outside reference 2 percent band', ...
        'matlab',version,'solver','ode45','relativeTolerance',1e-9, ...
        'absoluteTolerance',1e-11,'sampleInterval_s',plant.sampleInterval_s, ...
        'window_s',plant.window_s,'reference',plant.reference, ...
        'settlingBandFraction',0.02,'plant',plant,'pid',g, ...
        'derivativeMethod','derivative on measurement; no setpoint kick', ...
        'peak',peak,'peakTime_s',t(peakIndex), ...
        'overshoot_percent',max(0,100*(peak-plant.reference)/abs(plant.reference)), ...
        'sampledSettlingTime_s',settle,'settlingStatus',settleStatus, ...
        'integratedAbsoluteError',trapz(t,abs(errorSignal)), ...
        'integratedSquaredError',trapz(t,errorSignal.^2), ...
        'maxAbsoluteControl',max(abs(u)), ...
        'finalSampleError',errorSignal(end), ...
        'analyticSteadyStateError',plant.reference-analyticFinal, ...
        'steadyStateMethod','Stable closed-loop final-value theorem: Ki>0 => zero reference error; Ki=0 => 1/(1+Kp)');
    writematrix([t y u],fullfile(item.runDir,'samples.csv'));
    writeNewJson(fullfile(item.runDir,'metrics.json'),metrics);
    fig=figure('Visible','off'); cleaner=onCleanup(@()close(fig));
    plot(t,y,'LineWidth',1.5);hold on;
    yline(plant.reference,'--');yline(plant.reference*0.98,':');yline(plant.reference*1.02,':');
    grid on;xlabel('Time (s)');ylabel('Output y');
    title(sprintf('PID %d: Kp=%.3g Ki=%.3g Kd=%.3g',index,g.kp,g.ki,g.kd));
    dsh_m1_save_figure(fig,string(item.runDir),string(item.imageId), ...
        "PID step response " + index);
    clear cleaner;
    trajectories(:,index)=y;
    labels{index}=sprintf('%d: P=%.3g I=%.3g D=%.3g',index,g.kp,g.ki,g.kd);
end

fig=figure('Visible','off');cleaner=onCleanup(@()close(fig));
plot(stepTime,trajectories,'LineWidth',1.5);hold on;
yline(plant.reference,'--k','Reference');grid on;
xlabel('Time (s)');ylabel('Output y');title('M2 PID parameter sweep comparison');
legend(labels,'Location','best');
dsh_m1_save_figure(fig,string(manifest.comparison.runDir), ...
    string(manifest.comparison.imageId),'PID sweep overlay comparison');
clear cleaner;
utc=datetime('now','TimeZone','UTC','Format',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
summary=struct('schemaVersion',2,'sweepId',manifest.sweepId, ...
    'runCount',numel(manifest.items),'completedUtc',char(utc));
writeNewJson(fullfile(sweepDir,'completed.json'),summary);
disp('DSH_M2_SWEEP_SUCCEEDED');disp(jsonencode(summary));
end

function dx=pidODE(x,g,plant)
e=plant.reference-x(1);
u=g.kp*e+g.ki*x(3)-g.kd*x(2);
dx=[x(2);plant.wn_rad_s^2*(u-x(1))-2*plant.zeta*plant.wn_rad_s*x(2);e];
end

function checkRun(runDir,runId,imageId,sweepId)
assert(isfolder(runDir),'DSHM2:Run','Run directory missing');
prepared=jsondecode(fileread(fullfile(runDir,'prepared.json')));
assert(prepared.schemaVersion==1 && string(prepared.runId)==string(runId) && ...
    string(prepared.runDir)==string(runDir) && ...
    string(prepared.imageId)==string(imageId) && ...
    strcmp(prepared.provenance.sweepId,sweepId), ...
    'DSHM2:Run','Run preparation mismatch');
end

function writeNewJson(target,value)
assert(~isfile(target),'DSHM2:Exists','Refusing to replace an existing record');
temporary=string(tempname(fileparts(target)))+".partial.json";
fid=fopen(temporary,'w','n','UTF-8');
assert(fid>=0,'DSHM2:Write','Unable to create record');
closer=onCleanup(@()fclose(fid));
fwrite(fid,unicode2native(jsonencode(value),'UTF-8'),'uint8');
clear closer;
assert(~isfile(target),'DSHM2:Exists','Refusing to replace an existing record');
[ok,msg]=movefile(temporary,target);
assert(ok,'DSHM2:Commit','%s',msg);
end
