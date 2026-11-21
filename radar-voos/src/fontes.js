// Leitores dos painéis oficiais dos aeroportos. Cada leitor devolve uma lista de voos normalizados:
// { aeroporto, tipo: 'partida'|'chegada', cia, cia_nome, voo, ident, codeshares[], outro:{icao,iata,nome},
//   previsto, estimado, real (Date|null), status, aeronave, passageiros, internacional, servico, fonte, url }
const { localIso, local, proximoDe, ymd } = require('./util');
const { companhia } = require('./companhias');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function voo(base, extra) {
  const c = companhia(extra.cia_codigo, extra.cia_nome);
  const num = String(extra.numero || '').replace(/^[A-Z0-9]{2}(?=\d)/, (m) => (/^\d+$/.test(m) ? m : '')).replace(/^0+(?=\d)/, '');
  return {
    aeroporto: base.icao,
    tipo: extra.tipo,
    cia: c.iata,
    cia_nome: c.nome,
    voo: num,
    ident: `${c.iata}${num}`,
    codeshares: extra.codeshares || [],
    outro: extra.outro || {},
    previsto: extra.previsto || null,
    estimado: extra.estimado || null,
    real: extra.real || null,
    status: (extra.status || '').toString().replace(/\s+/g, ' ').trim(),
    aeronave: extra.aeronave || null,
    passageiros: extra.passageiros || null,
    internacional: extra.internacional ?? null,
    servico: extra.servico || null,
    fonte: base.fonteNome,
    url: extra.url || base.url,
  };
}

// ---------- GRU Airport (JSON direto) ----------
async function gru(ctx, ap) {
  const out = [];
  for (const [rota, tipo] of [['partidas', 'partida'], ['chegadas', 'chegada']]) {
    const url = `https://www.gru.com.br/pt/Voos.ashx?rota=api/voos/${rota}`;
    const r = await ctx.request.get(url, { headers: { 'user-agent': UA }, timeout: 45000 });
    if (!r.ok()) throw new Error(`GRU ${rota} HTTP ${r.status()}`);
    for (const f of await r.json()) {
      const previsto = localIso(f.dataCompleta);
      out.push(voo({ ...ap, fonteNome: 'GRU Airport (painel oficial)', url }, {
        tipo, url,
        cia_codigo: f.ciaAerea,
        numero: (f.numerosVoo || [])[0],
        codeshares: (f.numerosVoo || []).slice(1).map((n, i) => `${(f.cias || [])[i + 1] || ''}${n}`),
        outro: { icao: f.codigoAeroporto, nome: f.origemDestino },
        previsto,
        estimado: f.horarioConfirmado ? proximoDe(previsto, f.horarioConfirmado) : null,
        status: f.observacao,
        internacional: f.internacional,
      }));
    }
  }
  return out;
}

// ---------- RIOgaleão (JSON direto) ----------
async function riogaleao(ctx, ap) {
  const out = [];
  for (const [kind, tipo] of [['Departure', 'partida'], ['Arrival', 'chegada']]) {
    const url = `https://www.riogaleao.com/api/flights/?kind=${kind}&locale=pt-br`;
    const r = await ctx.request.get(url, { headers: { 'user-agent': UA }, timeout: 45000 });
    if (!r.ok()) throw new Error(`GIG ${kind} HTTP ${r.status()}`);
    const j = await r.json();
    for (const f of j.flights || j) {
      const id = f.flight_id || {};
      const previsto = localIso(f.scheduled_time);
      const conf = localIso(f.most_confident_time);
      out.push(voo({ ...ap, fonteNome: 'RIOgaleão (painel oficial)', url: 'https://www.riogaleao.com/passageiros/voos/painel-de-voos/' }, {
        tipo,
        cia_codigo: id.airline_designator_iata, cia_nome: id.airline_name,
        numero: id.flight_number,
        codeshares: (f.codeshares || []).map((c) => `${c.airline_designator_iata}${c.flight_number}`),
        outro: { icao: f.airport_code_icao, iata: f.airport_code_iata, nome: f.city },
        previsto,
        estimado: conf && previsto && conf.getTime() !== previsto.getTime() ? conf : null,
        status: f.status || f.remark_description_ptbr,
        servico: f.flight_qualifier,
        internacional: f.country_name ? f.country_name !== 'BR' : null,
      }));
    }
  }
  return out;
}

