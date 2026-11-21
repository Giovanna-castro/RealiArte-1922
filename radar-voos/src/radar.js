#!/usr/bin/env node
// Radar de cancelamentos e atrasos de voo — fontes oficiais e gratuitas.
// Uso: node radar-voos/src/radar.js [--sem-historico]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const fontes = require('./fontes');
const { buscarMetars, climaEm, URL_BASE: METAR_URL } = require('./metar');
const { ymd, iso, fmtHora, fmtDur } = require('./util');

const RAIZ = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config/aeroportos.json'), 'utf8'));
const regras = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config/regras.json'), 'utf8'));
const ARQ_HIST = path.join(RAIZ, 'dados/historico.json');
const SEM_HIST = process.argv.includes('--sem-historico');

const NAO_VERIFICAVEL = 'não verificável em fonte pública';
const RE_CARGA = new RegExp(regras.companhias_cargueiras_regex, 'i');
const RE_CANCEL = /cancel/i;
const RE_DESVIO = /altern|desvi|divert/i;
const RE_REALIZADO = /decol|partiu|departed|pous|aterr|landed|chegou|desembarc|em solo|arrived/i;
const RE_SEM_PREV = /sem previs|indefinid|atrasad|delayed/i;

// ---------- identificação de aeroportos citados por nome ----------
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function icaoPorNome(outro) {
  if (outro.icao && /^[A-Z]{4}$/.test(outro.icao)) return outro.icao;
  if (outro.iata) { const a = cfg.aeroportos.find((x) => x.iata === outro.iata); if (a) return a.icao; }
  const n = norm(outro.nome);
  if (!n) return null;
  for (const a of cfg.aeroportos) if (n.includes(norm(a.nome))) return a.icao;
  for (const a of cfg.aeroportos) if (n.includes(norm(a.cidade))) return a.icao;
  if (/sao paulo/.test(n)) return 'SBGR';
  if (/rio de janeiro/.test(n)) return 'SBGL';
  if (/belo horizonte/.test(n)) return 'SBCF';
  return null;
}
const apPorIcao = Object.fromEntries(cfg.aeroportos.map((a) => [a.icao, a]));
function rotulo(icao, outro) {
  if (icao && apPorIcao[icao]) return apPorIcao[icao].iata;
  return outro?.iata || outro?.nome || icao || '?';
}

// ---------- coleta ----------
async function coletar(agora) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const ctx = await browser.newContext();
  const voos = []; const cobertura = [];
  try {
    for (const ap of cfg.aeroportos) {
      if (!ap.ativo) { cobertura.push({ icao: ap.icao, iata: ap.iata, ok: false, motivo: ap.obs || 'inativo', inativo: true }); continue; }
      const t0 = Date.now();
      try {
        const lista = await fontes[ap.fonte](ctx, ap, agora, browser);
        lista.forEach((v) => { v.consultado_em = iso(new Date()); });
        voos.push(...lista);
        cobertura.push({ icao: ap.icao, iata: ap.iata, ok: true, voos: lista.length, segundos: Math.round((Date.now() - t0) / 1000) });
      } catch (e) {
        cobertura.push({ icao: ap.icao, iata: ap.iata, ok: false, motivo: e.message.split('\n')[0].slice(0, 160) });
      }
    }
    let metars = {}; let metarErro = null;
    try {
      const icaos = [...cfg.aeroportos.map((a) => a.icao), ...voos.map((v) => icaoPorNome(v.outro))];
      metars = await buscarMetars(ctx, icaos);
    } catch (e) { metarErro = e.message; }
    return { voos, cobertura, metars, metarErro };
  } finally { await browser.close(); }
}

// ---------- análise ----------
function classificar(v, agora) {
  const s = v.status || '';
  const ref = v.real || v.estimado;
  let atraso = ref && v.previsto ? Math.round((ref - v.previsto) / 60000) : null;
  if (atraso != null && atraso < -60) atraso = null; // horário "estimado" muito antes do previsto: dado inconsistente, ignora
  let atrasoMinimo = false;
  if (RE_CANCEL.test(s)) return { tipo: 'cancelado', atraso };
  if (RE_DESVIO.test(s)) return { tipo: 'desviado', atraso };
  if ((atraso == null || atraso < regras.atraso_minimo_evento) && RE_SEM_PREV.test(s) && !RE_REALIZADO.test(s) && v.previsto) {
    const decorrido = Math.round((agora - v.previsto) / 60000);
    if (decorrido > (atraso || 0)) { atraso = decorrido; atrasoMinimo = true; }
  }
  if (atraso != null && atraso >= regras.atraso_minimo_evento) return { tipo: 'atraso', atraso, atrasoMinimo };
  return { tipo: null, atraso };
}

