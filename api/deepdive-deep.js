const _deepCache = {};
const DEEP_TTL = 20 * 60 * 1000;

const CORS = { 'Access-Control-Allow-Origin': '*' };
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(); return;
  }

  var params = new URL(req.url, 'https://cryptikr.vercel.app').searchParams;
  var coinId = (params.get('id') || '').toLowerCase();
  var mode   = params.get('mode') || 'deep';
  var ck = mode + '_' + coinId;

  // Serve from cache
  if (_deepCache[ck] && Date.now() - _deepCache[ck].ts < DEEP_TTL) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT');
    res.end(_deepCache[ck].text);
    return;
  }

  var prompt = '';

  if (mode === 'market-deep') {
    var results = await Promise.all([
      sf('https://api.coingecko.com/api/v3/global'),
      sf('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'),
      fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];}),
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

    prompt = 'You are CryptikrAI institutional crypto analyst. Analyze this market data and return ONLY a valid JSON object — no markdown, no explanation, no text outside the JSON.\n\nDATA:\nTotal Market Cap: ' + fmtN(totM) + ' (' + mChg + '% 24h) | BTC Dom: ' + btcDom + '% | ETH Dom: ' + ethDom + '%\nBTC: $' + (btc.usd||0).toLocaleString() + ' (' + (btc.usd_24h_change||0).toFixed(2) + '% 24h)\nETH: $' + (eth.usd||0).toLocaleString() + ' (' + (eth.usd_24h_change||0).toFixed(2) + '% 24h)\nSOL: $' + (sol.usd||0).toLocaleString() + ' (' + (sol.usd_24h_change||0).toFixed(2) + '% 24h)\nActive Coins: ' + (g.active_cryptocurrencies||'?') + '\nNEWS:\n' + hdls + '\n\nReturn this exact JSON structure with substantive analysis in each field:\n{"momentum":"2-3 sentences on market cap level, BTC vs ETH vs alt performance, risk-on/risk-off signal with specific numbers.","rotation":"2-3 sentences on what ' + btcDom + '% BTC dominance signals, capital flow direction, specific trigger for altcoin rotation.","catalysts":"2-3 sentences: most bullish catalyst with quantified impact, most bearish risk with downside level, what market is mispricing.","bull_bear":"Bull: market reaches [X] (+[Y]%) if [2 conditions], prob [Z]%, BTC=$[price]. Bear: market falls to [X] (-[Y]%) if [2 triggers], prob [Z]%, BTC=$[price].","positioning":"Allocation: BTC [X]%, ETH [Y]%, alts [Z]%, stables [W]%. Best trade this week: [specific entry, target, stop]. Thesis fails if [specific level or event]."}';

  } else {
    // Coin deep dive
    var coinResults = await Promise.all([
      sf('https://api.coingecko.com/api/v3/coins/' + coinId + '?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'),
      sf('https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + ',bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true'),
      sf('https://api.coingecko.com/api/v3/global'),
      fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];}),
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
    var ath=(m.ath&&m.ath.usd)||0;
    var athChg=(m.ath_change_percentage&&m.ath_change_percentage.usd)||0;
    var circ=m.circulating_supply||0;
    var maxSup=m.max_supply||null;
    var fdv=(m.fully_diluted_valuation&&m.fully_diluted_valuation.usd)||0;

    var dataBlock = name + ' (' + sym + ') | $' + pr.toLocaleString() + ' | 24h: ' + chg24.toFixed(2) + '% | 7D: ' + (m.price_change_percentage_7d||0).toFixed(2) + '% | 30D: ' + (m.price_change_percentage_30d||0).toFixed(2) + '%\n'
      + 'Mkt Cap: ' + fmtN(mktCap) + ' | FDV: ' + fmtN(fdv) + ' | Rank: #' + ((detail&&detail.market_cap_rank)||'?') + '\n'
      + 'Supply: ' + (circ?circ.toLocaleString():'N/A') + ' / ' + (maxSup?maxSup.toLocaleString():'Unlimited') + '\n'
      + 'ATH: $' + ath.toLocaleString() + ' (' + athChg.toFixed(1) + '% away)\n'
      + 'BTC Dom: ' + btcDom2 + '% | Total Mkt: ' + fmtN(totMkt) + '\n'
      + (coinNews.length>0 ? 'COIN NEWS:\n'+coinNews.map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n') : 'No coin-specific news.') + '\n'
      + 'MACRO:\n'+macroNews.map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n');

    prompt = 'You are CryptikrAI institutional crypto analyst. Analyze ' + name + ' (' + sym + ') and return ONLY a valid JSON object — no markdown, no explanation, no text outside the JSON.\n\nDATA:\n' + dataBlock + '\n\nReturn this exact JSON structure:\n{"momentum":"2-3 sentences: price vs ATH, momentum across timeframes, volume quality, near-term direction — all with specific numbers.","tokenomics":"2-3 sentences: circulating vs max supply scarcity, FDV vs market cap dilution risk, inflation pressure or burn dynamics.","catalysts":"2-3 sentences: top bullish catalyst with specific price target, top bearish risk with downside level, what the market is mispricing about ' + sym + '.","bull_bear":"Bull target 1: $[price] ([upside]%) requires [condition], prob [X]%. Bull target 2: $[price] ([upside]%) requires [condition], prob [X]%. Bear level: $[price] ([downside]%) triggered by [condition]. Max pain: $[price] in [scenario].","entry":"Entry: $[price] support level with reasoning. Resistance: $[price] must break for bull thesis. Sizing: aggressive [X]% portfolio at $[price] stop $[price], moderate [Y]% scaled entries, conservative [Z]% waits for [condition]. Invalidation: bull thesis fails on daily close below $[price]."}';
  }

  // Call Anthropic — non-streaming JSON
  var anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1000, stream:false, messages:[{role:'user',content:prompt}] }),
  });

  if (!anthropicResp.ok) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({error:'Analysis failed'});
    return;
  }

  var aiResult = await anthropicResp.json();
  var text = (aiResult.content && aiResult.content[0] && aiResult.content[0].text) || '';

  // Extract JSON from response
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  var analysis = null;
  if (jsonMatch) {
    try { analysis = JSON.parse(jsonMatch[0]); } catch(e) {}
  }

  if (!analysis) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({error:'Parse failed', raw: text.slice(0,200)});
    return;
  }

  _deepCache[ck] = { ts: Date.now(), text: JSON.stringify(analysis) };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(analysis);
}
