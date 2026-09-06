const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
const CG_KEY  = process.env.COINGECKO_API_KEY || '';

async function sf(url) {
  try {
    var hdrs = (url.indexOf('coingecko') >= 0 && CG_KEY) ? { 'x-cg-demo-api-key': CG_KEY } : {};
    var r = await fetch(url, { headers: hdrs });
    return r.ok ? await r.json() : null;
  } catch(e) { return null; }
}

function fmtN(n) {
  if (!n) return 'N/A';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(2);
}

var COIN_KWS = {
  'bitcoin':['bitcoin','btc'],'ethereum':['ethereum','eth'],'solana':['solana','sol'],
  'ripple':['ripple','xrp'],'dogecoin':['dogecoin','doge'],'cardano':['cardano','ada'],
  'avalanche-2':['avalanche','avax'],'polkadot':['polkadot','dot'],'chainlink':['chainlink','link'],
  'near':['near protocol','near'],'aptos':['aptos','apt'],'arbitrum':['arbitrum','arb'],
};

const _deepCache = {};
const DEEP_TTL = 20 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin','*'); res.end(); return; }
  var params = new URL(req.url, 'https://cryptikr.vercel.app').searchParams;
  var coinId = (params.get('id') || '').toLowerCase();
  var mode   = params.get('mode') || 'deep';
  var ck = mode + '_' + coinId;

  if (_deepCache[ck] && Date.now() - _deepCache[ck].ts < DEEP_TTL) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(_deepCache[ck].text);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  var prompt = '';

  if (mode === 'market-deep') {
    var results = await Promise.all([
      sf('https://api.coingecko.com/api/v3/global'),
      sf('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'),
      fetch('https://finnhub.io/api/v1/news?category=crypto&token='+FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];}),
    ]);
    var g=(results[0]&&results[0].data)||{};
    var prices=results[1]||{};
    var news=results[2]||[];
    var btc=prices.bitcoin||{}, eth=prices.ethereum||{}, sol=prices.solana||{};
    var totM=(g.total_market_cap&&g.total_market_cap.usd)||0;
    var mChg=g.market_cap_change_percentage_24h_usd?g.market_cap_change_percentage_24h_usd.toFixed(2):'?';
    var btcDom=(g.market_cap_percentage&&g.market_cap_percentage.btc)?g.market_cap_percentage.btc.toFixed(1):'?';
    var ethDom=(g.market_cap_percentage&&g.market_cap_percentage.eth)?g.market_cap_percentage.eth.toFixed(1):'?';
    var hdls=news.slice(0,8).map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n');
    prompt = 'You are CryptikrAI, an elite institutional crypto market analyst writing a hedge fund briefing. Be authoritative, direct, use specific numbers in every sentence. Complete all 5 sections fully.\n\nMARKET DATA:\nTotal Market Cap: '+fmtN(totM)+' ('+mChg+'% 24h) | BTC Dominance: '+btcDom+'% | ETH Dominance: '+ethDom+'%\nBTC: $'+(btc.usd||0).toLocaleString()+' ('+(btc.usd_24h_change||0).toFixed(2)+'% 24h) | Mkt Cap: '+fmtN(btc.usd_market_cap)+'\nETH: $'+(eth.usd||0).toLocaleString()+' ('+(eth.usd_24h_change||0).toFixed(2)+'% 24h)\nSOL: $'+(sol.usd||0).toLocaleString()+' ('+(sol.usd_24h_change||0).toFixed(2)+'% 24h)\nActive Coins: '+(g.active_cryptocurrencies||'?')+'\n\nNEWS:\n'+hdls+'\n\nWrite exactly 5 sections, 2 sentences each. Short, specific, complete. Complete every section. End the final section with a complete sentence ending in a period:\n\n## Market Structure & Momentum\nAssess the total market cap level, 24h change direction, BTC vs ETH vs altcoin relative performance, and the risk-on vs risk-off signal from volume patterns.\n\n## BTC Dominance & Capital Rotation\nInterpret what '+btcDom+'% BTC dominance means for institutional positioning. Assess whether capital is consolidating in BTC or rotating into alts. Identify the specific price level or event that triggers meaningful altcoin rotation. Give the timeline.\n\n## News Catalyst Analysis\nIdentify the most bullish catalyst from the headlines and quantify its upside impact. Identify the most bearish risk and its specific downside scenario with numbers. Assess a third catalyst the market is underpricing. State what the market is missing.\n\n## Bull vs Bear Scenarios\nBull case: specific total market cap target, the 2 conditions required, and probability percentage. Bear case: specific market cap downside level, the 2 triggers, and probability percentage. Include BTC price levels for each scenario.\n\n## Positioning & Strategy\nState exact sector allocation percentages (BTC/ETH/alts/stables). Name the single best risk/reward trade this week with entry and target. Identify 2 specific metrics to monitor. State what would invalidate this entire thesis.';
  } else {
    // Coin deep dive
    var coinResults = await Promise.all([
      sf('https://api.coingecko.com/api/v3/coins/'+coinId+'?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'),
      sf('https://api.coingecko.com/api/v3/simple/price?ids='+coinId+',bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true'),
      sf('https://api.coingecko.com/api/v3/global'),
      fetch('https://finnhub.io/api/v1/news?category=crypto&token='+FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];}),
    ]);
    var detail=coinResults[0], price=coinResults[1], gData=coinResults[2], allNews=coinResults[3];
    var m=(detail&&detail.market_data)||{};
    var p=(price&&price[coinId])||{};
    var g2=(gData&&gData.data)||{};
    var sym=(detail&&detail.symbol)?detail.symbol.toUpperCase():coinId.toUpperCase();
    var name=(detail&&detail.name)||coinId;
    var kws=COIN_KWS[coinId]||[name.toLowerCase()];
    var coinNews=Array.isArray(allNews)?allNews.filter(function(n){var t=((n.headline||'')+(n.summary||'')).toLowerCase();return kws.some(function(k){return t.indexOf(k)>=0;});}).slice(0,5):[];
    var macroNews=Array.isArray(allNews)?allNews.filter(function(n){return coinNews.indexOf(n)<0;}).slice(0,4):[];
    var pr=p.usd||(m.current_price&&m.current_price.usd)||0;
    var chg24=p.usd_24h_change||m.price_change_percentage_24h||0;
    var mktCap=p.usd_market_cap||(m.market_cap&&m.market_cap.usd)||0;
    var btcDom2=(g2.market_cap_percentage&&g2.market_cap_percentage.btc)?g2.market_cap_percentage.btc.toFixed(1):'?';
    var totMkt=(g2.total_market_cap&&g2.total_market_cap.usd)||0;
    var dataBlock = [
      name+' ('+sym+') | Price: $'+pr.toLocaleString()+' | 24h: '+chg24.toFixed(2)+'% | 7D: '+(m.price_change_percentage_7d||0).toFixed(2)+'% | 30D: '+(m.price_change_percentage_30d||0).toFixed(2)+'%',
      'Mkt Cap: '+fmtN(mktCap)+' | FDV: '+fmtN(m.fully_diluted_valuation&&m.fully_diluted_valuation.usd)+' | Rank: #'+(detail&&detail.market_cap_rank||'?')+' | Vol: '+fmtN(p.usd_24h_vol||(m.total_volume&&m.total_volume.usd)),
      'Supply: '+(m.circulating_supply?m.circulating_supply.toLocaleString():'N/A')+' / '+(m.max_supply?m.max_supply.toLocaleString():'Unlimited')+' | ATH: $'+((m.ath&&m.ath.usd)||0).toLocaleString()+' ('+((m.ath_change_percentage&&m.ath_change_percentage.usd)||0).toFixed(1)+'% away)',
      'Sentiment: '+((detail&&detail.sentiment_votes_up_percentage)||0).toFixed(0)+'% bullish | BTC Dom: '+btcDom2+'% | Total Mkt: '+fmtN(totMkt),
      coinNews.length>0?'COIN NEWS:\n'+coinNews.map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n'):'No recent coin news.',
      'MACRO NEWS:\n'+macroNews.map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n'),
    ].join('\n');
    prompt = 'You are CryptikrAI, an elite institutional crypto analyst writing a hedge fund briefing on '+name+' ('+sym+'). Authoritative, direct, specific numbers every sentence. Complete all 5 sections fully.\n\n'+dataBlock+'\n\nWrite exactly 5 sections, 2 sentences each. Short, specific, complete. Complete every section. End the final section with a complete sentence ending in a period:\n\n## Market Position & Momentum\nPrice level and ATH context with specific percentages. Momentum across 24h/7D/30D timeframes. Volume quality — institutional or retail driven. Near-term directional signal.\n\n## Tokenomics & Supply Dynamics\nCirculating vs max supply and what it means for scarcity. FDV vs market cap ratio and dilution risk. Any unlock schedules, emission rates, or burn mechanisms. 6-12 month supply outlook and price impact.\n\n## News & Macro Catalyst Analysis\nMost bullish catalyst from the news and its specific price impact on '+sym+'. Most bearish risk and downside scenario with levels. What the macro environment (BTC at '+btcDom2+'% dominance, total market '+fmtN(totMkt)+') means for '+sym+'. What the market is currently mispricing.\n\n## Bull Case & Bear Case\nBull: price target 1 with conditions and probability. Bull: price target 2 (new ATH scenario) with conditions. Bear: downside level 1 with trigger. Bear: maximum pain level with scenario.\n\n## Entry, Risk & Position Sizing\nSpecific support level for entry with reasoning. Specific resistance that must break for bull thesis. Position sizing guidance for aggressive/moderate/conservative. Write exactly 4 sentences then stop. Sentence 4 must state the exact price that invalidates the bull thesis and end with a period.';
  }

  // Stream from Anthropic Sonnet
  var anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01' },
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1200, stream:true, messages:[{role:'user',content:prompt}] }),
  });

  if (!anthropicResp.ok) {
    res.status(500).send('Analysis failed');
    return;
  }

  var reader = anthropicResp.body.getReader();
  var dec = new TextDecoder();
  var fullText = '';
  var buf = '';
  try {
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var chunk = dec.decode(result.value, { stream: true });
      if (!res.writableEnded) res.write(chunk);
      buf += chunk;
      var lines = buf.split('\n'); buf = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].trim();
        if (ln.indexOf('data:') !== 0) continue;
        var dd = ln.slice(5).trim();
        if (dd === '[DONE]') continue;
        try { var p2 = JSON.parse(dd); fullText += (p2.delta && p2.delta.text) || ''; } catch(e) {}
      }
    }
  } catch(e) { console.error('Stream error:', e); }
  if (fullText && fullText.length > 100) _deepCache[ck] = { ts: Date.now(), text: fullText };
  if (!res.writableEnded) res.end();
}
