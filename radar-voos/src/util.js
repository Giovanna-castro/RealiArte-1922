// Utilidades de data/hora (sempre horário de Brasília, UTC-3, sem horário de verão)
const OFFSET = '-03:00';

function agoraBrasilia() {
  return new Date();
}

// "YYYY-MM-DD" no fuso de Brasília
function ymd(d = new Date()) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

function hm(d) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(11, 16);
}

// Cria Date a partir de data local de Brasília e "HH:MM" (ou "HH:MM:SS")
function local(ymdStr, hhmm) {
  if (!ymdStr || !hhmm) return null;
  const t = hhmm.length === 5 ? `${hhmm}:00` : hhmm.slice(0, 8);
  const d = new Date(`${ymdStr}T${t}${OFFSET}`);
  return isNaN(d) ? null : d;
}

// ISO local sem fuso ("2026-11-21T17:05:00") interpretado como Brasília
function localIso(s) {
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
  return new Date(`${s.replace(' ', 'T').slice(0, 19)}${OFFSET}`);
}

// Horário só com HH:MM, relativo a um horário de referência: escolhe o dia que o deixa
// entre 6h antes e 18h depois da referência.
function proximoDe(ref, hhmm) {
  if (!ref || !hhmm || !/^\d\d:\d\d/.test(hhmm)) return null;
  let d = local(ymd(ref), hhmm.slice(0, 5));
  const diff = (d - ref) / 60000;
  if (diff < -360) d = new Date(d.getTime() + 86400e3);
  else if (diff > 1080) d = new Date(d.getTime() - 86400e3);
  return d;
}

function iso(d) {
  if (!d) return null;
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 19) + OFFSET;
}

function fmtHora(d) {
  if (!d) return '?';
  const [h, m] = hm(d).split(':');
  return `${h}h${m}`;
}

function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

module.exports = { agoraBrasilia, ymd, hm, local, localIso, proximoDe, iso, fmtHora, fmtDur };
