const CURRENCY = { '₽':'RUB', 'руб':'RUB', 'руб.':'RUB', 'rub':'RUB', '$':'USD', 'usd':'USD', '€':'EUR', 'eur':'EUR', 'usdt':'USD' };

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let s = String(value).replace(/[\s\u00a0\u202f]/g, '').replace(/[^0-9,.-]/g, '');
  if (!s) return null;
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma > -1) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function screenshotAmount(raw, compact=false){
  let text=String(raw||'').trim();
  const multiplier=/млрд/i.test(text)?1e9:/млн/i.test(text)?1e6:1;
  text=text.replace(/\s*(?:млрд|млн)\.?\s*[₽РP?2]?$/i,'').replace(/\s*[₽РP]$/i,'');
  if(compact&&/\s2$/.test(text))text=text.replace(/\s2$/,'');
  else if(compact&&/\d2$/.test(text)&&!/[,.]\d{2}$/.test(text))text=text.slice(0,-1);
  else if(compact&&/\d[,.]02$/.test(text))text=text.slice(0,-1);
  const value=number(text);
  return value===null?null:value*multiplier;
}

function screenshotQuantity(value){
  const text=String(value||'').trim();
  if(/^\d{1,3},\d{3}$/.test(text))return Number(text.replace(',',''));
  if(/^\d{1,4}(?:[ .\u00a0\u202f]\d{3})+$/.test(text))return Number(text.replace(/[ .\u00a0\u202f]/g,''));
  return number(text);
}

function classify(name, ticker, isin) {
  // OCR cannot establish the instrument class; a provider record or user must confirm it.
  return 'unknown';
}

function currency(text, fallback = 'RUB') {
  const s = String(text).toLowerCase();
  for (const [key, value] of Object.entries(CURRENCY)) if (s.includes(key)) return value;
  const iso=new Set(Intl.supportedValuesOf('currency'));
  const code=String(text).toUpperCase().match(/\b[A-Z]{3}\b/g)?.find(x=>iso.has(x));
  if(code)return code;
  return fallback;
}

function parseLines(lines) {
  const positions = [];
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line || /^(итого|всего|портфель|активы|баланс|сумма|total|assets)/i.test(line)) continue;
    const tokens = line.split(/\s{2,}|\t|\s+\|\s+/).map(x => x.trim()).filter(Boolean);
    const identifiers = line.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/g) || [];
    const tickerMatch = line.match(/(?:^|\s|\()([A-Z]{2,6})(?:\s|\)|$)/);
    const isin = identifiers[0] || '';
    const ticker = tickerMatch && !['RUB','USD','EUR','ETF'].includes(tickerMatch[1]) ? tickerMatch[1] : '';
    const numberMatches=[...line.matchAll(/(?:^|\s)(-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[,.]\d+)?|-?\d+(?:[,.]\d+)?)(?=\s|$)/g)];
    const values = numberMatches.map(x=>number(x[1])).filter(x=>x!==null);
    if (!ticker && !isin && values.length < 2) continue;
    const firstValue=numberMatches.length>1?numberMatches[numberMatches.length-2]:numberMatches[0];
    const name = (firstValue?line.slice(0,firstValue.index):tokens[0]||line).replace(isin, '').replace(/\b[A-Z]{2,6}\b/g, '').trim() || ticker || isin;
    if (!name && !ticker) continue;
    const qty = values.length > 1 ? values[values.length - 2] : null;
    const value = values.length > 1 ? values[values.length - 1] : values[0] ?? null;
    positions.push({ id: crypto.randomUUID(), name, ticker, isin, type: 'unknown', quantity: qty, price: qty && value ? value / qty : null, enteredValue: value, currency: currency(line), sourceText: line, confidence: 'low' });
  }
  return positions;
}