function deduplicarCodeshare(voos) {
  const vistos = new Map();
  for (const v of voos) {
    const k = [v.aeroporto, v.tipo, v.previsto?.getTime(), norm(v.outro.icao || v.outro.iata || v.outro.nome), v.cia, v.voo].join('|');
    if (!vistos.has(k)) vistos.set(k, v);
  }
  return [...vistos.values()];
}

const RANK = { atraso: 1, desviado: 2, cancelado: 3 };
const faixa = (min) => [600, 480, 360, 240, 180].find((f) => min >= f) || 0;

function nota(ev) {
  let n = ev.tipo === 'cancelado' ? 5 : ev.tipo === 'desviado' ? 3.5
    : ev.atraso >= 600 ? 7 : ev.atraso >= 480 ? 6.5 : ev.atraso >= 360 ? 5.5 : ev.atraso >= 240 ? 4.5 : 3;
  const pax = ev.passageiros;
  const ac = ev.aeronave || '';
  if (pax) n += pax >= 150 ? 1.5 : pax >= 80 ? 1 : 0.5;
  else if (/77|78|A33|A35|A34|74|76|A38|330|350|787|777/i.test(ac)) n += 2;
  else if (/A3[12]|A20N|A21N|73|38M|7M8|E19|E2|737|320|321|319/i.test(ac)) n += 1;
  else n += ev.internacional ? 1 : 0.5;
  const h = +ev.previsto_hora.slice(0, 2);
  if (h < 6) n += 1; else if (h >= 22) n += 0.5;
  if (ev.clima_origem?.adverso === true) n -= 1.5;
  else if (ev.clima_origem?.adverso === false && ev.clima_destino?.adverso !== true) n += 1;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function montarEventos(voos, metars, agora) {
  const candidatos = [];
  for (const v of voos) {
    const c = classificar(v, agora);
    if (c.tipo) candidatos.push({ v, ...c });
  }
  // agrupa a mesma operação vista em dois painéis (partida num, chegada no outro)
  const grupos = [];
  for (const c of candidatos) {
    const g = grupos.find((x) => x.ident === c.v.ident && Math.abs(x.ref - c.v.previsto) < 10 * 3600e3);
    if (g) g.itens.push(c); else grupos.push({ ident: c.v.ident, ref: c.v.previsto, itens: [c] });
  }
  return grupos.map((g) => {
    const part = g.itens.find((c) => c.v.tipo === 'partida');
    const cheg = g.itens.find((c) => c.v.tipo === 'chegada');
    const base = (part || cheg).v;
    const origemIcao = part ? part.v.aeroporto : icaoPorNome(cheg.v.outro);
    const destinoIcao = cheg ? cheg.v.aeroporto : icaoPorNome(part.v.outro);
    const pior = g.itens.reduce((a, b) => (RANK[b.tipo] > RANK[a.tipo] || (b.tipo === a.tipo && (b.atraso || 0) > (a.atraso || 0)) ? b : a));
    const prevPart = part?.v.previsto || null;
    const prevCheg = cheg?.v.previsto || null;
    const previsto = prevPart || prevCheg;
    const ev = {
      id: `${ymd(previsto)}_${g.ident}`,
      tipo: pior.tipo,
      cia: base.cia, cia_nome: base.cia_nome, voo: base.voo, ident: g.ident,
      codeshares: [...new Set(g.itens.flatMap((c) => c.v.codeshares))],
      origem: { icao: origemIcao, rotulo: rotulo(origemIcao, part ? null : cheg?.v.outro), monitorado: !!part },
      destino: { icao: destinoIcao, rotulo: rotulo(destinoIcao, cheg ? null : part?.v.outro), monitorado: !!cheg },
      data: ymd(previsto),
      previsto_partida: iso(prevPart), previsto_chegada: iso(prevCheg),
      estimado_ou_real: iso(pior.v.real || pior.v.estimado),
      previsto_hora: fmtHora(previsto).replace('h', ':'),
      atraso_min: pior.atraso != null && pior.atraso > 0 ? pior.atraso : null,
      atraso_minimo: !!pior.atrasoMinimo,
      atraso: pior.atraso != null && pior.atraso > 0 ? pior.atraso : 0,
      status: g.itens.map((c) => `${c.v.aeroporto}: ${c.v.status}`).join(' | '),
      aeronave: g.itens.map((c) => c.v.aeronave).find(Boolean) || null,
      passageiros: g.itens.map((c) => c.v.passageiros).find(Boolean) || null,
      internacional: g.itens.map((c) => c.v.internacional).find((x) => x != null) ?? null,
      evidencias: g.itens.map((c) => ({
        fonte: c.v.fonte, url: c.v.url, consultado_em: c.v.consultado_em, painel: c.v.aeroporto, tipo: c.v.tipo,
        status: c.v.status, previsto: iso(c.v.previsto), estimado: iso(c.v.estimado), real: iso(c.v.real),
      })),
      confirmacoes: g.itens.length,
    };
    ev.clima_origem = ev.origem.icao ? climaEm(metars, ev.origem.icao, prevPart || prevCheg) : { disponivel: false, texto: 'origem sem METAR' };
    ev.clima_destino = ev.destino.icao ? climaEm(metars, ev.destino.icao, prevCheg || prevPart) : { disponivel: false, texto: 'destino sem METAR' };
    ev.reacomodacao = reacomodacao(ev, part || cheg, voos);
    ev.voo_extra = NAO_VERIFICAVEL;
    ev.nota_companhia = NAO_VERIFICAVEL;
    ev.relatos_publicos = NAO_VERIFICAVEL;
    ev.nota = nota(ev);
    return ev;
  });
}

// Próximo voo da mesma companhia na mesma rota, visto no mesmo painel
function reacomodacao(ev, c, voos) {
  const v = c.v;
  const alvo = norm(v.outro.icao || v.outro.iata || v.outro.nome);
  const prox = voos
    .filter((x) => x !== v && x.aeroporto === v.aeroporto && x.tipo === v.tipo && x.cia === v.cia
      && norm(x.outro.icao || x.outro.iata || x.outro.nome) === alvo
      && x.previsto > v.previsto && x.previsto - v.previsto < 24 * 3600e3 && !RE_CANCEL.test(x.status))
    .sort((a, b) => a.previsto - b.previsto)[0];
  if (!prox) return { texto: `nenhum outro voo ${ev.cia} na mesma rota nas 24h seguintes no painel de ${v.aeroporto}` };
  const est = prox.estimado ? `, estimado ${fmtHora(prox.estimado)}` : '';
  return {
    texto: `próximo ${ev.cia} ${prox.voo} às ${fmtHora(prox.previsto)} (${prox.status || 'sem status'}${est})`,
    voo: prox.ident, previsto: iso(prox.previsto), status: prox.status,
  };
}

function eventosEmMassa(voos, agora) {
  const out = [];
  const porAp = {};
  for (const v of voos) {
    const c = classificar(v, agora);
    const conta = c.tipo === 'cancelado' || (c.atraso != null && c.atraso >= regras.massa_atraso_minimo);
    if (conta && v.previsto && agora - v.previsto < 8 * 3600e3) (porAp[v.aeroporto] ||= []).push({ v, c });
  }
  for (const [icao, lista] of Object.entries(porAp)) {
    lista.sort((a, b) => a.v.previsto - b.v.previsto);
    let melhor = [];
    for (let i = 0; i < lista.length; i++) {
      const jan = lista.filter((x) => x.v.previsto - lista[i].v.previsto >= 0 && x.v.previsto - lista[i].v.previsto <= regras.massa_janela * 60000);
      if (jan.length > melhor.length) melhor = jan;
    }
    if (melhor.length >= regras.massa_minimo_voos) {
      const canc = melhor.filter((x) => x.c.tipo === 'cancelado').length;
      out.push({
        id: `${ymd(melhor[0].v.previsto)}_${icao}_massa`, tipo: 'massa', aeroporto: icao, rotulo: apPorIcao[icao]?.iata || icao,
        data: ymd(melhor[0].v.previsto), janela_inicio: iso(melhor[0].v.previsto), janela_fim: iso(melhor[melhor.length - 1].v.previsto),
        total: melhor.length, cancelados: canc, atrasados: melhor.length - canc,
        voos: melhor.map((x) => `${x.v.ident} ${x.v.tipo === 'partida' ? '→' : '←'} ${x.v.outro.iata || x.v.outro.nome || '?'} ${fmtHora(x.v.previsto)} ${x.v.status}`),
        fonte: melhor[0].v.fonte, url: melhor[0].v.url,
      });
    }
  }
  return out;
}

// ---------- histórico e saída ----------
function lerHistorico() {
  if (SEM_HIST || !fs.existsSync(ARQ_HIST)) return { eventos: {} };
  return JSON.parse(fs.readFileSync(ARQ_HIST, 'utf8'));
}

function comparar(ev, anterior) {
  if (!anterior) return 'novo';
  if (ev.tipo === 'massa') return ev.total >= anterior.total + 3 ? `piorou: ${anterior.total}→${ev.total} voos` : null;
  if (RANK[ev.tipo] > RANK[anterior.tipo]) return `piorou: ${anterior.tipo}→${ev.tipo}`;
  if (ev.tipo === 'atraso' && faixa(ev.atraso) > faixa(anterior.atraso || 0)) return `piorou: atraso ${fmtDur(anterior.atraso)}→${fmtDur(ev.atraso)}`;
  return null;
}

function linhaAviso(ev) {
  if (ev.tipo === 'massa') {
    return `🚨 ${ev.rotulo} | EVENTO EM MASSA | ${ev.total} voos (${ev.cancelados} cancelados, ${ev.atrasados} atrasados ≥2h) entre ${fmtHora(new Date(ev.janela_inicio))} e ${fmtHora(new Date(ev.janela_fim))} | ${ev.clima?.texto || 'METAR ?'} | nota ${ev.nota}`;
  }
  const emoji = { cancelado: '🔴', atraso: '🟠', desviado: '🟣' }[ev.tipo];
  const st = ev.tipo === 'cancelado' ? 'CANCELADO' : ev.tipo === 'desviado' ? 'DESVIADO'
    : `ATRASO ${ev.atraso_minimo ? '≥' : ''}${fmtDur(ev.atraso)}`;
  const prev = `previsto ${ev.previsto_hora.replace(':', 'h')}`;
  const est = ev.tipo === 'atraso' && ev.estimado_ou_real ? `, estimado ${fmtHora(new Date(ev.estimado_ou_real))}` : '';
  const clima = ev.clima_origem?.disponivel ? ev.clima_origem.texto.replace(/^METAR \w+ /, 'METAR ') : 'METAR indisponível';
  return `${emoji} ${ev.origem.rotulo}→${ev.destino.rotulo} | ${ev.cia} ${ev.voo} | ${st} | ${prev}${est} | ${clima} | reacomodação: ${ev.reacomodacao.texto} | nota ${ev.nota}${ev.mudanca && ev.mudanca !== 'novo' ? ` | ${ev.mudanca}` : ''}`;
}

async function main() {
  const agora = new Date();
  const { voos: brutos, cobertura, metars, metarErro } = await coletar(agora);
  const voos = deduplicarCodeshare(brutos.filter((v) => v.previsto && !RE_CARGA.test(v.cia_nome) && !['F', 'H'].includes(v.servico)
    && agora - v.previsto < 30 * 3600e3 && v.previsto - agora < 12 * 3600e3));

  const eventos = montarEventos(voos, metars, agora);
  const massa = eventosEmMassa(voos, agora).map((m) => {
    m.clima = climaEm(metars, m.aeroporto, new Date(m.janela_inicio));
    m.nota = Math.min(10, 7 + Math.floor((m.total - 5) / 5) + (m.clima.adverso === false ? 1 : 0));
    return m;
  });
  const todos = [...massa, ...eventos].sort((a, b) => b.nota - a.nota);

  const hist = lerHistorico();
  for (const ev of todos) ev.mudanca = comparar(ev, hist.eventos[ev.id]);
  const novos = todos.filter((e) => e.mudanca);

  // atualiza histórico só com o que é novo ou piorou (guarda o pior estado visto),
  // para o arquivo mudar — e gerar commit — apenas quando houver novidade
  for (const ev of novos) {
    const ant = hist.eventos[ev.id];
    hist.eventos[ev.id] = {
      tipo: ant && RANK[ant.tipo] > RANK[ev.tipo] ? ant.tipo : ev.tipo,
      atraso: Math.max(ev.atraso || 0, ant?.atraso || 0), total: Math.max(ev.total || 0, ant?.total || 0),
      nota: Math.max(ev.nota, ant?.nota || 0), primeiro_registro: ant?.primeiro_registro || iso(agora), atualizado: iso(agora),
    };
  }
  const limite = Date.now() - regras.dias_historico * 86400e3;
  let removidos = 0;
  for (const [k, v] of Object.entries(hist.eventos)) if (new Date(v.primeiro_registro) < limite) { delete hist.eventos[k]; removidos++; }
  const gravarHist = novos.length > 0 || removidos > 0 || !fs.existsSync(ARQ_HIST);

  const dia = ymd(agora);
  const dirDia = path.join(RAIZ, 'saida', dia);
  fs.mkdirSync(dirDia, { recursive: true });
  fs.mkdirSync(path.dirname(ARQ_HIST), { recursive: true });
  if (!SEM_HIST && gravarHist) fs.writeFileSync(ARQ_HIST, JSON.stringify(hist, null, 1) + "\n");
  for (const ev of novos) fs.appendFileSync(path.join(dirDia, 'eventos.jsonl'), JSON.stringify({ registrado_em: iso(agora), ...ev }) + '\n');

  // aviso (nota ≥ mínimo, só novos/pioras)
  const avisar = novos.filter((e) => e.nota >= regras.nota_minima_aviso);
  const falhas = cobertura.filter((c) => !c.ok && !c.inativo);
  let alerta = '';
  if (avisar.length) {
    alerta = `Radar Voo Direito — ${fmtHora(agora)} de ${dia.split('-').reverse().join('/')} (horário de Brasília)\n\n`
      + avisar.map(linhaAviso).join('\n')
      + `\n\nFontes: painéis oficiais dos aeroportos; clima: METAR via aviationweather.gov.\n`;
    if (falhas.length) alerta += `\nPainéis que falharam nesta rodada: ${falhas.map((f) => f.iata).join(', ')}.\n`;
  } else if (falhas.length >= 4) {
    alerta = `Radar Voo Direito — ${fmtHora(agora)}: sem eventos novos, mas ${falhas.length} painéis falharam (${falhas.map((f) => f.iata).join(', ')}). Verificar.\n`;
  }
  fs.writeFileSync(path.join(RAIZ, 'saida', 'alerta.md'), alerta);

  // relatório da rodada
  const linhas = [];
  linhas.push(`# Radar — rodada de ${dia} ${fmtHora(agora)} (Brasília)`, '');
  linhas.push(`Voos de passageiros lidos: ${voos.length}. Eventos ativos: ${todos.length}. Novos ou piorados: ${novos.length}. Avisos (nota ≥ ${regras.nota_minima_aviso}): ${avisar.length}.`, '');
  linhas.push('## Cobertura', '', '| Aeroporto | Situação |', '|---|---|');
  for (const c of cobertura) linhas.push(`| ${c.iata} | ${c.ok ? `ok, ${c.voos} voos (${c.segundos}s)` : `${c.inativo ? 'fora' : 'FALHOU'}: ${c.motivo}`} |`);
  if (metarErro) linhas.push('', `METAR: falhou (${metarErro})`);
  linhas.push('', '## Eventos', '');
  if (!todos.length) linhas.push('Nenhum evento no momento.');
  for (const ev of todos) linhas.push(`- ${ev.mudanca ? '**[NOVO]** ' : ''}${linhaAviso(ev)}`);
  linhas.push('', `Clima: ${METAR_URL}`);
  fs.writeFileSync(path.join(RAIZ, 'saida', 'ultima_rodada.md'), linhas.join('\n') + '\n');
  console.log(linhas.join('\n'));
}

module.exports = { classificar, montarEventos, eventosEmMassa, comparar, linhaAviso, deduplicarCodeshare };
if (require.main === module) main().catch((e) => { console.error('ERRO NO RADAR:', e); process.exit(1); });
