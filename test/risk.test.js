const test=require('node:test');
const assert=require('node:assert/strict');
const {historyMetrics,riskProfile}=require('../src/risk');

test('history metrics use observed closes and identify drawdown',()=>{
 const rows=Array.from({length:20},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,close:i<10?100:75}));
 const result=historyMetrics(rows);
 assert.equal(result.days,20);
 assert.equal(result.change,-25);
 assert.equal(result.maxDrawdown,25);
 assert.equal(result.maxDailyMove,25);
});

test('risk report never claims a rating, shareholder or guarantee from price history',()=>{
 const rows=Array.from({length:20},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,close:90-i*.5}));
 const risk=riskProfile({name:'Example',type:'bond',provider:'moex',weight:35,quote:{price:75,priceIsPercentOfFace:true,maturity:'2027-12-05'}},{candles:rows,source:'https://iss.moex.com/example'});
 assert.ok(risk.signals.some(x=>x.includes('Концентрация')));
 assert.ok(risk.signals.some(x=>x.includes('80%')));
 assert.ok(risk.limitations.some(x=>x.includes('Рейтинг')));
 assert.ok(risk.limitations.some(x=>x.includes('акционеров')));
 assert.equal(risk.chart.prices.length,20);
});

test('unmatched bond has no invented market trend',()=>{
 const risk=riskProfile({name:'Unknown',type:'bond',weight:2},null);
 assert.equal(risk.chart,null);
 assert.ok(risk.limitations.some(x=>x.includes('Точный выпуск не подтверждён')));
});

test('fund risk uses observed price history without inferring its holdings',()=>{
 const rows=Array.from({length:20},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,close:100+i}));
 const risk=riskProfile({name:'Фонд',type:'fund',provider:'moex',weight:20}, {candles:rows,source:'MOEX'});
 assert.equal(risk.chart.prices.length,20);
 assert.ok(risk.limitations.some(x=>x.includes('состав фонда')));
});
