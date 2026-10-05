function historyMetrics(candles){
  const rows=(candles||[]).filter(x=>Number.isFinite(Number(x.close))&&Number(x.close)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(rows.length<15)return null;
  const prices=rows.map(x=>Number(x.close));
  let peak=prices[0],maxDrawdown=0,maxDailyMove=0;
  for(let i=0;i<prices.length;i++){
    peak=Math.max(peak,prices[i]);maxDrawdown=Math.max(maxDrawdown,(peak-prices[i])/peak*100);
    if(i)maxDailyMove=Math.max(maxDailyMove,Math.abs(prices[i]/prices[i-1]-1)*100);
  }
  return {days:rows.length,from:rows[0].date,to:rows.at(-1).date,change:(prices.at(-1)/prices[0]-1)*100,maxDrawdown,maxDailyMove,prices};
}

function riskProfile(position,history){
  const signals=[],facts=[],limitations=[];
  if(position.weight>30)signals.push(`Концентрация в портфеле: ${position.weight.toFixed(1)}% оценённой части`);
  if(!position.provider)limitations.push('Точный выпуск не подтверждён; рыночные и кредитные показатели этого выпуска не рассчитаны.');
  const metrics=historyMetrics(history?.candles);
  if(metrics){
    facts.push(`История торгов ${metrics.from} — ${metrics.to}: изменение ${metrics.change.toFixed(1)}%, максимальная просадка ${metrics.maxDrawdown.toFixed(1)}%`);
    if(position.nativeValue>0&&metrics.maxDrawdown>0)facts.push(`Сценарий повторения такой просадки для текущей стоимости: −${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(position.nativeValue*metrics.maxDrawdown/100)} ${position.valueCurrency||position.currency||'RUB'} (не прогноз)`);
    if(metrics.maxDrawdown>=20)signals.push(`Просадка за наблюдаемый период ${metrics.maxDrawdown.toFixed(1)}%`);
    if(metrics.maxDailyMove>=10)signals.push(`Наибольшее дневное движение ${metrics.maxDailyMove.toFixed(1)}%`);
  } else if(position.provider)limitations.push('Для оценки динамики нужно не менее 15 торговых дней с ценой закрытия.');
  if(position.type==='bond'){
    const q=position.quote||{};
    if(q.maturity)facts.push(`Погашение: ${q.maturity}`);
    if(q.couponPercent!=null)facts.push(`Купон: ${q.couponPercent}% годовых по карточке MOEX`);
    if(q.priceIsPercentOfFace&&q.price!=null){facts.push(`Цена: ${q.price}% от номинала`);if(q.price<80)signals.push('Цена ниже 80% номинала; необходима проверка причины и кредитного качества эмитента.');}
    limitations.push('Кредитный риск нельзя определить только по графику. Рейтинг выпуска или эмитента, гарантии и условия оферты требуют проверки в первичных источниках.');
  }
  if(position.type==='stock')limitations.push('Доля акционеров, долговая нагрузка и прогнозы аналитиков не подтверждены доступными структурированными данными.');
  if(position.type==='fund')limitations.push('График цены пая не раскрывает состав фонда, СЧА, комиссии и риски базовых активов; эти сведения требуют документов управляющей компании.');
  if(['stock','bond'].includes(position.type))limitations.push('Опубликованный прогноз цены или кредитного рейтинга для этой бумаги не получен; исторический сценарий не предсказывает будущее.');
  if(['bond','stock'].includes(position.type))limitations.push('Участие банков, поручителей и акционеров не установлено; их поддержка не предполагается без раскрытия эмитента.');
  return {signals,facts,limitations,chart:metrics?{prices:metrics.prices,from:metrics.from,to:metrics.to}:null,source:history?.source||null,asOf:history?.asOf||null};
}

module.exports={historyMetrics,riskProfile};
