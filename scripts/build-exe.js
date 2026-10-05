const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const candidates=[process.env.INNO_ISCC,path.join(root,'.build-tools','InnoSetup','ISCC.exe'),'C:\\Program Files (x86)\\Inno Setup 7\\ISCC.exe','C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe'].filter(Boolean);
const compiler=candidates.find(file=>fs.existsSync(file));
if(!compiler){console.error('Inno Setup compiler (ISCC.exe) не найден. Установите Inno Setup 7 или задайте INNO_ISCC.');process.exit(1);}
const result=spawnSync(compiler,[path.join(root,'installer','portfolio-lens.iss')],{cwd:root,stdio:'inherit'});
process.exit(result.status??1);
