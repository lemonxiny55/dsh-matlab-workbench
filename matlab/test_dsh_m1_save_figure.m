function tests = test_dsh_m1_save_figure
tests=functiontests(localfunctions);
end
function setupOnce(testCase)
root=fileparts(fileparts(mfilename('fullpath'))); addpath(fullfile(root,'matlab'));
base=fullfile(root,'.m1','matlab-tests'); if ~isfolder(base), mkdir(base); end
testCase.TestData.base=base;
end
function [dir,id,fig]=fixture(testCase)
id=char(java.util.UUID.randomUUID()); dir=fullfile(testCase.TestData.base,char(java.util.UUID.randomUUID())); mkdir(dir);
record=struct('schemaVersion',1,'imageId',id,'runDir',dir);
fid=fopen(fullfile(dir,'prepared.json'),'w'); fwrite(fid,jsonencode(record),'char'); fclose(fid);
fig=figure('Visible','off'); plot(1:4,[0 1.2 0.9 1]);
end
function testSaveAndNoOverwrite(testCase)
[dir,id,fig]=fixture(testCase); cleaner=onCleanup(@()close(fig));
meta=dsh_m1_save_figure(fig,dir,id,'Unit test');
verifyTrue(testCase,isfile(fullfile(dir,[id '.png'])));
verifyTrue(testCase,isfile(fullfile(dir,'figure.json')));
verifyEqual(testCase,meta.imageId,id);
before=dirBytes(fullfile(dir,[id '.png']));
verifyError(testCase,@()dsh_m1_save_figure(fig,dir,id,'Again'),'DSHM1:Exists');
verifyEqual(testCase,dirBytes(fullfile(dir,[id '.png'])),before);
end
function testRejectRelativeAndTraversal(testCase)
[~,id,fig]=fixture(testCase); cleaner=onCleanup(@()close(fig));
verifyError(testCase,@()dsh_m1_save_figure(fig,'relative',id),'DSHM1:AbsolutePath');
verifyError(testCase,@()dsh_m1_save_figure(fig,testCase.TestData.base,'../escape'),'DSHM1:Id');
end
function testRejectEmptyFigure(testCase)
[dir,id,fig]=fixture(testCase); cleaner=onCleanup(@()close(fig)); delete(fig.Children);
verifyError(testCase,@()dsh_m1_save_figure(fig,dir,id),'DSHM1:Empty');
verifyFalse(testCase,isfile(fullfile(dir,[id '.png'])));
end
function testNumericalStepAndEquilibrium(testCase)
[dir,id,fig]=fixture(testCase); close(fig);
root=fileparts(fileparts(mfilename('fullpath'))); addpath(fullfile(root,'examples'));
dsh_m1_step_response(dir,id);
metrics=jsondecode(fileread(fullfile(dir,'metrics.json')));
verifyEqual(testCase,metrics.analyticSteadyStateError,0,'AbsTol',1e-14);
verifyEqual(testCase,metrics.sampledSettlingTime_s,2.742,'AbsTol',0.002);
verifyEqual(testCase,metrics.overshoot_percent,17.925750372797378,'AbsTol',1e-6);
verifyEqual(testCase,metrics.source,'MATLAB');
end
function bytes=dirBytes(file)
fid=fopen(file,'r'); cleaner=onCleanup(@()fclose(fid)); bytes=fread(fid,Inf,'*uint8');
end
