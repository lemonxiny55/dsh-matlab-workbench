function metadata = dsh_m1_save_figure(fig, runDir, imageId, titleText)
% Explicit figure handle, absolute run path, unique ID; commit metadata last.
arguments
    fig (1,1) matlab.ui.Figure
    runDir (1,1) string
    imageId (1,1) string
    titleText (1,1) string = "Simulation result"
end
assert(strlength(titleText)<=200,'DSHM1:Title','Title too long');
assert(~isempty(regexp(char(runDir),'^([A-Za-z]:[\\/]|/[^/])','once')), ...
    'DSHM1:AbsolutePath','An absolute local run directory is required');
assert(isempty(regexp(char(runDir),'[\x00-\x1f]','once')), 'DSHM1:Path','Invalid path');
assert(~isempty(regexp(char(imageId),'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$','once')), ...
    'DSHM1:Id','Invalid image UUID');
record=jsondecode(fileread(fullfile(runDir,'prepared.json')));
assert(record.schemaVersion==1 && string(record.imageId)==imageId && string(record.runDir)==runDir, ...
    'DSHM1:Preparation','Run does not match Host preparation');
png=fullfile(runDir,imageId+'.png'); partial=fullfile(runDir,imageId+'.partial.png');
manifest=fullfile(runDir,'figure.json'); temporary=fullfile(runDir,imageId+'.partial.json');
assert(~isfile(png)&&~isfile(partial)&&~isfile(manifest)&&~isfile(temporary), ...
    'DSHM1:Exists','Refusing to overwrite an existing figure or partial export');
assert(~isempty(fig.Children),'DSHM1:Empty','Cannot export an empty figure');
exportgraphics(fig,partial,'Resolution',150);
[ok,msg]=movefile(partial,png); assert(ok,'DSHM1:Commit','%s',msg);
utc=datetime('now','TimeZone','UTC','Format',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
metadata=struct('schemaVersion',1,'imageId',char(imageId),'file',char(imageId+'.png'), ...
    'title',char(titleText),'exportedUtc',char(utc));
fid=fopen(temporary,'w','n','UTF-8'); assert(fid>=0,'DSHM1:Metadata','Cannot create figure metadata');
closer=onCleanup(@()fclose(fid));
fwrite(fid,unicode2native(jsonencode(metadata),'UTF-8'),'uint8'); clear closer;
[ok,msg]=movefile(temporary,manifest); assert(ok,'DSHM1:Commit','%s',msg);
end
