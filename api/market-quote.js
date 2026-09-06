export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=60'};
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';

// Map ticker symbols to Finnhub format
var SYM_MAP = {
  'SPY':'SPY','QQQ':'QQQ','GLD':'GLD','SLV':'SLV',
  'DXY':'OANDA:XAU_USD',  // Use as proxy — Finnhub free tier
  'TNX':'^TNX',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  var params = new URL(req.url).searchParams;
  var sym = (params.get('sym') || '').toUpperCase();
  if (!sym) return new Response(JSON.stringify({error:'No symbol'}), {status:400, headers:CORS});

  try {
    var finnSym = SYM_MAP[sym] || sym;
    var url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(finnSym) + '&token=' + FINNHUB;
    var r = await fetch(url);
    if (!r.ok) return new Response(JSON.stringify({error:'Fetch failed'}), {status:500, headers:CORS});
    var data = await r.json();
    // data.c = current price, data.d = change, data.dp = % change
    if (!data.c) return new Response(JSON.stringify({error:'No data'}), {status:404, headers:CORS});
    return new Response(JSON.stringify({
      sym: sym,
      c:   data.c,
      d:   data.d,
      dp:  data.dp,
      o:   data.o,
      h:   data.h,
      l:   data.l,
    }), {headers: CORS});
  } catch(e) {
    return new Response(JSON.stringify({error: e.message}), {status:500, headers:CORS});
  }
}