// ---------- Aeroporto de Brasília (JSON direto) ----------
async function bsb(ctx, ap, agora) {
  const out = [];
  const dias = [ymd(new Date(agora.getTime() - 86400e3)), ymd(agora)];
  for (const dia of dias) for (const origem of [1, 2]) for (const [typeId, tipo] of [[2, 'partida'], [1, 'chegada']]) {
    const url = `https://www.bsb.aero/api/v1/Flights?Language=br&OriginId=${origem}&TypeId=${typeId}&Date=${dia}&PageSize=100`;
    const r = await ctx.request.get(url, { headers: { 'user-agent': UA }, timeout: 45000 });
    if (!r.ok()) throw new Error(`BSB HTTP ${r.status()}`);
    for (const f of await r.json()) {
      const d = (f.date || '').slice(0, 10);
      const previsto = local(d, f.estimatedTime);
      out.push(voo({ ...ap, fonteNome: 'Aeroporto de Brasília (painel oficial)', url: 'https://www.bsb.aero/passageiros/voos-online' }, {
        tipo,
        cia_codigo: f.airline?.code, cia_nome: f.airline?.name,
        numero: f.number,
        outro: { icao: f.airport?.icao, iata: f.airport?.iata, nome: f.airport?.city || f.airport?.name },
        previsto,
        estimado: f.confirmedTime ? proximoDe(previsto, f.confirmedTime.slice(0, 5)) : null,
        status: f.status?.name || f.observation,
        aeronave: f.equipment, passageiros: f.totalPassengers,
        internacional: origem === 2,
      }));
    }
  }
  return out;
}

// ---------- Leitores que precisam abrir o painel no navegador ----------
async function abrir(browser, url, onResponse, route) {
  const ctx = await browser.newContext({ locale: 'pt-BR', userAgent: UA });
  const page = await ctx.newPage();
  if (route) await page.route(route.pattern, route.handler);
  if (onResponse) page.on('response', onResponse);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { ctx, page };
}

async function esperar(cond, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 500)); }
  return false;
}

// Salvador (Vinci): o painel chama /pt-br/api/flights?token=...&type=departures
async function salvador(_ctx, ap, _agora, browser) {
  let apiUrl = null; let dep = null;
  const { ctx, page } = await abrir(browser, ap.url, async (r) => {
    if (/\/api\/flights\?/.test(r.url()) && !dep) { apiUrl = r.url(); try { dep = await r.json(); } catch (e) { /* ignora */ } }
  });
  try {
    await esperar(() => dep);
    if (!dep) throw new Error('Salvador: painel não entregou dados');
    const arr = await page.evaluate(async (u) => (await fetch(u)).json(), apiUrl.replace(/type=departures/, 'type=arrivals'));
    const out = [];
    for (const [lista, tipo] of [[dep, 'partida'], [arr, 'chegada']]) for (const f of lista || []) {
      const m = /^(.*?)\s*\((\w+)\)\s*$/.exec(f.Airliner || '') || [];
      const previsto = localIso(f.ScheduleTime);
      const op = localIso(f.OperationTime);
      const st = (f.Status || '').trim();
      const realizado = /decol|pous|aterr|desembarc/i.test(st);
      out.push(voo({ ...ap, fonteNome: 'Salvador Bahia Airport (painel oficial)' }, {
        tipo, cia_codigo: m[2], cia_nome: m[1] || f.Airliner, numero: f.Number,
        outro: { nome: f.Airport },
        previsto,
        estimado: !realizado && op && op.getTime() !== previsto?.getTime() ? op : null,
        real: realizado ? op : null,
        status: st, aeronave: f.AircraftType,
        internacional: f.Route ? /intern/i.test(f.Route) : null,
      }));
    }
    return out;
  } finally { await ctx.close(); }
}

// Fraport (Fortaleza, Porto Alegre): o painel chama api-site.fraport-brasil.com/api/flight?per_page=10
async function fraport(_ctx, ap, _agora, browser) {
  let data = null;
  const route = {
    pattern: /api-site\.fraport-brasil\.com\/api\/flight\?/,
    handler: (rt) => rt.continue({ url: rt.request().url().replace(/per_page=\d+/, 'per_page=400') }),
  };
  const { ctx } = await abrir(browser, ap.url, async (r) => {
    if (/api\/flight\?/.test(r.url()) && !data) { try { data = await r.json(); } catch (e) { /* ignora */ } }
  }, route);
  try {
    await esperar(() => data);
    if (!data) throw new Error(`${ap.iata}: painel Fraport não entregou dados`);
    const out = [];
    for (const [k, tipo] of [['departures', 'partida'], ['arrivals', 'chegada']]) {
      for (const lista of Object.values(data[k] || {})) for (const f of lista) {
        const previsto = localIso(f.original_scheduled_time);
        const outro = tipo === 'partida' ? f.destination : f.origin;
        out.push(voo({ ...ap, fonteNome: `${ap.nome} Airport / Fraport (painel oficial)` }, {
          tipo, cia_nome: f.airline?.text, numero: f.flight,
          outro: { iata: outro?.iata, nome: outro?.name },
          previsto,
          estimado: f.estimated_time ? proximoDe(previsto, f.estimated_time) : null,
          status: f.status?.text,
        }));
      }
    }
    return out;
  } finally { await ctx.close(); }
}

