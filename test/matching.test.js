const test=require('node:test');
const assert=require('node:assert/strict');
const {exactCandidate,providerTypeEvidence}=require('../src/matching');

test('only a unique exact provider match is accepted',()=>{
  const moex={provider:'moex',providerId:'SAMPLE',name:'Пример',ticker:'SAMPLE',type:'stock'};
  const crypto={provider:'coingecko',providerId:'example',name:'Пример',ticker:'EX',type:'crypto'};
  assert.equal(exactCandidate({name:'Пример',currency:'RUB'},[crypto,moex]),moex);
  assert.equal(exactCandidate({name:'Примeр',currency:'RUB'},[moex]),null);
  assert.equal(exactCandidate({name:'Пример',currency:'USD'},[crypto,moex]),null);
  assert.equal(exactCandidate({name:'Дорофлот',currency:'RUB'},[moex]),null);
});

test('MOEX bond evidence classifies a truncated issue without inventing an ISIN',()=>{
 const candidates=[{provider:'moex',providerId:'RU1',name:'СибАвтоТранс 001Р-03',type:'bond'}, {provider:'moex',providerId:'RU2',name:'СибАвтоТранс 001Р-04',type:'bond'}];
 const position={name:'СибАвтоТранс 001P',currency:'RUB'};
 assert.equal(exactCandidate(position,candidates),null);
 assert.equal(providerTypeEvidence(position,candidates),'bond');
});

test('MOEX issue suffix can disambiguate an abbreviated broker caption',()=>{
 const candidates=[{provider:'moex',providerId:'RU1',name:'Сибирское Стекло БО-П04',shortname:'СибСтекП04',type:'bond'},{provider:'moex',providerId:'RU2',name:'Сибирское Стекло БО-04',shortname:'СибСтекБ04',type:'bond'}];
 assert.equal(exactCandidate({name:'Сибстекло BO-N04',currency:'RUB'},candidates)?.providerId,'RU1');
});

test('active MOEX stock ticker wins over an old ISIN-only listing of the same name',()=>{
 const candidates=[{provider:'moex',providerId:'RU0008958863',name:'МосЭнерго',type:'stock'}, {provider:'moex',providerId:'MSNG',name:'МосЭнерго акции обыкн.',shortname:'+МосЭнерго',type:'stock'}];
 assert.equal(exactCandidate({name:'Мосэнерго',currency:'RUB'},candidates)?.providerId,'MSNG');
});

test('exchange display prefixes and legal-form suffixes do not prevent a match',()=>{
  for(const [query,label] of [['МКБ','МКБ ао'],['Мосэнерго','+МосЭнерго'],['Генетико','iГЕНЕТИКО'],['ЭсЭфАЙ','ЭсЭфАй ао']]) {
    assert.equal(exactCandidate({name:query,currency:'RUB'},[{provider:'moex',providerId:'T',name:label,ticker:'T',type:'stock'}])?.providerId,'T');
  }
});

test('active ordinary share is preferred to inactive listings and preferred shares',()=>{
 const rows=[
  {provider:'moex',providerId:'OLD',name:'Банк Санкт-Петербург',shortname:'Банк Санкт-Петербург',type:'stock',isTraded:false},
  {provider:'moex',providerId:'PREF',name:'Банк Санкт-Петербург привилегированные',shortname:'Банк Санкт-Петербург ап',type:'stock',isTraded:true},
  {provider:'moex',providerId:'ORD',name:'Банк Санкт-Петербург акции обыкновенные',shortname:'Банк Санкт-Петербург',type:'stock',isTraded:true}
 ];
 assert.equal(exactCandidate({name:'Банк Санкт-Петербург',currency:'RUB'},rows)?.providerId,'ORD');
 assert.equal(exactCandidate({name:'Банк Санкт-Петербург',currency:'RUB'},[rows[1]]),null);
});

test('fund evidence is kept separate from shares and exchange indexes',()=>{
 const rows=[{provider:'moex',providerId:'FUND',name:'БПИФ Ликвидность',type:'fund'}, {provider:'moex',providerId:'INDEX',name:'Ликвидность индекс',type:'unknown'}];
 assert.equal(exactCandidate({name:'Ликвидность',currency:'RUB',type:'fund'},rows),null);
 assert.equal(providerTypeEvidence({name:'Ликвидность',currency:'RUB'},rows),'fund');
});
