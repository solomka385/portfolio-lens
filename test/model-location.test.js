const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {prepareModelRoot}=require('../src/model-location');

test('a second installation uses persistent models and migrates existing files',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-model-root-'));
  try {
    const userData=path.join(base,'user-data');
    const oldInstall=path.join(base,'old-install');
    const newInstall=path.join(base,'new-install');
    fs.mkdirSync(path.join(oldInstall,'models','ocr'),{recursive:true});
    fs.writeFileSync(path.join(oldInstall,'models','ocr','rus.traineddata'),'existing model');
    const first=prepareModelRoot(userData,[path.join(oldInstall,'models')]);
    const second=prepareModelRoot(userData,[path.join(newInstall,'models')]);
    assert.equal(first,second);
    assert.equal(fs.readFileSync(path.join(second,'ocr','rus.traineddata'),'utf8'),'existing model');
  } finally {fs.rmSync(base,{recursive:true,force:true});}
});
