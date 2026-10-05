const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell} = require('electron');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const Store=require('./store');
const {prepareModelRoot}=require('./model-location');
const {exactCandidate,providerTypeEvidence}=require('./matching');
const {riskProfile}=require('./risk');
const {parseLines,parseScreenshot,normalizePosition,assess}=require('./core');
const {Models,ocrImage,resolveInstrument,marketData,marketHistory,fxRates,newsFor,deterministicReport,aiReport}=require('./services');

let win, store, models;
const state={settings:{}, lastReport:null};
if(process.env.PORTFOLIO_LENS_DATA){fs.mkdirSync(process.env.PORTFOLIO_LENS_DATA,{recursive:true});app.setPath('userData',process.env.PORTFOLIO_LENS_DATA);}

function settingsFile() {return path.join(app.getPath('userData'),'settings.json');}
function loadSettings() {
  try { const raw=JSON.parse(fs.readFileSync(settingsFile(),'utf8')); const s={...raw}; for(const k of ['coinGeckoKey','alphaVantageKey','openFigiKey']) if(s[k] && typeof s[k]==='object' && safeStorage.isEncryptionAvailable()) s[k]=safeStorage.decryptString(Buffer.from(s[k].encrypted,'base64')); state.settings=s; } catch {state.settings={};}
}
function saveSettings(input) {
  const next={...state.settings,...input};
  const disk={...next};
  for(const k of ['coinGeckoKey','alphaVantageKey','openFigiKey']) if(disk[k] && safeStorage.isEncryptionAvailable()) disk[k]={encrypted:safeStorage.encryptString(disk[k]).toString('base64')};
  fs.writeFileSync(settingsFile(),JSON.stringify(disk,null,2)); state.settings=next; return next;
}
function createWindow() {
  win=new BrowserWindow({width:1380,height:900,minWidth:1050,minHeight:700,backgroundColor:'#0b1020',title:'Portfolio Lens',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  win.loadFile(path.join(__dirname,'ui','index.html'));
  if(process.env.PORTFOLIO_LENS_SMOKE) win.webContents.once('did-finish-load',async()=>{
    try {
      await new Promise(r=>setTimeout(r,1500));
      if(process.env.PORTFOLIO_LENS_SMOKE==='ocr') {
        const result=await ocrImage(process.env.PORTFOLIO_LENS_OCR_SAMPLE,models.root);
        console.log(JSON.stringify(result));
        return app.exit(result.text.includes('GAZP')?0:1);
      }
      if(process.env.PORTFOLIO_LENS_SMOKE==='flow') {
        await win.webContents.executeJavaScript('document.querySelector("[data-page=import]").click();document.querySelector("[data-action=add-manual]").click();document.querySelector("[data-field=name]").value="Smoke Asset";document.querySelector("[data-field=name]").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-field=enteredValue]").value="100";document.querySelector("[data-field=enteredValue]").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-action=save-draft]").click()');
        await new Promise(r=>setTimeout(r,900));
        await win.webContents.executeJavaScript('document.querySelector("[data-page=analysis]").click();document.querySelector("[data-action=analyze]").click()');
        await new Promise(r=>setTimeout(r,1200));
      }
      if(['screenshot','screenshot-bonds'].includes(process.env.PORTFOLIO_LENS_SMOKE)) {
        const sample=process.env.PORTFOLIO_LENS_OCR_SAMPLE;
        const withAi=process.env.PORTFOLIO_LENS_SMOKE_AI==='1';
        const summary=await win.webContents.executeJavaScript(`(async()=>{const api=window.portfolio;const parsed=await api.recognize([${JSON.stringify(sample)}]);await api.savePositions('default',parsed[0].positions);const matched=await api.matchPortfolio('default');await api.market('default');const report=await api.analysis('default',${withAi},'qwen4');S.data=await api.state();S.report=report;S.page='analysis';render();return {recognized:parsed[0].positions.length,first:parsed[0].positions[0]?.name,matched:matched.matched,matchedPositions:S.data.positions.filter(p=>p.provider).length,limitedPositions:S.data.positions.filter(p=>p.timeLimited).length,bondPositions:S.data.positions.filter(p=>p.type==='bond').length,riskCharts:report.enriched.filter(p=>p.risk?.chart).length,remaining:matched.remaining,total:report.report.data.total,news:report.enriched.reduce((n,p)=>n+p.news.length,0),narrativeLength:report.narrative.length,aiError:report.aiError}})()`);
        await new Promise(r=>setTimeout(r,700));
        const ui=await win.webContents.executeJavaScript('({heading:document.querySelector("#page-title")?.textContent,hasTimeRisk:document.querySelector("#content")?.textContent?.includes("4 позиций"),hasHistory:document.querySelector("#content")?.textContent?.includes("История торгов")})');
        Object.assign(summary,{ui});
        fs.mkdirSync(path.join(app.getPath('userData'),'smoke'),{recursive:true});
        fs.writeFileSync(path.join(app.getPath('userData'),'smoke','summary.json'),JSON.stringify(summary,null,2));
        try {fs.writeFileSync(path.join(app.getPath('userData'),'smoke','screen.png'),(await win.webContents.capturePage()).toPNG());} catch {}
        const bonds=process.env.PORTFOLIO_LENS_SMOKE==='screenshot-bonds';
        const ok=bonds?summary.recognized===9&&summary.bondPositions===9&&summary.matched>=3&&summary.riskCharts>=3&&Math.abs(summary.total-280922.52)<.1&&ui.hasHistory:summary.recognized===8&&summary.first==='Аэрофлот'&&summary.matched>=6&&summary.limitedPositions===4&&Math.abs(summary.total-55463.4356)<.1&&summary.riskCharts>=4&&ui.heading==='Анализ портфеля'&&(!withAi||summary.narrativeLength>100&&!summary.aiError);
        return app.exit(ok?0:1);
      }
      const result=await win.webContents.executeJavaScript('({title:document.title, heading:document.querySelector("h1")?.textContent, content:document.querySelector("main")?.textContent, error:document.querySelector("#toast")?.className})');
      fs.mkdirSync(path.join(app.getPath('userData'),'smoke'),{recursive:true});
      fs.writeFileSync(path.join(app.getPath('userData'),'smoke','screen.png'),(await win.webContents.capturePage()).toPNG());
      console.log(JSON.stringify(result));
      const ok=process.env.PORTFOLIO_LENS_SMOKE==='flow'?result.content?.includes('ОЦЕНЁННАЯ ЧАСТЬ'):result.content?.includes('Состав портфеля');
      app.exit(ok?0:1);
    } catch(e){console.error(e);app.exit(1);}
  });
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url)) shell.openExternal(url);return {action:'deny'};});
}

