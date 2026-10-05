const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('editing a confirmed instrument invalidates its quote and identity',()=>{
  const handlers={};
  const elements={};
  const document={
    addEventListener:(name,fn)=>{handlers[name]=fn},
    querySelectorAll:()=>[],
    getElementById:id=>elements[id]??=( {style:{}} )
  };
  const api={state:()=>new Promise(()=>{}),on:()=>{}};
  const context=vm.createContext({window:{portfolio:api},document,console,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout:()=>{},Intl});
  const script=fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8');
  vm.runInContext(`${script}\nS.draft=[{name:'Сбербанк',ticker:'SBER',isin:'',type:'stock',provider:'moex',providerId:'SBER',quote:{source:'MOEX ISS',price:100}}]`,context);
  const target={dataset:{field:'name'},value:'Газпром',closest:()=>({dataset:{index:'0'}})};
  handlers.input({target});
  const result=vm.runInContext('S.draft[0]',context);
  assert.equal(result.name,'Газпром');
  assert.equal(result.provider,'');
  assert.equal(result.providerId,'');
  assert.equal(result.quote,null);
  vm.runInContext("Object.assign(S.draft[0],{type:'stock',provider:'moex',providerId:'SBER',quote:{price:100}})",context);
  handlers.change({target:{dataset:{field:'type'},value:'fund',closest:()=>({dataset:{index:'0'}})}});
  assert.equal(vm.runInContext('S.draft[0].provider',context),'');
  assert.equal(vm.runInContext('S.draft[0].quote',context),null);
});

test('saving edited positions discards the previous analysis',async()=>{
  const handlers={};
  const elements={};
  const document={addEventListener:(name,fn)=>{handlers[name]=fn},querySelectorAll:()=>[],getElementById:id=>elements[id]??=({style:{}})};
  const state={portfolios:[{id:'default',name:'Портфель',base:'RUB'}],positions:[],settings:{}};
  const api={state:()=>new Promise(()=>{}),savePositions:async(_,rows)=>({...state,positions:rows}),on:()=>{}};
  const context=vm.createContext({window:{portfolio:api},document,console,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout:()=>{},Intl});
  vm.runInContext(`${fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8')}\nS.data=${JSON.stringify(state)};S.report={date:'old'};S.draft=[{id:'one',name:'Газпром',enteredValue:100}];render=()=>{}`,context);
  await handlers.click({target:{closest:()=>({dataset:{action:'save-draft'}})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('S.report',context),null);
});

test('overview percentages use all positive holdings, including those outside top seven',()=>{
  const document={addEventListener:()=>{},querySelectorAll:()=>[],getElementById:()=>({style:{}})};
  const api={state:()=>new Promise(()=>{}),on:()=>{}};
  const context=vm.createContext({window:{portfolio:api},document,console,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout:()=>{},Intl});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/ui/renderer.js'),'utf8'),context);
  const state={portfolios:[{id:'default',base:'RUB'}],positions:Array.from({length:8},(_,i)=>({portfolioId:'default',id:String(i),name:`Актив ${i}`,currency:'RUB',enteredValue:100,type:'stock'})),settings:{}};
  vm.runInContext(`S.data=${JSON.stringify(state)};S.fx={rates:{RUB:1}}`,context);
  const html=vm.runInContext('overview()',context);
  assert.equal((html.match(/12,5%/g)||[]).length,7);
});