function parseScreenshot(lines) {
  if (!Array.isArray(lines) || !lines.some(line => line.words?.length)) return [];
  const ordered=lines.filter(line=>line.words?.length).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  const allWords=ordered.flatMap(line=>line.words);
  const minX=Math.min(...allWords.map(w=>w.bbox.x0));
  const maxX=Math.max(...allWords.map(w=>w.bbox.x1));
  const width=maxX-minX;
  const candidates=[];
  for(const line of ordered) {
    const words=line.words;
    if(words.some(w=>/%/.test(w.text))) continue;
    const right=words.filter(w=>w.bbox.x0>minX+width*.68).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const compact=!!line.nameOverride;
    if(!right.length&&!line.amountOverride)continue;
    if(!line.amountOverride&&!/[₽РP]/i.test(right.at(-1).text))continue;
    const left=words.filter(w=>w.bbox.x0>(minX<100?minX+width*.12:minX-1) && w.bbox.x1<(right[0]?.bbox.x0||minX+width*.7)-8 && !/^[^\p{L}\d]+$/u.test(w.text));
    if(!left.length&&!line.nameOverride) continue;
    const originalName=left.map(w=>w.text).join(' ').trim();
    const originalCyrillic=(originalName.match(/[А-Яа-яЁё]/g)||[]).length;
    const name=(line.nameOverride&&(originalCyrillic<3||!originalName||line.nameOverride.length>originalName.length+5)&&line.nameOverride.length>=originalName.length?line.nameOverride:originalName).trim();
    if(!/\p{L}/u.test(name) || /^(главная|итого|портфель|показать|сгорит)/i.test(name)) continue;
    const raw=right.map(w=>w.text).join(' ');
    if(!/^-?\s*\d/.test(raw)&&!line.amountOverride) continue;
    const hasCurrency=/[₽РP]/i.test(raw);
    const originalValid=hasCurrency||/млн|млрд/i.test(raw)||compact&&/(?:^|\s)2$/.test(raw)||compact&&/\d2$/.test(raw);
    let amount=originalValid?screenshotAmount(raw.replace(/(\d)\/(\d)/g,'$1,$2'),compact&&!hasCurrency&&!/млн|млрд/i.test(raw)):screenshotAmount(line.amountOverride);
    if(amount===null&&line.amountOverride)amount=screenshotAmount(line.amountOverride);
    if(amount===null) continue;
    const rightEdge=right[0]?.bbox.x0||minX+width*.7;
    const next=ordered.find(other=>other.bbox.y0>line.bbox.y0 && other.bbox.y0-line.bbox.y0<52 && other.words.some(w=>w.bbox.x0<rightEdge-8 && /(?:шт|wt|wr)/i.test(w.text)));
    const expiry=ordered.find(other=>other.bbox.y0>line.bbox.y0 && other.bbox.y0-line.bbox.y0<52 && /через\s+\d+\s+месяц/i.test(other.text));
    const detail=(compact&&line.detailOverride)||next?.words.filter(w=>w.bbox.x0<rightEdge-8).map(w=>w.text).join(' ') || next?.detailOverride || line.detailOverride || '';
    const qtyMatch=detail.match(/(\d{1,4}(?:[ .\u00a0\u202f]\d{3})+|\d+(?:[,.]\d+)?)\s*(?:шт|wt|wr)/i);
    const quantity=qtyMatch?screenshotQuantity(qtyMatch[1]):null;
    const priceMatch=detail.match(/(?:шт|wt|wr)[.\-–·]?\s*[-–·]?\s*(-?\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?)/i);
    let price=!compact&&priceMatch?Math.abs(number(priceMatch[1])):null;
    // A bond's current value can differ from quantity × displayed price (accrued interest).
    // Repair only an obvious decimal-place OCR error in the amount, never a general mismatch.
    if(quantity && price && amount>0){const ratio=amount/(quantity*price);if([10,100,0.1,0.01].some(power=>Math.abs(ratio-power)/power<.005))amount=quantity*price;}
    if(quantity && price && amount>0 && (amount/(quantity*price)<.7 || amount/(quantity*price)>1.3))price=null;
    const cashName=new Intl.DisplayNames(['ru'],{type:'currency'}).of('RUB').toLocaleLowerCase('ru-RU');
    const type=[cashName,cashName.split(/\s+/).at(-1)].includes(name.toLocaleLowerCase('ru-RU'))?'cash':(ordered.some(other=>other.bbox.y0<line.bbox.y0&&line.bbox.y0-other.bbox.y0<180&&/^фонды$/i.test(other.text.trim()))?'fund':'unknown');
    if(/^[A-Z]{3}$/.test(name)&&candidates.at(-1)?.type==='cash'&&Math.abs((candidates.at(-1)?.enteredValue||0)-amount)<.01&&line.bbox.y0-candidates.at(-1).screenY<70)continue;
    candidates.push({id:crypto.randomUUID(),name,ticker:'',isin:'',type,quantity,price,enteredValue:amount,currency:'RUB',timeLimited:!!expiry,sourceText:`${line.text.trim()}${detail?' | '+detail:''}${expiry?' | '+expiry.text.trim():''}`,confidence:'low',screenY:line.bbox.y0});
  }
  return candidates;
}

function normalizePosition(p) {
  return { id: String(p.id || crypto.randomUUID()), name: String(p.name || '').trim().slice(0,160), ticker: String(p.ticker || '').trim().toUpperCase().slice(0,30), isin: String(p.isin || '').trim().toUpperCase().slice(0,20), type: ['crypto','stock','bond','fund','cash','unknown'].includes(p.type) ? p.type : 'unknown', quantity: number(p.quantity), price: number(p.price), enteredValue: number(p.enteredValue), currency: /^[A-Z]{3}$/.test(String(p.currency||'').toUpperCase()) ? String(p.currency).toUpperCase() : 'RUB', timeLimited: !!p.timeLimited, sourceText: String(p.sourceText || '').slice(0,500), confidence: p.confidence || 'manual', provider: String(p.provider || ''), providerId: String(p.providerId || ''), quote: p.quote || null };
}

function assess(positions, fx = {RUB:1,USD:1,EUR:1}, base = 'RUB') {
  const rows = positions.map(p => {
    const useQuote=p.quote?.price!=null && p.quantity!=null && !p.quote.priceIsPercentOfFace;
    const hasSnapshot=p.enteredValue!=null;
    const nativeValue = hasSnapshot?p.enteredValue:(useQuote ? p.quantity*p.quote.price : ((p.quantity != null && p.price != null) ? p.quantity * p.price : null));
    const valueCurrency=hasSnapshot?p.currency:(useQuote?(p.quote.currency||p.currency):p.currency);
    const rate = fx[valueCurrency] && fx[base] ? fx[valueCurrency] / fx[base] : null;
    const baseValue = nativeValue != null && rate != null ? nativeValue * rate : null;
    return {...p, nativeValue, valueCurrency, baseValue};
  });
  const total = rows.reduce((sum,p) => sum + (p.baseValue || 0), 0);
  return { total, base, valued: rows.filter(p => p.baseValue != null).length, count: rows.length, rows: rows.map(p => ({...p, weight: p.baseValue != null && total > 0 ? 100 * p.baseValue / total : null})) };
}

module.exports = { number, classify, currency, parseLines, parseScreenshot, normalizePosition, assess };
