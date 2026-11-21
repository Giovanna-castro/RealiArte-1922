// Teste da lógica de eventos com voos simulados (não acessa a internet).
// Uso: node radar-voos/teste/teste_eventos.js
const assert = require('assert');
const r = require('../src/radar');
const { local } = require('../src/util');

const agora = local('2026-11-21', '18:00');
const v = (o) => ({
  aeroporto: 'SBGR', tipo: 'partida', cia: 'G3', cia_nome: 'GOL', voo: '1234', ident: 'G31234', codeshares: [],
  outro: { icao: 'SBFZ', nome: 'Fortaleza' }, previsto: local('2026-11-21', '12:05'), estimado: null, real: null,
  status: 'Previsto', aeronave: 'B738', passageiros: null, internacional: false, fonte: 'teste', url: 'http://teste', ...o,
});
const metars = {
  SBGR: [{ hora: local('2026-11-21', '12:00'), bruto: 'METAR SBGR 211500Z 27010KT 9999 SCT040 29/20 Q1011' }],
  SBFZ: [{ hora: local('2026-11-21', '12:00'), bruto: 'METAR SBFZ 211500Z 09012KT 9999 FEW020 30/22 Q1010' }],
  SBGL: [{ hora: local('2026-11-21', '05:00'), bruto: 'METAR SBGL 210800Z 00000KT 0800 FG OVC002 20/20 Q1015' }],
};

const voos = [
  // cancelado em GRU, visto também na chegada em FOR (deve virar 1 evento com 2 confirmações)
  v({ status: 'Cancelado' }),
  v({ aeroporto: 'SBFZ', tipo: 'chegada', outro: { iata: 'GRU', nome: 'SP - Guarulhos' }, previsto: local('2026-11-21', '15:30'), status: 'Cancelado' }),
  // próximo voo da GOL na mesma rota (reacomodação)
  v({ voo: '1250', ident: 'G31250', previsto: local('2026-11-21', '21:40'), status: 'Previsto' }),
  // atraso de 5h10 com estimado
  v({ cia: 'LA', cia_nome: 'LATAM', voo: '3300', ident: 'LA3300', outro: { icao: 'SBPA', nome: 'Porto Alegre' }, previsto: local('2026-11-21', '13:00'), estimado: local('2026-11-21', '18:10'), status: 'Atrasado', aeronave: 'A320' }),
  // atraso pequeno (não é evento)
  v({ cia: 'AD', voo: '4000', ident: 'AD4000', estimado: local('2026-11-21', '12:50') }),
  // sem previsão há 3h30 (atraso mínimo)
  v({ cia: 'AD', voo: '4100', ident: 'AD4100', previsto: local('2026-11-21', '14:30'), status: 'sem previsão' }),
  // desviado em GIG, madrugada, com nevoeiro
  v({ aeroporto: 'SBGL', tipo: 'chegada', cia: 'LA', voo: '8000', ident: 'LA8000', outro: { icao: 'SBBR' }, previsto: local('2026-11-21', '05:00'), status: 'Alternado' }),
];
// 5 cancelamentos em 2h no Galeão (evento em massa)
for (let i = 0; i < 5; i++) voos.push(v({ aeroporto: 'SBGL', voo: `20${i}0`, ident: `G320${i}0`, outro: { icao: 'SBSP' }, previsto: local('2026-11-21', `15:${10 + i * 10}`), status: 'Cancelado' }));

const evs = r.montarEventos(voos, metars, agora);
const porId = Object.fromEntries(evs.map((e) => [e.ident, e]));

assert.equal(porId.G31234.tipo, 'cancelado');
assert.equal(porId.G31234.confirmacoes, 2, 'cancelamento visto em GRU e FOR deve ser 1 evento com 2 fontes');
assert.match(porId.G31234.reacomodacao.texto, /1250 às 21h40/);
assert.equal(porId.G31234.clima_origem.adverso, false);
assert.equal(porId.LA3300.tipo, 'atraso');
assert.equal(porId.LA3300.atraso, 310);
assert.ok(!porId.AD4000, 'atraso de 45 min não é evento');
assert.equal(porId.AD4100.tipo, 'atraso');
assert.ok(porId.AD4100.atraso_minimo);
assert.equal(porId.LA8000.tipo, 'desviado');
assert.equal(porId.LA8000.clima_destino.adverso, true);
assert.equal(porId.G32000.clima_origem.disponivel, false, "METAR 10h antes do voo não deve ser usado");

const massa = r.eventosEmMassa(voos, agora);
assert.equal(massa.length, 1);
assert.equal(massa[0].aeroporto, 'SBGL');
assert.equal(massa[0].total, 5);

// histórico: igual = não avisa; atraso→cancelado = piorou
assert.equal(r.comparar(porId.G31234, null), 'novo');
assert.equal(r.comparar(porId.G31234, { tipo: 'cancelado' }), null);
assert.match(r.comparar(porId.G31234, { tipo: 'atraso', atraso: 200 }), /atraso→cancelado/);
assert.match(r.comparar(porId.LA3300, { tipo: 'atraso', atraso: 190 }), /3h10→5h10/);
assert.equal(r.comparar(porId.LA3300, { tipo: 'atraso', atraso: 300 }), null);

for (const e of evs) { e.mudanca = 'novo'; console.log(r.linhaAviso(e)); }
massa[0].nota = 7; massa[0].clima = { texto: 'METAR SBGL sem restrição' };
console.log(r.linhaAviso(massa[0]));
console.log('\nOK: todos os testes passaram');
