export const config = { runtime: 'edge', maxDuration: 30 };

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
const CG_KEY  = process.env.COINGECKO_API_KEY || '';
const CACHE_TTL = 30 * 60 * 1000;
const _cache = {};

async function sf(url, t) {
  t = t || 8000;
  var ctrl = new AbortController();
  var id = setTimeout(function() { ctrl.abort(); }, t);
  try {
    var hdrs = (url.indexOf('coingecko') >= 0 && CG_KEY) ? { 'x-cg-demo-api-key': CG_KEY } : {};
    var r = await fetch(url, { signal: ctrl.signal, headers: hdrs });
    clearTimeout(id);
    return r.ok ? await r.json() : null;
  } catch(e) { clearTimeout(id); return null; }
}

var COIN_KWS = {
  'bitcoin':['bitcoin','btc'],'ethereum':['ethereum','eth'],'solana':['solana','sol'],
  'ripple':['ripple','xrp'],'dogecoin':['dogecoin','doge'],'cardano':['cardano','ada'],
  'avalanche-2':['avalanche','avax'],'polkadot':['polkadot','dot'],'chainlink':['chainlink','link'],
  'matic-network':['polygon','matic'],'near':['near protocol','near'],'aptos':['aptos','apt'],
  'arbitrum':['arbitrum','arb'],'cosmos':['cosmos','atom'],'shiba-inu':['shiba','shib'],
};

function fmtN(n) {
  if (!n) return 'N/A';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(2);
}

async function getCtx(coinId) {
  var ck = 'ctx_' + coinId;
  if (_cache[ck] && Date.now() - _cache[ck].ts < CACHE_TTL) return _cache[ck].data;
  var results = await Promise.all([
    sf('https://api.coingecko.com/api/v3/coins/' + coinId + '?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'),
    sf('https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + ',bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true'),
    sf('https://api.coingecko.com/api/v3/global'),
    fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];}),
  ]);
  var detail=results[0], price=results[1], gData=results[2], news=results[3];
  var m=(detail&&detail.market_data)?detail.market_data:{};
  var p=(price&&price[coinId])?price[coinId]:{};
  var g=(gData&&gData.data)?gData.data:{};
  var kws=COIN_KWS[coinId]||[(detail&&detail.name?detail.name.toLowerCase():coinId)];
  var coinNews=Array.isArray(news)?news.filter(function(n){var t=((n.headline||'')+(n.summary||'')).toLowerCase();return kws.some(function(k){return t.indexOf(k)>=0;});}).slice(0,5):[];
  var macroNews=Array.isArray(news)?news.filter(function(n){return coinNews.indexOf(n)<0;}).slice(0,4):[];
  var ctx={
    name:(detail&&detail.name)||coinId, sym:(detail&&detail.symbol)?detail.symbol.toUpperCase():coinId.toUpperCase(),
    price:p.usd||(m.current_price&&m.current_price.usd)||0,
    chg24:p.usd_24h_change||m.price_change_percentage_24h||0,
    chg7:m.price_change_percentage_7d||0, chg30:m.price_change_percentage_30d||0,
    mktCap:p.usd_market_cap||(m.market_cap&&m.market_cap.usd)||0,
    fdv:(m.fully_diluted_valuation&&m.fully_diluted_valuation.usd)||0,
    vol24:p.usd_24h_vol||(m.total_volume&&m.total_volume.usd)||0,
    circ:m.circulating_supply||0, maxSup:m.max_supply||null,
    ath:(m.ath&&m.ath.usd)||0, athChg:(m.ath_change_percentage&&m.ath_change_percentage.usd)||0,
    sentUp:(detail&&detail.sentiment_votes_up_percentage)||0,
    rank:(detail&&detail.market_cap_rank)||'?',
    btcDom:(g.market_cap_percentage&&g.market_cap_percentage.btc)?g.market_cap_percentage.btc.toFixed(1):'?',
    totalMkt:(g.total_market_cap&&g.total_market_cap.usd)||0,
    mktChg:g.market_cap_change_percentage_24h_usd?g.market_cap_change_percentage_24h_usd.toFixed(2):'?',
    fmtN:fmtN, coinNews:coinNews, macroNews:macroNews,
  };
  _cache[ck]={ts:Date.now(),data:ctx};
  return ctx;
}

function buildData(c) {
  var parts=[
    c.name+' ('+c.sym+') | $'+c.price.toLocaleString()+' | 24h: '+c.chg24.toFixed(2)+'% | 7D: '+c.chg7.toFixed(2)+'% | 30D: '+c.chg30.toFixed(2)+'%',
    'Mkt Cap: '+fmtN(c.mktCap)+' | FDV: '+fmtN(c.fdv)+' | Rank: #'+c.rank+' | Vol: '+fmtN(c.vol24),
    'Supply: '+(c.circ?c.circ.toLocaleString():'N/A')+' / '+(c.maxSup?c.maxSup.toLocaleString():'Unlimited')+' | ATH: $'+c.ath.toLocaleString()+' ('+c.athChg.toFixed(1)+'% away)',
    'Sentiment: '+c.sentUp.toFixed(0)+'% bullish | BTC Dom: '+c.btcDom+'% | Total Mkt: '+fmtN(c.totalMkt)+' ('+c.mktChg+'% 24h)',
  ];
  if(c.coinNews.length>0){parts.push('COIN NEWS:');c.coinNews.forEach(function(n,i){parts.push((i+1)+'. '+n.headline);});}
  else{parts.push('No recent coin news.');}
  parts.push('MACRO NEWS:');
  c.macroNews.forEach(function(n,i){parts.push((i+1)+'. '+n.headline);});
  return parts.join('\n');
}