app.whenReady().then(async()=>{
  loadSettings();
  store=new Store(); await store.init(app.getPath('userData'));
  const legacyRoots=app.isPackaged?[path.join(path.dirname(process.execPath),'models'),path.join(app.getPath('home'),'AppData','Local','Programs','Portfolio Lens','models')]:[];
  const modelRoot=process.env.PORTFOLIO_LENS_SMOKE?.startsWith('screenshot')&&process.env.PORTFOLIO_LENS_MODEL_ROOT?process.env.PORTFOLIO_LENS_MODEL_ROOT:prepareModelRoot(app.getPath('userData'),legacyRoots);
  models=new Models(modelRoot,p=>win?.webContents.send('model-progress',p));
  createWindow();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});

function snapshot(){return {...store.all(),settings:state.settings,models:models.status(),fx:store.getCache('fx')?.value||null};}
ipcMain.handle('state',snapshot);
ipcMain.handle('save-portfolio',(_,p)=>{if(!p?.id || !p?.name) throw new Error('Укажите название портфеля');store.upsertPortfolio({id:String(p.id),name:String(p.name).slice(0,100),base:['RUB','USD','EUR'].includes(p.base)?p.base:'RUB',created:p.created});return snapshot();});
ipcMain.handle('save-positions',(_,portfolioId,items)=>{if(!store.all().portfolios.some(p=>p.id===portfolioId)) throw new Error('Портфель не найден');store.putPositions(portfolioId,items.map(normalizePosition));return snapshot();});
ipcMain.handle('choose-images',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Изображения',extensions:['png','jpg','jpeg','webp','bmp','tif','tiff']}]});return result.canceled?[]:result.filePaths;});
ipcMain.handle('recognize',async(_,paths)=>{const output=[];for(const file of paths){let mode=state.settings.ocrMode||'fast';let r=await ocrImage(file,models.root,mode);let positions=parseScreenshot(r.lines);if(mode==='enhanced'){const fast=await ocrImage(file,models.root,'fast');const fallback=parseScreenshot(fast.lines);const total=items=>items.reduce((sum,p)=>sum+(p.enteredValue||0),0);if(fallback.length>positions.length||Math.abs(total(positions)-total(fallback))>Math.max(1,Math.abs(total(fallback))*.02)){r=fast;positions=fallback;mode='fast';}}const warning=!positions.length&&r.confidence<45?'Текст слишком мелкий или нечёткий: загрузите снимок большего разрешения либо добавьте позиции вручную.':'';output.push({file,text:r.text,confidence:r.confidence,ocrMode:mode,warning,positions:positions.length?positions:warning?[]:parseLines(r.text.split(/\r?\n/))});}return output;});
ipcMain.handle('parse-text',(_,text)=>parseLines(String(text).split(/\r?\n/)));
ipcMain.handle('resolve',(_,query)=>resolveInstrument(query,state.settings));
ipcMain.handle('match-portfolio',async(_,portfolioId)=>{
  const all=store.all();
  if(!all.portfolios.some(p=>p.id===portfolioId))throw new Error('Портфель не найден');
  const positions=all.positions.filter(p=>p.portfolioId===portfolioId);
  let matched=0;
  for(const p of positions) {
    if(p.provider || p.type==='cash' || !p.name)continue;
    const candidates=await resolveInstrument(p.isin||p.ticker||p.name,state.settings);
    const x=exactCandidate(p,candidates);
    if(!x){const inferred=providerTypeEvidence(p,candidates);if(inferred)p.type=inferred;continue;}
    Object.assign(p,{name:x.name,ticker:x.ticker,isin:x.isin,type:x.type,provider:x.provider,providerId:x.providerId,confidence:'confirmed'});
    matched++;
  }
  store.putPositions(portfolioId,positions.map(normalizePosition));
  return {matched,remaining:positions.filter(p=>!p.provider&&p.type!=='cash').length};
});
ipcMain.handle('market',async(_,portfolioId)=>{
  const all=store.all(),portfolio=all.portfolios.find(p=>p.id===portfolioId); if(!portfolio) throw new Error('Портфель не найден');
  const positions=all.positions.filter(p=>p.portfolioId===portfolioId);
  let fx=store.getCache('fx')?.value || {rates:{RUB:1},updated:null};
  try {fx=await fxRates();store.setCache('fx',fx);}catch{}
  for(const p of positions) {
    if(!p.provider) continue;
    try {p.quote=await marketData(p,state.settings);}catch(e){p.quote={error:e.message,updated:new Date().toISOString()};}
    win?.webContents.send('market-progress',{id:p.id,quote:p.quote});
  }
  store.putPositions(portfolioId,positions.map(normalizePosition));
  return {positions,fx};
});
ipcMain.handle('analysis',async(_,portfolioId,useAi,modelId)=>{
  const all=store.all(),portfolio=all.portfolios.find(p=>p.id===portfolioId);if(!portfolio)throw new Error('Портфель не найден');
  const positions=all.positions.filter(p=>p.portfolioId===portfolioId);
  const fx=store.getCache('fx')?.value?.rates || {RUB:1};
  const report=deterministicReport({...portfolio,positions},fx);
  const enriched=[];
  for(const [index,p] of positions.entries()) {
    let news=[];
    if(p.provider) try {news=await newsFor(p);}catch{}
    let history=null;
    if(p.provider==='moex'&&['stock','bond','fund'].includes(p.type))try {
      const key=`history:${p.providerId}`;const cached=store.getCache(key);
      history=cached&&Date.now()-Date.parse(cached.updated)<86400000?cached.value:await marketHistory(p);
      if(history&&history!==cached?.value)store.setCache(key,history);
    }catch{}
    enriched.push({...p,news,risk:riskProfile(report.data.rows[index],history)});
    win?.webContents.send('analysis-progress',{done:enriched.length,total:positions.length});
  }
  let narrative='',aiError='';
  if(useAi) try {narrative=await aiReport(models.root,modelId,{positions:report.data.rows.map((row,i)=>({name:row.name,type:row.type,news:enriched[i].news.slice(0,2).map(n=>({title:n.title,date:n.date,url:n.url}))})).filter(x=>x.type!=='cash')});}catch(e){aiError=e.message;}
  state.lastReport={portfolio,report,enriched,narrative,aiError,date:new Date().toISOString()};
  return state.lastReport;
});
ipcMain.handle('models-status',()=>models.status());
ipcMain.handle('install-model',async(_,kind,id)=>{if(kind==='ocr')return models.installOcr();if(kind==='ocr-best')return models.installOcrBest();if(kind==='engine')return models.installEngine();if(kind==='ai')return models.installAi(id);throw new Error('Неизвестный пакет');});
ipcMain.handle('settings',(_,s)=>saveSettings(s));
ipcMain.handle('export',async(_,kind,portfolioId)=>{
  const all=store.all(),portfolio=all.portfolios.find(p=>p.id===portfolioId),positions=all.positions.filter(p=>p.portfolioId===portfolioId);
  const extension=kind==='csv'?'csv':'json';
  const result=await dialog.showSaveDialog(win,{defaultPath:`portfolio-${new Date().toISOString().slice(0,10)}.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
  if(result.canceled)return null;
  const csv=(v)=>`"${String(v??'').replace(/"/g,'""')}"`;
  const contents=kind==='csv'?['name,ticker,isin,type,quantity,price,value,currency,provider,providerId',...positions.map(p=>[p.name,p.ticker,p.isin,p.type,p.quantity,p.price,p.enteredValue,p.currency,p.provider,p.providerId].map(csv).join(','))].join('\r\n'):JSON.stringify({portfolio,positions,exported:new Date().toISOString()},null,2);
  fs.writeFileSync(result.filePath,contents,'utf8');return result.filePath;
});
ipcMain.handle('import-json',async()=>{
  const choice=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Portfolio Lens JSON',extensions:['json']}]});
  if(choice.canceled)return null;
  const file=choice.filePaths[0];if(fs.statSync(file).size>20_000_000)throw new Error('Файл резервной копии слишком большой');
  const backup=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!backup.portfolio?.name||!Array.isArray(backup.positions)||backup.positions.length>10000)throw new Error('Неверный формат резервной копии');
  const id=crypto.randomUUID();
  store.upsertPortfolio({id,name:`${String(backup.portfolio.name).slice(0,80)} (импорт)`,base:backup.portfolio.base});
  store.putPositions(id,backup.positions.map(p=>normalizePosition({...p,id:crypto.randomUUID()})));
  return {id,state:snapshot()};
});
