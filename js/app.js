/* RealiArte 1922 — sala de museu 3D/360 com A-Frame */
(function () {
  'use strict';

  var ALTURA_QUADRO = 1.7;      // altura do centro dos quadros (m)
  var DIST_QUADRO = 3.5;        // distância máxima para abrir um quadro (m)
  var DIST_LETREIRO = 7;        // distância máxima para abrir o letreiro (m)
  var SALA = { x: 6, z: 7, h: 4 };

  var $ = function (id) { return document.getElementById(id); };
  var joy = { x: 0, y: 0 };
  var quadros = [];             // { el, obra, pos }
  var letreiroPos = null;
  var dados = null;

  /* ---------- utilidades de DOM ---------- */
  function criar(tag, attrs, pai) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (pai) pai.appendChild(el);
    return el;
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- painel de informações ---------- */
  function secao(titulo, texto) {
    var corpo = $('painel-corpo');
    var h = document.createElement('h3'); h.textContent = titulo;
    var p = document.createElement('p'); p.textContent = texto;
    corpo.appendChild(h); corpo.appendChild(p);
  }

  function abrirPainel(etiqueta, titulo, sub) {
    $('painel-etiqueta').textContent = etiqueta;
    $('painel-titulo').textContent = titulo;
    $('painel-sub').textContent = sub || '';
    $('painel-corpo').innerHTML = '';
    $('painel').hidden = false;
  }

  function abrirObra(o) {
    abrirPainel(o.naSemana ? 'Obra ligada à Semana de 22' : 'Depois da Semana', o.titulo, o.autor + ' · ' + o.ano);
    secao('Autor', o.autor);
    secao('Técnica', o.tecnica + ' ' + o.tecnicas);
    secao('O que simboliza', o.simbolismo);
    if (!o.naSemana) {
      var av = document.createElement('p');
      av.className = 'aviso';
      av.textContent = 'Esta obra é posterior à Semana de 1922 (Tarsila estava em Paris na época), mas mostra os caminhos abertos pelo Modernismo.';
      $('painel-corpo').appendChild(av);
    }
  }

  function abrirSemana() {
    var s = dados.semana;
    abrirPainel('Exposição', s.titulo, s.subtitulo);
    s.secoes.forEach(function (x) { secao(x.titulo, x.texto); });
  }

  function fecharPainel() { $('painel').hidden = true; }

  /* ---------- textura: imagem real, ou placeholder gerado ---------- */
  function placeholder(obra, w, h) {
    var c = document.createElement('canvas');
    c.width = Math.round(512 * w / h); c.height = 512;
    var g = c.getContext('2d');
    var cs = obra.cores;
    g.fillStyle = cs[0]; g.fillRect(0, 0, c.width, c.height);
    // formas abstratas determinísticas a partir do id
    var seed = 0; for (var i = 0; i < obra.id.length; i++) seed = (seed * 31 + obra.id.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var n = 0; n < 9; n++) {
      g.fillStyle = cs[1 + (n % 2)];
      g.globalAlpha = 0.55 + rnd() * 0.4;
      g.beginPath();
      g.ellipse(rnd() * c.width, rnd() * c.height * 0.8, 40 + rnd() * 110, 40 + rnd() * 140, rnd() * 3, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, c.height - 90, c.width, 90);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 30px Georgia'; g.fillText(obra.titulo.length > 24 ? obra.titulo.slice(0, 23) + '…' : obra.titulo, c.width / 2, c.height - 48);
    g.font = '22px Georgia'; g.fillText(obra.autor, c.width / 2, c.height - 18);
    return c;
  }

  function aplicarTextura(el, obra) {
    var c = placeholder(obra, obra.largura, obra.altura);
    c.id = 'tex-' + obra.id;
    c.style.display = 'none';
    document.body.appendChild(c);
    el.setAttribute('material', 'shader: flat; color: #ffffff; src: #' + c.id);
    // se existir a imagem real em assets/obras, substitui o placeholder
    var img = new Image();
    img.onload = function () { el.setAttribute('material', 'src', obra.imagem); };
    img.src = obra.imagem;
  }

  /* ---------- construção da sala ---------- */
  function parede(sala, pos, rot, w, h, cor) {
    criar('a-plane', {
      position: pos, rotation: rot, width: w, height: h,
      material: 'color: ' + cor + '; roughness: 1; side: double'
    }, sala);
  }

  function construirSala() {
    var sala = $('sala');
    var X = SALA.x, Z = SALA.z, H = SALA.h;

    criar('a-entity', { light: 'type: ambient; color: #fff4e0; intensity: 0.7' }, sala);
    criar('a-entity', { light: 'type: directional; color: #ffffff; intensity: 0.5', position: '0 6 4' }, sala);
    criar('a-sky', { color: '#1a1410' }, sala);

    // chão, teto e paredes
    criar('a-plane', { rotation: '-90 0 0', width: 2 * X, height: 2 * Z, material: 'color: #8b6a47; roughness: 0.6' }, sala);
    criar('a-plane', { position: '0 ' + H + ' 0', rotation: '90 0 0', width: 2 * X, height: 2 * Z, material: 'color: #f1ebe0' }, sala);
    parede(sala, '0 ' + H / 2 + ' ' + -Z, '0 0 0', 2 * X, H, '#e9dfcb');          // fundo (central)
    parede(sala, '0 ' + H / 2 + ' ' + Z, '0 180 0', 2 * X, H, '#e9dfcb');         // frente
    parede(sala, -X + ' ' + H / 2 + ' 0', '0 90 0', 2 * Z, H, '#d9ccb1');         // esquerda
    parede(sala, X + ' ' + H / 2 + ' 0', '0 -90 0', 2 * Z, H, '#d9ccb1');         // direita
    // rodapé
    criar('a-box', { position: '0 0.08 ' + (-Z + 0.03), width: 2 * X, height: 0.16, depth: 0.06, color: '#4a3826' }, sala);

    // banco central
    criar('a-box', { position: '0 0.25 0', width: 2, height: 0.5, depth: 0.7, color: '#3a2a1c' }, sala);

    // letreiro da parede central (clicável)
    var fundo = -Z + 0.02;
    letreiroPos = new THREE.Vector3(0, 2.4, fundo);
    var placa = criar('a-plane', {
      class: 'clicavel', 'data-alvo': 'semana',
      position: '0 2.4 ' + (fundo + 0.01), width: 7, height: 1.4,
      material: 'color: #1a1410; shader: flat'
    }, sala);
    criar('a-entity', { position: '0 2.62 ' + (fundo + 0.03),
      text: 'value: SEMANA DE ARTE MODERNA; align: center; width: 6.4; color: #d9a441' }, sala);
    criar('a-entity', { position: '0 2.15 ' + (fundo + 0.03),
      text: 'value: 1922 · toque para saber mais; align: center; width: 4; color: #f3ead9' }, sala);
    criar('a-entity', { position: '0 3.5 ' + (fundo + 2), light: 'type: point; intensity: 0.8; distance: 8; decay: 1; color: #fff1d0' }, sala);
    placa.addEventListener('click', function () { tentar(letreiroPos, DIST_LETREIRO, abrirSemana, 'Aproxime-se da parede central para ler o texto.'); });
  }

  function construirQuadros() {
    var sala = $('sala');
    dados.obras.forEach(function (o) {
      var esq = o.parede === 'esquerda';
      var x = esq ? -SALA.x + 0.05 : SALA.x - 0.05;
      var grupo = criar('a-entity', {
        position: x + ' ' + ALTURA_QUADRO + ' ' + o.z,
        rotation: '0 ' + (esq ? 90 : -90) + ' 0'
      }, sala);

      criar('a-box', { width: o.largura + 0.16, height: o.altura + 0.16, depth: 0.06, position: '0 0 0.0', color: '#3a2a1c' }, grupo);
      var tela = criar('a-plane', {
        class: 'clicavel', width: o.largura, height: o.altura, position: '0 0 0.04',
        material: 'shader: flat; color: #ffffff'
      }, grupo);
      aplicarTextura(tela, o);

      // placa de identificação
      criar('a-plane', { width: 0.7, height: 0.2, position: '0 ' + (-(o.altura / 2) - 0.28) + ' 0.02', material: 'color: #f3ead9; shader: flat' }, grupo);
      criar('a-entity', { position: '0 ' + (-(o.altura / 2) - 0.28) + ' 0.03',
        text: 'value: ' + o.titulo + '\\n' + o.autor + ', ' + o.ano + '; align: center; width: 1.1; color: #2a2118; wrapCount: 30' }, grupo);

      // luminária
      criar('a-entity', { position: '0 1.2 1.5', light: 'type: point; intensity: 0.5; distance: 4; decay: 1; color: #fff1d0' }, grupo);

      var pos = new THREE.Vector3(x, ALTURA_QUADRO, o.z);
      quadros.push({ el: grupo, obra: o, pos: pos });

      tela.addEventListener('click', function () {
        tentar(pos, DIST_QUADRO, function () { abrirObra(o); }, 'Aproxime-se do quadro para ver os detalhes.');
      });
    });
  }

  function distancia(p) {
    var cam = $('camera').object3D, v = new THREE.Vector3();
    cam.getWorldPosition(v);
    return Math.hypot(v.x - p.x, v.z - p.z);
  }

  function tentar(pos, max, acao, msg) {
    if (!$('painel').hidden) return;
    if (distancia(pos) <= max) acao(); else toast(msg);
  }

  /* ---------- movimento (joystick + teclado) ---------- */
  AFRAME.registerComponent('movimento', {
    init: function () {
      this.keys = {};
      this.dir = new THREE.Vector3();
      var k = this.keys;
      window.addEventListener('keydown', function (e) { k[e.key.toLowerCase()] = true; });
      window.addEventListener('keyup', function (e) { k[e.key.toLowerCase()] = false; });
    },
    tick: function (t, dt) {
      if (!$('painel').hidden) return;
      var k = this.keys;
      var ix = joy.x + ((k.d || k.arrowright) ? 1 : 0) - ((k.a || k.arrowleft) ? 1 : 0);
      var iy = joy.y + ((k.s || k.arrowdown) ? 1 : 0) - ((k.w || k.arrowup) ? 1 : 0);
      if (!ix && !iy) return;
      var n = Math.hypot(ix, iy); if (n > 1) { ix /= n; iy /= n; }

      var cam = $('camera').object3D;
      cam.getWorldDirection(this.dir);              // +z do objeto = -frente da câmera
      var fx = -this.dir.x, fz = -this.dir.z;
      var fl = Math.hypot(fx, fz);
      if (fl < 0.001) return;
      fx /= fl; fz /= fl;
      var rx = -fz, rz = fx;                         // direita

      var vel = 2.0 * dt / 1000;
      var p = this.el.object3D.position;
      p.x += (rx * ix - fx * iy) * vel;
      p.z += (rz * ix - fz * iy) * vel;
      p.x = Math.max(-SALA.x + 0.6, Math.min(SALA.x - 0.6, p.x));
      p.z = Math.max(-SALA.z + 0.6, Math.min(SALA.z - 0.6, p.z));
    }
  });

  function iniciarJoystick() {
    var base = $('joy'), knob = $('joy-knob'), id = null, R = 45;
    function mover(e) {
      var r = base.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joy.x = dx / R; joy.y = dy / R;
    }
    function soltar() { id = null; joy.x = joy.y = 0; knob.style.transform = ''; }
    base.addEventListener('pointerdown', function (e) { id = e.pointerId; base.setPointerCapture(id); mover(e); e.preventDefault(); });
    base.addEventListener('pointermove', function (e) { if (e.pointerId === id) mover(e); });
    base.addEventListener('pointerup', soltar);
    base.addEventListener('pointercancel', soltar);
  }

  /* ---------- dica de proximidade ---------- */
  AFRAME.registerComponent('proximidade', {
    schema: {},
    init: function () { this.acc = 0; },
    tick: function (t, dt) {
      this.acc += dt; if (this.acc < 250) return; this.acc = 0;
      var dica = $('dica'), melhor = null, dm = Infinity;
      quadros.forEach(function (q) { var d = distancia(q.pos); if (d < dm) { dm = d; melhor = q; } });
      if (melhor && dm <= DIST_QUADRO) {
        dica.textContent = 'Toque no quadro: ' + melhor.obra.titulo;
        dica.hidden = false;
      } else if (letreiroPos && distancia(letreiroPos) <= DIST_LETREIRO && dm > DIST_QUADRO) {
        dica.textContent = 'Toque no letreiro da parede central';
        dica.hidden = false;
      } else {
        dica.hidden = true;
      }
    }
  });

  /* ---------- inicialização ---------- */
  function iniciar() {
    fetch('data/obras.json').then(function (r) { return r.json(); }).then(function (d) {
      dados = d;
      construirSala();
      construirQuadros();
      $('cena').setAttribute('proximidade', '');
    }).catch(function (e) {
      toast('Erro ao carregar as obras. Abra via servidor (http/https).');
      console.error(e);
    });

    iniciarJoystick();
    $('btn-entrar').addEventListener('click', function () {
      $('intro').hidden = true;
      $('hud').hidden = false;
    });
    $('painel-fechar').addEventListener('click', fecharPainel);
    $('painel').addEventListener('click', function (e) { if (e.target === this) fecharPainel(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPainel(); });
  }

  // o A-Frame registra o componente 'proximidade' acima; espera a cena estar pronta
  var cena = $('cena');
  if (cena.hasLoaded) iniciar(); else cena.addEventListener('loaded', iniciar);
})();