async function haiku(prompt, maxTok) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:maxTok,stream:true,messages:[{role:'user',content:prompt}]}),
  });
}

async function collectSSE(resp) {
  var reader=resp.body.getReader(); var dec=new TextDecoder(); var out=''; var buf='';
  while(true){
    var res=await reader.read(); if(res.done)break;
    buf+=dec.decode(res.value,{stream:true});
    var lines=buf.split('\n'); buf=lines.pop()||'';
    for(var i=0;i<lines.length;i++){
      var ln=lines[i].trim();
      if(ln.indexOf('data:')!==0)continue;
      var dd=ln.slice(5).trim(); if(dd==='[DONE]')continue;
      try{var p=JSON.parse(dd);out+=(p.delta&&p.delta.text)||'';}catch(e){}
    }
  }
  return out;
}

export default async function handler(req) {
  if(req.method==='OPTIONS')return new Response(null,{headers:CORS});
  var params=new URL(req.url).searchParams;
  var coinId=(params.get('id')||'').toLowerCase();
  var mode=params.get('mode')||'summary';

  // MARKET TEASE
  if(mode==='market'){
    var mk='market_tease';
    if(_cache[mk]&&Date.now()-_cache[mk].ts<CACHE_TTL){
      var ct=_cache[mk].text;
      if(ct&&ct.length>80&&/^[A-Z]/.test(ct.trim())&&/[.!?]$/.test(ct.trim()))
        return new Response(ct,{headers:{...CORS,'Content-Type':'text/plain','X-Cache':'HIT'}});
    }
    var gData=await sf('https://api.coingecko.com/api/v3/global');
    var cNews=await fetch('https://finnhub.io/api/v1/news?category=crypto&token='+FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];});
    var g=(gData&&gData.data)?gData.data:{};
    var btcD=(g.market_cap_percentage&&g.market_cap_percentage.btc)?g.market_cap_percentage.btc.toFixed(1):'?';
    var totM=(g.total_market_cap&&g.total_market_cap.usd)||0;
    var mChg=g.market_cap_change_percentage_24h_usd?g.market_cap_change_percentage_24h_usd.toFixed(2):'?';
    var hdls=Array.isArray(cNews)?cNews.slice(0,6).map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n'):'No news.';
    function fmtB(n){if(!n)return 'N/A';if(n>=1e12)return '$'+(n/1e12).toFixed(2)+'T';if(n>=1e9)return '$'+(n/1e9).toFixed(2)+'B';return '$'+n.toFixed(0);}
    var mp='You are CryptikrAI. Write exactly 3 complete sentences as an institutional crypto market briefing. Plain prose only — no headers, no bullets, no markdown. Every sentence must be complete and end with a period.\n\nData: Total Market Cap: '+fmtB(totM)+' ('+mChg+'% 24h) | BTC Dominance: '+btcD+'% | Active Coins: '+(g.active_cryptocurrencies||'?')+'\nTop News:\n'+hdls+'\n\nSentence 1: Market state with specific dollar figures and percentages. Sentence 2: Most important catalyst from the news and its implication. Sentence 3: What institutional investors should watch right now. All three sentences must be complete.';
    var mr=await haiku(mp,250);
    if(!mr.ok)return new Response('Market unavailable',{status:500,headers:CORS});
    var mt=await collectSSE(mr);
    if(mt&&mt.length>50)_cache[mk]={ts:Date.now(),text:mt};
    return new Response(mt,{headers:{...CORS,'Content-Type':'text/plain'}});
  }

  // COIN SUMMARY
  if(mode==='summary'&&coinId&&ANTHROPIC_KEY){
    var sk='summary_'+coinId;
    if(_cache[sk]&&Date.now()-_cache[sk].ts<CACHE_TTL){
      var sc=_cache[sk].text;
      if(sc&&sc.length>40)return new Response(sc,{headers:{...CORS,'Content-Type':'text/plain','X-Cache':'HIT'}});
    }
    var c=await getCtx(coinId);
    var sp='You are CryptikrAI. Write exactly 2 complete sentences summarizing '+c.name+' ('+c.sym+') for institutional investors. Plain prose, no markdown, no incomplete sentences.\n\n'+buildData(c)+'\n\nSentence 1: Price action and momentum with specific numbers. Sentence 2: The single most important catalyst or risk right now. Both sentences must be complete and end with a period.';
    var sr=await haiku(sp,150);
    if(!sr.ok)return new Response('Summary unavailable',{status:500,headers:CORS});
    var st=await collectSSE(sr);
    if(st&&st.length>20)_cache[sk]={ts:Date.now(),text:st};
    return new Response(st,{headers:{...CORS,'Content-Type':'text/plain'}});
  }

  // DEEP DIVE — redirect to serverless endpoint
  if(mode==='deep'||mode==='market-deep'){
    // Forward to the serverless deep dive endpoint
    var fwdUrl='https://cryptikr.vercel.app/api/deepdive-deep?mode='+mode+'&id='+encodeURIComponent(coinId);
    var fwd=await fetch(fwdUrl,{headers:{'Content-Type':'application/json'}});
    if(!fwd.ok)return new Response('Deep dive failed',{status:500,headers:CORS});
    return new Response(fwd.body,{headers:{'Content-Type':'text/event-stream','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  }

  return new Response('Invalid mode',{status:400,headers:CORS});
}
