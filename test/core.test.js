const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {number,normalizePosition,assess,parseLines,parseScreenshot}=require('../src/core');

test('screenshot layout keeps holdings and ignores profit and expiry rows',()=>{
  const line=(text,y,words)=>({text,bbox:{x0:130,y0:y,x1:530,y1:y+20},words:words.map(([value,x0,x1])=>({text:value,bbox:{x0,y0:y,x1,y1:y+20}}))});
  const rows=[
    line('Главная',10,[['Главная',25,120]]),
    line('Генетико 2309,76 Р',100,[['Генетико',140,225],['2309,76',420,508],['Р',514,529]]),
    line('60 шт. - 38,496 Р +286 Р 14,13%',129,[['60',139,156],['шт.',163,182],['-',191,198],['38,496',203,252],['Р',258,268],['+286',404,442],['14,13%',474,528]]),
    line('МКБ 6,854 Р',220,[['МКБ',140,181],['6,854',452,508],['Р',514,529]]),
    line('Сгорит через 1 месяц -0,39 Р 5,33%',249,[['Сгорит',139,192],['через',198,241],['1',248,253],['месяц',262,309],['-0,39',412,452],['Р',458,477],['5,33%',484,528]])
  ];
  const positions=parseScreenshot(rows);
  assert.equal(positions.length,2);
  assert.deepEqual(positions.map(p=>[p.name,p.quantity,p.enteredValue]),[['Генетико',60,2309.76],['МКБ',null,6.854]]);
  assert.equal(positions[1].timeLimited,true);
});

test('long Russian bond names retain issue codes and screenshot values',()=>{
  const line=(y,parts)=>({text:parts.map(x=>x[0]).join(' '),bbox:{x0:38,y0:y,x1:712,y1:y+30},words:parts.map(([value,x0,x1])=>({text:value,bbox:{x0,y0:y,x1,y1:y+30}}))});
  const positions=parseScreenshot([
    line(462,[['Сибирский',144,314],['КХП',325,387],['001Р-',399,485],['41440',587,684],['Р',695,712]]),
    line(503,[['40',144,170],['шт-1',181,239],['033,7',251,311],['2',322,333],['—610Р.',545,621],['1,45%',645,710]])
  ]);
  assert.equal(positions.length,1);
  assert.equal(positions[0].name,'Сибирский КХП 001Р-');
  assert.equal(positions[0].quantity,40);
  assert.equal(positions[0].price,1033.7);
  assert.equal(positions[0].enteredValue,41440);
});
const Store=require('../src/store');

test('Russian and international decimal formats retain their value',()=>{
  assert.equal(number('1 234,56'),1234.56);
  assert.equal(number('1,234.56'),1234.56);
});

test('a screenshot line remains unconfirmed until matched to a provider',()=>{
  const [p]=parseLines(['Газпром  GAZP  10  1 500,00']);
  assert.equal(p.type,'unknown');
  assert.equal(p.provider,undefined);
  assert.equal(p.name,'Газпром');
  assert.equal(p.quantity,10);
  assert.equal(p.enteredValue,1500);
});

test('digits in a bond name are not interpreted as the quantity',()=>{
  const [p]=parseLines(['ОФЗ 26230 5 4500']);
  assert.equal(p.name,'ОФЗ 26230');
  assert.equal(p.quantity,5);
});

test('coverage and weights exclude unvalued positions',()=>{
  const p=[normalizePosition({name:'A',enteredValue:75,currency:'RUB'}),normalizePosition({name:'B',enteredValue:25,currency:'RUB'}),normalizePosition({name:'C',currency:'RUB'})];
  const result=assess(p,{RUB:1},'RUB');
  assert.equal(result.total,100);assert.equal(result.valued,2);assert.equal(result.rows[0].weight,75);assert.equal(result.rows[2].weight,null);
});

test('new market quotes do not overwrite values imported from a screenshot',()=>{
  const p=normalizePosition({name:'Sample',quantity:60,enteredValue:2309.76,currency:'RUB',quote:{price:14.69,currency:'RUB'}});
  const result=assess([p],{RUB:1},'RUB');
  assert.equal(result.total,2309.76);
  assert.equal(result.rows[0].nativeValue,2309.76);
});

test('SQLite persists confirmed provider identity and positions',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-lens-'));
  try {
    const a=new Store();await a.init(dir);
    const p=normalizePosition({id:'1',name:'Sample',provider:'moex',providerId:'SAMPLE',type:'stock',enteredValue:100});
    a.putPositions('default',[p]);
    const b=new Store();await b.init(dir);
    assert.equal(b.all().positions[0].providerId,'SAMPLE');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
