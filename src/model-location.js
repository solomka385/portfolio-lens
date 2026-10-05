const fs=require('node:fs');
const path=require('node:path');

function copyMissing(source,destination) {
  if(!fs.existsSync(source)) return;
  fs.mkdirSync(destination,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    if(entry.name.endsWith('.part')) continue;
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    if(entry.isDirectory()) copyMissing(from,to);
    else if(entry.isFile()&&!fs.existsSync(to)) fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
  }
}

function prepareModelRoot(userData,legacyRoots=[]) {
  const root=path.join(userData,'models');
  fs.mkdirSync(root,{recursive:true});
  for(const legacy of legacyRoots) {
    if(!legacy || path.resolve(legacy)===path.resolve(root)) continue;
    for(const folder of ['ocr','ocr-best','engine','llm']) copyMissing(path.join(legacy,folder),path.join(root,folder));
  }
  return root;
}

module.exports={prepareModelRoot};
