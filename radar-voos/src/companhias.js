// Normaliza companhia aérea a partir do código ICAO/IATA ou do nome mostrado no painel.
const TABELA = [
  { re: /^(GLO|G3)$|\bgol\b/i, iata: 'G3', nome: 'GOL' },
  { re: /^(AZU|AD)$|\bazul\b/i, iata: 'AD', nome: 'Azul' },
  { re: /^(TAM|LAN|LA|JJ)$|latam|\btam\b/i, iata: 'LA', nome: 'LATAM' },
  { re: /^(JES|JAT|JA|WJ|JZ)$|jet ?smart/i, iata: 'JA', nome: 'JetSMART' },
  { re: /^(TAP|TP)$|\btap\b/i, iata: 'TP', nome: 'TAP' },
  { re: /^(CMP|CM)$|copa/i, iata: 'CM', nome: 'Copa' },
  { re: /^(ARG|AR)$|aerol[ií]neas argentinas/i, iata: 'AR', nome: 'Aerolíneas Argentinas' },
  { re: /^(AVA|AV)$|avianca/i, iata: 'AV', nome: 'Avianca' },
  { re: /^(AAL|AA)$|american airlines/i, iata: 'AA', nome: 'American Airlines' },
  { re: /^(UAL|UA)$|united/i, iata: 'UA', nome: 'United' },
  { re: /^(DAL|DL)$|delta/i, iata: 'DL', nome: 'Delta' },
  { re: /^(AFR|AF)$|air france/i, iata: 'AF', nome: 'Air France' },
  { re: /^(KLM|KL)$|\bklm\b/i, iata: 'KL', nome: 'KLM' },
  { re: /^(IBE|IB)$|iberia/i, iata: 'IB', nome: 'Iberia' },
  { re: /^(DLH|LH)$|lufthansa/i, iata: 'LH', nome: 'Lufthansa' },
  { re: /^(BAW|BA)$|british/i, iata: 'BA', nome: 'British Airways' },
  { re: /^(ITY|AZ)$|\bita airways/i, iata: 'AZ', nome: 'ITA Airways' },
  { re: /^(UAE|EK)$|emirates/i, iata: 'EK', nome: 'Emirates' },
  { re: /^(QTR|QR)$|qatar/i, iata: 'QR', nome: 'Qatar Airways' },
  { re: /^(THY|TK)$|turkish/i, iata: 'TK', nome: 'Turkish Airlines' },
  { re: /^(ETH|ET)$|ethiopian/i, iata: 'ET', nome: 'Ethiopian' },
  { re: /^(SKU|H2)$|sky airline/i, iata: 'H2', nome: 'Sky Airline' },
  { re: /^(ACA|AC)$|air canada/i, iata: 'AC', nome: 'Air Canada' },
  { re: /^(AEA|UX)$|air europa/i, iata: 'UX', nome: 'Air Europa' },
  { re: /^(PTB|2Z)$|voepass|passaredo/i, iata: '2Z', nome: 'Voepass' },
];

function companhia(codigo, nome) {
  const cands = [codigo, nome].filter(Boolean).map(String);
  for (const c of cands) {
    const t = c.trim();
    for (const row of TABELA) if (row.re.test(t)) return { iata: row.iata, nome: row.nome };
  }
  const cod = (codigo || '').trim().toUpperCase();
  return { iata: cod || '??', nome: (nome || cod || 'desconhecida').trim() };
}

module.exports = { companhia };
