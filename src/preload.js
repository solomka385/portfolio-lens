const {contextBridge,ipcRenderer,webUtils}=require('electron');
const calls=['state','save-portfolio','save-positions','choose-images','recognize','parse-text','resolve','match-portfolio','market','analysis','models-status','install-model','settings','export','import-json'];
const api=Object.fromEntries(calls.map(k=>[k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),(...args)=>ipcRenderer.invoke(k,...args)]));
api.on=(channel,listener)=>{if(!['model-progress','market-progress','analysis-progress'].includes(channel))return; const wrapped=(_,value)=>listener(value);ipcRenderer.on(channel,wrapped);return ()=>ipcRenderer.removeListener(channel,wrapped);};
api.filePath=file=>webUtils.getPathForFile(file);
contextBridge.exposeInMainWorld('portfolio',api);