// Florianópolis (Zurich): painel em HTML parcial
function entidades(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function lerFloripa(html, tipo, ap, agora) {
  const out = [];
  const rows = html.split('<div class=flight-panel-table-row>').slice(2);
  let dia = ymd(agora); let ultimo = null;
  for (const r of rows) {
    const col = (nome) => {
      const m = new RegExp(`col-${nome}[^"]*"[^>]*>([\\s\\S]*?)</div>`).exec(r);
      return m ? m[1] : '';
    };
    const txt = (s) => entidades(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const hora = (txt(col('scheduled')).match(/\d\d:\d\d/) || [])[0];
    if (!hora) continue;
    if (ultimo && hora < ultimo && ultimo.slice(0, 2) >= '12' && hora.slice(0, 2) < '12') dia = ymd(new Date(local(dia, '12:00').getTime() + 86400e3));
    ultimo = hora;
    const airlineHtml = col('airline');
    const ciaNome = entidades((/(?:alt|title)=(?:"([^"]+)"|([^\s>]+))/.exec(airlineHtml) || []).slice(1).find(Boolean) || txt(airlineHtml));
    const previsto = local(dia, hora);
    const est = (txt(col('estimated')).match(/\d\d:\d\d/) || [])[0];
    out.push(voo({ ...ap, fonteNome: 'Floripa Airport (painel oficial)' }, {
      tipo, cia_nome: ciaNome, numero: (txt(col('flight')).match(/\d+/) || [])[0],
      outro: { nome: txt(col('origin-destination')).replace(/^(Destino|Origem)\s*/i, '') },
      previsto,
      estimado: est && est !== hora ? proximoDe(previsto, est) : null,
      status: txt(col('status')).replace(/^Observação\s*/i, ''),
    }));
  }
  return out;
}

async function floripa(_ctx, ap, agora, browser) {
  let apiUrl = null;
  const { ctx, page } = await abrir(browser, ap.url, (r) => {
    if (/flight-panel\?direction=Departure/.test(r.url()) && /canLoadMore=true/.test(r.url())) apiUrl = r.url();
  });
  try {
    await esperar(() => apiUrl);
    if (!apiUrl) throw new Error('FLN: painel não entregou dados');
    const big = apiUrl.replace(/pageSize=\d+/, 'pageSize=300');
    const [dep, arr] = await page.evaluate(async (u) => Promise.all([
      fetch(u, { headers: { 'x-requested-with': 'XMLHttpRequest' } }).then((r) => r.text()),
      fetch(u.replace('direction=Departure', 'direction=Arrival'), { headers: { 'x-requested-with': 'XMLHttpRequest' } }).then((r) => r.text()),
    ]), big);
    return [...lerFloripa(dep, 'partida', ap, agora), ...lerFloripa(arr, 'chegada', ap, agora)];
  } finally { await ctx.close(); }
}

// Motiva (Curitiba, Goiânia, Navegantes, São Luís, Teresina): /bin/flight.json?direction=...&icao=...
const STATUS_MOTIVA = {
  'cancelled': 'Cancelado', 'canceled': 'Cancelado', 'delayed': 'Atrasado', 'diverted': 'Alternado',
  'taking off': 'Decolando', 'departed': 'Decolou', 'landed': 'Pousou', 'boarding closed': 'Embarque encerrado',
  'proceed to gate': 'Embarque próximo', 'boarding': 'Embarque', 'last call': 'Última chamada',
  'scheduled': 'Previsto', 'estimated': 'Previsto', 'confirmed': 'Confirmado', 'on time': 'No horário',
  'check-in open': 'Check-in aberto', 'now boarding': 'Embarque', 'flight closed': 'Voo encerrado',
  'arrived': 'Pousou', 'landing': 'Pousando', 'gate closed': 'Embarque encerrado', 'final call': 'Última chamada',
};
async function motiva(_ctx, ap, agora, browser) {
  const url = `https://aeroportos.motiva.com.br/content/Site-Aeroportos/pt/${ap.slug}/voos.html`;
  const { ctx, page } = await abrir(browser, url);
  try {
    const res = await page.evaluate(async (icao) => Promise.all(['departure', 'arrival'].map(async (d) => {
      const r = await fetch(`/bin/flight.json?direction=${d}&icao=${icao}`);
      return r.ok ? r.json() : { erro: r.status };
    })), ap.icao);
    const out = [];
    const ano = ymd(agora).slice(0, 4);
    res.forEach((lista, i) => {
      if (!Array.isArray(lista)) throw new Error(`${ap.iata}: Motiva HTTP ${lista.erro}`);
      const tipo = i === 0 ? 'partida' : 'chegada';
      for (const f of lista) {
        const [dd, mm] = (f.flightDate || '').split('/');
        let previsto = local(`${ano}-${mm}-${dd}`, f.flightTime);
        if (previsto && previsto - agora > 200 * 86400e3) previsto = local(`${+ano - 1}-${mm}-${dd}`, f.flightTime);
        if (previsto && agora - previsto > 200 * 86400e3) previsto = local(`${+ano + 1}-${mm}-${dd}`, f.flightTime);
        const st = (f.flightStatus || '').trim();
        out.push(voo({ ...ap, fonteNome: `Aeroporto de ${ap.nome} / Motiva (painel oficial)`, url }, {
          tipo, cia_nome: f.flightAirlineName, numero: f.flightNumber,
          outro: { nome: tipo === 'partida' ? f.flightDestinationAirport : f.flightOriginAirport },
          previsto, status: STATUS_MOTIVA[st.toLowerCase()] || st,
        }));
      }
    });
    return out;
  } finally { await ctx.close(); }
}

module.exports = { gru, riogaleao, bsb, salvador, fraport, floripa, motiva };
