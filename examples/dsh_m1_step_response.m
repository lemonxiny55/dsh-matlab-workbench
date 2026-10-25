function dsh_m1_step_response(runDir,imageId)
% One control-system experiment; base MATLAB ODE solver, no optional toolbox.
zeta=0.48; wn=3; dt=0.002; duration=12;
tRequested=(0:dt:duration)';
options=odeset('RelTol',1e-9,'AbsTol',1e-11);
[t,x]=ode45(@(~,x)[x(2);wn^2*(1-x(1))-2*zeta*wn*x(2)],tRequested,[0;0],options);
y=x(:,1); [peak,k]=max(y); last=find(abs(y-1)>0.02,1,'last');
A=[0 1;-wn^2 -2*zeta*wn]; B=[0;wn^2];
equilibrium=-(A\B); steadyStateError=1-equilibrium(1);
settling=[]; settlingStatus='not_determined';
if isempty(last), settling=t(1); settlingStatus='within_recorded_window';
elseif last<numel(t), settling=t(last+1); settlingStatus='within_recorded_window'; end
metrics=struct('source','MATLAB','method','ode45 samples: max(y), last out-of-2%-band sample plus one', ...
    'matlab',version,'solver','ode45','relativeTolerance',1e-9,'absoluteTolerance',1e-11, ...
    'zeta',zeta,'wn_rad_s',wn,'sampleInterval_s',dt,'window_s',duration,'reference',1, ...
    'knownFinalValue',1,'settlingBandFraction',0.02,'peak',peak,'peakTime_s',t(k), ...
    'overshoot_percent',100*(peak-1),'sampledSettlingTime_s',settling,'settlingStatus',settlingStatus, ...
    'finalSampleError',1-y(end),'analyticSteadyStateError',steadyStateError, ...
    'steadyStateMethod','MATLAB solves x_eq = -(A\B), error = reference - x_eq(1) for stable A');
writematrix([t,y],fullfile(runDir,'samples.csv'));
fid=fopen(fullfile(runDir,'metrics.json'),'w','n','UTF-8'); assert(fid>=0);
closer=onCleanup(@()fclose(fid)); fwrite(fid,jsonencode(metrics),'char'); clear closer;
fig=figure('Visible','off');
plot(t,y,'LineWidth',1.7); hold on; yline(1,'--'); yline(0.98,':'); yline(1.02,':');
grid on; xlabel('Time (s)'); ylabel('Output'); title('M1: numerical unit-step response');
% Random visual control is deliberately omitted from stdout and metadata.
tokens={'ORBIT','MAPLE','COMET','RIVER','CEDAR','LANTERN'};
text(6,0.45,['Visual control: ' tokens{randi(numel(tokens))}],'FontSize',13);
dsh_m1_save_figure(fig,runDir,imageId,'Unit-step response / ODE45'); close(fig);
disp('DSH_M1_EXPERIMENT_SUCCEEDED'); disp(jsonencode(metrics));
end
