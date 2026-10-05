function clean(value) {
  return String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
}

function exchangeName(value) {
  const raw=String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/^[+*]/,'').trim();
  return clean(raw.replace(/^i(?=[а-я])/u,'').replace(/\s+(?:ао|ап|пао|оао)$/u,''));
}

function exactCandidate(position,candidates) {
  const key=clean(position.isin||position.ticker||position.name);
  if(!key)return null;
  const exact=candidates.filter(x=>[x.isin,x.ticker].some(v=>clean(v)===key)||[x.name,x.shortname].some(v=>exchangeName(v)===key));
  const preferred=position.currency==='RUB'?exact.filter(x=>x.provider==='moex'):exact;
  let pool=preferred.length?preferred:exact;
  if(position.type&&position.type!=='unknown')pool=pool.filter(x=>x.type===position.type);
  const queryPreferred=/(?:-п$|(?:^|\s)ап(?:\s|$)|привилег)/iu.test(position.name||'');
  const isPreferred=x=>/(?:^|\s)ап(?:\s|$)|привилег|[- ]п(?:\s|$)/iu.test(`${x.name} ${x.shortname}`);
  if(!queryPreferred&&!position.ticker&&!position.isin)pool=pool.filter(x=>!isPreferred(x));
  if(pool.some(x=>x.provider==='moex'&&x.isTraded))pool=pool.filter(x=>x.provider==='moex'&&x.isTraded);
  const unique=[...new Map(pool.map(x=>[`${x.provider}:${x.providerId}`,x])).values()];
  if(unique.length===1)return unique[0];
  const listedStock=unique.filter(x=>x.provider==='moex'&&x.type==='stock'&&!/^RU[A-Z0-9]{10}$/i.test(x.providerId));
  if(listedStock.length===1&&unique.every(x=>x.provider==='moex'&&x.type==='stock'))return listedStock[0];
  if(position.currency!=='RUB')return null;
  const bondKey=value=>clean(value).replace(/[p]/g,'р').replace(/[n]/g,'п').replace(/[o]/g,'о').replace(/[c]/g,'с').replace(/[k]/g,'к');
  const input=bondKey(position.name);
  const bonds=candidates.filter(x=>x.provider==='moex'&&x.type==='bond');
  const full=bonds.filter(x=>bondKey(x.name)===input);
  if(full.length===1)return full[0];
  // Broker captions sometimes abbreviate the issuer, while the issue suffix stays exact.
  const suffix=input.match(/(?:бо)?п?\d{2}$/u)?.[0];
  if(suffix){
    const issuer=input.replace(/(?:бо)?п?\d{2}$/u,'');
    const near=bonds.filter(x=>{
      const name=bondKey(x.name),short=bondKey(x.shortname);
      const sameIssue=name.endsWith(suffix)||short.endsWith(suffix);
      const prefix=[name,short].some(v=>{let i=0;while(i<Math.min(issuer.length,v.length)&&issuer[i]===v[i])i++;return i>=Math.min(7,issuer.length);});
      return sameIssue&&prefix;
    });
    if(near.length===1)return near[0];
  }
  return null;
}

function providerTypeEvidence(position,candidates){
  if(position.currency!=='RUB')return null;
  const issuer=clean(position.name.replace(/\s+[^\s]*\d[^\s]*$/u,'')).replace(/[pkc]/g,ch=>({p:'р',k:'к',c:'с'})[ch]);
  const terms=issuer.match(/[а-яё]{3,}/gu)||[];
  const credible=candidates.filter(x=>x.provider==='moex'&&x.type!=='unknown'&&terms.some(term=>clean(x.name).includes(term)||clean(x.shortname).includes(term)));
  if(/(?:бо[-– ]?[пp]?\d|\d{3}[рp][-–]?\d?)/iu.test(position.name)&&credible.some(x=>x.type==='bond'))return 'bond';
  const types=[...new Set(credible.map(x=>x.type))];
  return types.length===1?types[0]:null;
}

module.exports={exactCandidate,providerTypeEvidence};
