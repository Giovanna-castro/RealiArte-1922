// METAR via aviationweather.gov (NOAA), que retransmite os METAR emitidos pelo DECEA.
const URL_BASE = 'https://aviationweather.gov/api/data/metar';

async function buscarMetars(ctx, icaos, horas = 14) {
  const lista = [...new Set(icaos.filter((i) => /^[A-Z]{4}$/.test(i || '')))];
  const porIcao = {};
  for (let i = 0; i < lista.length; i += 40) {
    const ids = lista.slice(i, i + 40).join(',');
    const url = `${URL_BASE}?ids=${ids}&format=json&hours=${horas}`;
    const r = await ctx.request.get(url, { timeout: 45000 });
    if (!r.ok()) throw new Error(`METAR HTTP ${r.status()}`);
    const txt = await r.text();
    if (!txt.trim()) continue;
    for (const m of JSON.parse(txt)) {
      (porIcao[m.icaoId] ||= []).push({ hora: new Date(m.obsTime * 1000), bruto: m.rawOb });
    }
  }
  return porIcao;
}

// Avalia condição adversa num METAR bruto
function avaliar(bruto) {
  if (!bruto) return { adverso: null, motivos: [] };
  const motivos = [];
  const corpo = bruto.split(/\s(?:BECMG|TEMPO|NOSIG|RMK)\b/)[0];
  const vis = corpo.match(/\s(\d{4})(?:\s|$)/);
  if (/\bCAVOK\b/.test(corpo)) { /* sem restrição */ } else if (vis && +vis[1] < 1500) motivos.push(`visibilidade ${+vis[1]} m`);
  const teto = [...corpo.matchAll(/\b(BKN|OVC|VV)(\d{3})/g)].map((m) => +m[2] * 100);
  if (teto.length && Math.min(...teto) < 600) motivos.push(`teto ${Math.min(...teto)} pés`);
  if (/\b[+-]?(VC)?TS\w*/.test(corpo) || /\d{3}CB\b/.test(corpo)) motivos.push('trovoada/CB');
  if (/\bFG\b|\bFZFG\b/.test(corpo)) motivos.push('nevoeiro');
  if (/\+RA|\+TSRA|\+SHRA/.test(corpo)) motivos.push('chuva forte');
  const vento = corpo.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (vento && (+vento[2] >= 25 || +(vento[3] || 0) >= 35)) motivos.push(`vento ${+vento[2]}${vento[3] ? `G${+vento[3]}` : ''} kt`);
  return { adverso: motivos.length > 0, motivos };
}

// Escolhe o METAR mais próximo de um horário e avalia
function climaEm(porIcao, icao, quando) {
  const obs = porIcao[icao];
  if (!obs || !obs.length || !quando) return { icao, disponivel: false, texto: 'METAR indisponível' };
  const melhor = obs.reduce((a, b) => (Math.abs(b.hora - quando) < Math.abs(a.hora - quando) ? b : a));
  const distMin = Math.round(Math.abs(melhor.hora - quando) / 60000);
  if (distMin > 90) return { icao, disponivel: false, texto: `sem METAR de ${icao} perto do horário do voo` };
  const av = avaliar(melhor.bruto);
  return {
    icao, disponivel: true, metar: melhor.bruto, adverso: av.adverso, motivos: av.motivos,
    defasagem_min: distMin,
    texto: av.adverso ? `METAR ${icao} adverso: ${av.motivos.join(', ')}` : `METAR ${icao} sem restrição`,
  };
}

module.exports = { buscarMetars, climaEm, avaliar, URL_BASE };
