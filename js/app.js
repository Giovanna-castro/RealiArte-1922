/* RealiArte 1922 — sala de museu 3D/360 com A-Frame */
(function () {
  'use strict';

  var AR = !!window.REALIARTE_AR;   // ar.html: sala em miniatura sobre o marcador
  var ALTURA_QUADRO = 1.7;      // altura do centro dos quadros (m)
  var DIST_QUADRO = 4.5;        // distância máxima para abrir um quadro (m)
  var DIST_LETREIRO = 7;        // distância máxima para abrir o letreiro (m)
  var SALA = { x: 6, z: 7, h: 4 };

  var $ = function (id) { return document.getElementById(id); };
  var joy = { x: 0, y: 0 };
  var andando = false;          // true enquanto o visitante é levado até um quadro
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
    var corpo = $('painel-corpo');
    var img = document.createElement('img');
    img.className = 'painel-img';
    img.alt = o.titulo;
    img.onerror = function () { img.remove(); };
    img.src = o.imagem;
    corpo.appendChild(img);
    secao('Autor', o.autorBio || o.autor);
    secao('Técnicas utilizadas', o.tecnica + ' ' + o.tecnicas);
    secao('O que inspirou a obra', o.inspiracao);
    secao('O que o quadro simboliza', o.simbolismo);
    if (!o.naSemana) {
      var av = document.createElement('p');
      av.className = 'aviso';
      av.textContent = 'Esta obra é posterior à Semana de 1922 (Tarsila estava em Paris na época), mas mostra os caminhos abertos pelo Modernismo.';
      corpo.appendChild(av);
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

  /* ---------- texturas geradas (sem arquivos externos) ---------- */
  function textura(id, w, h, desenhar) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h; c.id = id; c.style.display = 'none';
    desenhar(c.getContext('2d'), w, h);
    document.body.appendChild(c);
    return '#' + id;
  }

  function ruido(g, w, h, n, cor, a) {
    for (var i = 0; i < n; i++) {
      g.fillStyle = 'rgba(' + cor + ',' + (Math.random() * a) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }

  function texturas() {
    var t = {};
    t.piso = textura('t-piso', 512, 512, function (g, w, h) {
      var tons = ['#8a5f3a', '#7d5632', '#946841', '#86593a'];
      for (var i = 0; i < 8; i++) {                      // 8 tábuas por textura
        g.fillStyle = tons[i % 4]; g.fillRect(0, i * 64, w, 64);
        for (var j = 0; j < 40; j++) {                   // veios
          g.strokeStyle = 'rgba(40,20,5,' + (0.05 + Math.random() * 0.1) + ')';
          g.beginPath(); var y = i * 64 + Math.random() * 64; g.moveTo(0, y); g.lineTo(w, y + (Math.random() - .5) * 6); g.stroke();
        }
        g.fillStyle = 'rgba(20,10,0,.55)'; g.fillRect(0, i * 64, w, 2);
        var corte = (i * 173) % 400 + 60; g.fillRect(corte, i * 64, 2, 64);
      }
    });
    t.parede = textura('t-parede', 256, 256, function (g, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      ruido(g, w, h, 2500, '120,100,80', 0.12);
    });
    t.lambri = textura('t-lambri', 256, 256, function (g, w, h) {
      g.fillStyle = '#5b3b24'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
      g.strokeStyle = 'rgba(255,220,170,.18)'; g.lineWidth = 2; g.strokeRect(24, 24, w - 48, h - 48);
      ruido(g, w, h, 1500, '0,0,0', 0.18);
    });
    t.tapete = textura('t-tapete', 256, 512, function (g, w, h) {
      g.fillStyle = '#6e1f26'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a441'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
      g.lineWidth = 3; g.strokeRect(30, 30, w - 60, h - 60);
      g.fillStyle = '#d9a441';
      for (var y = 70; y < h - 60; y += 60) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + 22, y + 22); g.lineTo(w / 2, y + 44); g.lineTo(w / 2 - 22, y + 22); g.fill(); }
      ruido(g, w, h, 2500, '0,0,0', 0.2);
    });
    t.brilho = textura('t-brilho', 128, 128, function (g, w, h) {
      var r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,236,190,.55)'); r.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    t.claraboia = textura('t-clara', 64, 256, function (g, w, h) {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a7a60'; g.lineWidth = 3;
      for (var y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeRect(0, 0, w, h);
    });
    return t;
  }

  /* ---------- construção da sala ---------- */
  function caixa(pai, pos, tam, cor, extra) {
    return criar('a-box', {
      position: pos, width: tam[0], height: tam[1], depth: tam[2],
      material: 'color: ' + cor + '; roughness: ' + ((extra && extra.r) || 0.8) + '; metalness: ' + ((extra && extra.m) || 0)
    }, pai);
  }

  function planta(sala, x, z, esc) {
    var g = criar('a-entity', { position: x + ' 0 ' + z, scale: esc + ' ' + esc + ' ' + esc }, sala);
    criar('a-cylinder', { position: '0 0.3 0', radius: 0.28, height: 0.6, material: 'color: #8c5a3c; roughness: 0.7' }, g);
    criar('a-cylinder', { position: '0 0.85 0', radius: 0.03, height: 0.9, color: '#4a3220' }, g);
    var folhas = [[0, 1.5, 0, .42], [.3, 1.25, .1, .3], [-.3, 1.3, -.1, .32], [.05, 1.0, .3, .28], [-.1, 1.75, .1, .26], [.25, 1.65, -.2, .24]];
    folhas.forEach(function (f, i) {
      criar('a-sphere', { position: f[0] + ' ' + f[1] + ' ' + f[2], radius: f[3], segmentsWidth: 10, segmentsHeight: 8,
        material: 'color: ' + (i % 2 ? '#2f6b3a' : '#3b8247') + '; roughness: 1; flatShading: true' }, g);
    });
  }

  function banco(sala, x, z) {
    caixa(sala, x + ' 0.42 ' + z, [2.2, 0.16, 0.7], '#2b1d14', { r: 0.4 });
    caixa(sala, x + ' 0.5 ' + z, [2.0, 0.08, 0.55], '#7a2a2e', { r: 0.9 });
    [-0.9, 0.9].forEach(function (dx) { caixa(sala, (x + dx) + ' 0.2 ' + z, [0.12, 0.4, 0.5], '#2b1d14'); });
  }

  function pedestal(sala, x, z, ang) {
    caixa(sala, x + ' 0.55 ' + z, [0.55, 1.1, 0.55], '#f1ece2');
    caixa(sala, x + ' 1.12 ' + z, [0.62, 0.05, 0.62], '#d9d0c0');
    criar('a-torus-knot', { position: x + ' 1.5 ' + z, radius: 0.16, 'radius-tubular': 0.045, p: 2, q: 3,
      material: 'color: #9a6a30; metalness: 0.7; roughness: 0.35', rotation: '0 ' + ang + ' 0' }, sala);
  }

  function construirSala() {
    var sala = $('sala'), T = texturas();
    var X = SALA.x, Z = SALA.z, H = SALA.h;

    // luz
    criar('a-entity', { light: 'type: hemisphere; color: #fff4e0; groundColor: #6b5030; intensity: 0.9' }, sala);
    [-4, 0, 4].forEach(function (z) {
      criar('a-entity', { position: '0 3.3 ' + z, light: 'type: point; color: #ffe8c0; intensity: 0.45; distance: 9; decay: 1' }, sala);
    });
    if (!AR) criar('a-sky', { color: '#1a1410' }, sala);

    // piso e tapete
    criar('a-plane', { rotation: '-90 0 0', width: 2 * X, height: 2 * Z,
      material: 'src: ' + T.piso + '; repeat: 6 7; roughness: 0.45; metalness: 0.1' }, sala);
    criar('a-plane', { rotation: '-90 0 0', position: '0 0.012 -0.5', width: 4, height: 8,
      material: 'src: ' + T.tapete + '; roughness: 1' }, sala);

    // teto, vigas e claraboia (na AR a sala fica aberta por cima)
    if (!AR) {
      criar('a-plane', { position: '0 ' + H + ' 0', rotation: '90 0 0', width: 2 * X, height: 2 * Z, material: 'color: #f4eee2; roughness: 1' }, sala);
      [-5.6, -2.8, 0, 2.8, 5.6].forEach(function (z) { caixa(sala, '0 ' + (H - 0.1) + ' ' + z, [2 * X, 0.2, 0.3], '#3d2a1c'); });
      criar('a-plane', { position: '0 ' + (H - 0.01) + ' -1.4', rotation: '90 0 0', width: 3, height: 6,
        material: 'src: ' + T.claraboia + '; shader: flat' }, sala);
      [[0, -4.4, 3.3, 0.15], [0, 1.6, 3.3, 0.15]].forEach(function (f) { caixa(sala, f[0] + ' ' + (H - 0.04) + ' ' + f[1], [f[2], 0.08, f[3]], '#2b1d14'); });
      [-1.575, 1.575].forEach(function (x) { caixa(sala, x + ' ' + (H - 0.04) + ' -1.4', [0.15, 0.08, 6.3], '#2b1d14'); });


    }

    // paredes: fundo (central, vinho), frente, laterais (bege)
    function parede(pos, rot, w, cor) {
      criar('a-plane', { position: pos, rotation: rot, width: w, height: H, material: 'src: ' + T.parede + '; repeat: ' + Math.round(w / 2) + ' 2; color: ' + cor + '; roughness: 1' }, sala);
    }
    parede('0 ' + H / 2 + ' ' + -Z, '0 0 0', 2 * X, '#8a2a3a');
    if (!AR) parede('0 ' + H / 2 + ' ' + Z, '0 180 0', 2 * X, '#cdbfa3');
    parede(-X + ' ' + H / 2 + ' 0', '0 90 0', 2 * Z, '#d6c8aa');
    parede(X + ' ' + H / 2 + ' 0', '0 -90 0', 2 * Z, '#d6c8aa');

    // lambri (parte baixa), friso, rodapé e moldura do teto
    var lam = [[0, -Z + 0.01, 0, 2 * X], [0, Z - 0.01, 180, 2 * X], [-X + 0.01, 0, 90, 2 * Z], [X - 0.01, 0, -90, 2 * Z]];
    lam.forEach(function (l, i) {
      if (AR && i === 1) return;
      criar('a-plane', { position: l[0] + ' 0.5 ' + l[1], rotation: '0 ' + l[2] + ' 0', width: l[3], height: 1,
        material: 'src: ' + T.lambri + '; repeat: ' + Math.round(l[3] / 1) + ' 1; roughness: 0.6' }, sala);
    });
    caixa(sala, '0 1.03 ' + (-Z + 0.04), [2 * X, 0.06, 0.08], '#d9a441', { m: 0.5, r: 0.4 });
    if (!AR) caixa(sala, '0 1.03 ' + (Z - 0.04), [2 * X, 0.06, 0.08], '#d9a441', { m: 0.5, r: 0.4 });
    caixa(sala, (-X + 0.04) + ' 1.03 0', [0.08, 0.06, 2 * Z], '#d9a441', { m: 0.5, r: 0.4 });
    caixa(sala, (X - 0.04) + ' 1.03 0', [0.08, 0.06, 2 * Z], '#d9a441', { m: 0.5, r: 0.4 });
    caixa(sala, '0 ' + (H - 0.12) + ' ' + (-Z + 0.08), [2 * X, 0.24, 0.16], '#efe6d2');
    if (!AR) caixa(sala, '0 ' + (H - 0.12) + ' ' + (Z - 0.08), [2 * X, 0.24, 0.16], '#efe6d2');
    caixa(sala, (-X + 0.08) + ' ' + (H - 0.12) + ' 0', [0.16, 0.24, 2 * Z], '#efe6d2');
    caixa(sala, (X - 0.08) + ' ' + (H - 0.12) + ' 0', [0.16, 0.24, 2 * Z], '#efe6d2');

    // pilastras ao lado da parede central
    [-4.7, 4.7].forEach(function (x) {
      caixa(sala, x + ' ' + H / 2 + ' ' + (-Z + 0.15), [0.45, H, 0.3], '#efe6d2');
      caixa(sala, x + ' 0.15 ' + (-Z + 0.17), [0.58, 0.3, 0.36], '#d9cdb4');
      caixa(sala, x + ' ' + (H - 0.5) + ' ' + (-Z + 0.17), [0.58, 0.2, 0.36], '#d9cdb4');
    });

    // letreiro da parede central (clicável)
    var fundo = -Z + 0.02;
    letreiroPos = new THREE.Vector3(0, 2.4, fundo);
    caixa(sala, '0 2.4 ' + (fundo + 0.02), [7.6, 1.7, 0.06], '#b8892f', { m: 0.6, r: 0.35 });
    var placa = criar('a-plane', {
      class: 'clicavel', position: '0 2.4 ' + (fundo + 0.06), width: 7.3, height: 1.4,
      material: 'color: #15100c; shader: flat'
    }, sala);
    criar('a-entity', { position: '0 2.62 ' + (fundo + 0.08),
      text: 'value: SEMANA DE ARTE MODERNA; align: center; width: 6.6; color: #e3b351' }, sala);
    criar('a-entity', { position: '0 2.15 ' + (fundo + 0.08),
      text: 'value: 1922  ·  toque para saber mais; align: center; width: 4; color: #f3ead9' }, sala);
    placa.addEventListener('click', function () {
      tentar({ pos: letreiroPos, max: DIST_LETREIRO, destino: [0, -Z + 4] }, abrirSemana);
    });
    // brilho do letreiro e banco diante da parede central
    criar('a-plane', { position: '0 2.4 ' + (fundo + 0.015), width: 9, height: 4,
      material: 'src: ' + T.brilho + '; shader: flat; transparent: true; blending: additive; depthWrite: false' }, sala);
    banco(sala, 0, -4.4);

    if (!AR) {
      criar('a-entity', { position: '0 2.5 ' + (Z - 0.05), rotation: '0 180 0',
        text: 'value: REALIARTE 1922\\nExposição virtual · Semana de Arte Moderna; align: center; width: 5; color: #5a3a14; lineHeight: 60' }, sala);
      caixa(sala, '3.8 1.3 ' + (Z - 0.05), [1.4, 2.6, 0.08], '#2b1d14');
      caixa(sala, '3.8 1.3 ' + (Z - 0.1), [1.15, 2.4, 0.05], '#0d0a08');
      criar('a-entity', { position: '3.8 2.75 ' + (Z - 0.12), rotation: '0 180 0',
        text: 'value: SAÍDA; align: center; width: 1.8; color: #5ee08a' }, sala);
    }

    // plantas e esculturas
    planta(sala, -5.3, -6.1, 1.0); planta(sala, 5.3, -6.1, 1.0);
    planta(sala, -5.3, 6.1, 1.0);  planta(sala, 5.3, 6.1, 0.9);
    planta(sala, -3.2, -6.3, 0.8); planta(sala, 3.2, -6.3, 0.8);
    pedestal(sala, -2.4, 5.6, 20); pedestal(sala, 2.4, 5.6, -30);
    banco(sala, 0, 1.2);
  }

  function construirQuadros() {
    var sala = $('sala'), T = { brilho: '#t-brilho' };
    dados.obras.forEach(function (o) {
      var esq = o.parede === 'esquerda';
      var x = esq ? -SALA.x + 0.06 : SALA.x - 0.06;
      var grupo = criar('a-entity', {
        position: x + ' ' + ALTURA_QUADRO + ' ' + o.z,
        rotation: '0 ' + (esq ? 90 : -90) + ' 0'
      }, sala);

      // brilho da luminária na parede
      criar('a-plane', { width: o.largura + 2.4, height: o.altura + 2.4, position: '0 0 -0.045',
        material: 'src: ' + T.brilho + '; shader: flat; transparent: true; blending: additive; depthWrite: false' }, grupo);

      // moldura dourada dupla
      criar('a-box', { width: o.largura + 0.26, height: o.altura + 0.26, depth: 0.08, position: '0 0 0.0',
        material: 'color: #b8892f; metalness: 0.6; roughness: 0.35' }, grupo);
      criar('a-box', { width: o.largura + 0.1, height: o.altura + 0.1, depth: 0.1, position: '0 0 0.0',
        material: 'color: #2b1d14; roughness: 0.7' }, grupo);
      var tela = criar('a-plane', {
        class: 'clicavel', width: o.largura, height: o.altura, position: '0 0 0.055',
        material: 'shader: flat; color: #ffffff'
      }, grupo);
      aplicarTextura(tela, o);

      // luminária de quadro
      var yl = o.altura / 2 + 0.3;
      criar('a-box', { width: 0.04, height: 0.04, depth: 0.28, position: '0 ' + yl + ' 0.14', material: 'color: #b8892f; metalness: 0.7; roughness: 0.3' }, grupo);
      criar('a-cylinder', { rotation: '0 0 90', radius: 0.035, height: Math.min(0.7, o.largura * 0.7), position: '0 ' + yl + ' 0.28',
        material: 'color: #fff2cf; emissive: #ffe2a0; emissiveIntensity: 1' }, grupo);

      // placa de identificação
      var yp = -(o.altura / 2) - 0.34;
      criar('a-box', { width: 0.75, height: 0.22, depth: 0.02, position: '0 ' + yp + ' 0.01', material: 'color: #f3ead9; roughness: 0.8' }, grupo);
      criar('a-entity', { position: '0 ' + yp + ' 0.03',
        text: 'value: ' + o.titulo + '\\n' + o.autor + ', ' + o.ano + '; align: center; width: 1.1; color: #2a2118; wrapCount: 30' }, grupo);

      var pos = new THREE.Vector3(x, ALTURA_QUADRO, o.z);
      quadros.push({ el: grupo, obra: o, pos: pos });

      tela.addEventListener('click', function () {
        tentar({ pos: pos, max: DIST_QUADRO, destino: [esq ? -SALA.x + 3 : SALA.x - 3, o.z] }, function () { abrirObra(o); });
      });
    });
  }

  function distancia(p) {
    var cam = $('camera').object3D, v = new THREE.Vector3();
    cam.getWorldPosition(v);
    return Math.hypot(v.x - p.x, v.z - p.z);
  }

  // se estiver perto, abre; se estiver longe, leva o visitante até lá e abre
  function tentar(alvo, acao) {
    if (!$('painel').hidden || andando) return;
    if (AR) { acao(); return; }
    if (distancia(alvo.pos) <= alvo.max) { acao(); return; }
    toast('Indo até a obra…');
    irAte(alvo.destino[0], alvo.destino[1], acao);
  }

  function irAte(x, z, depois) {
    var p = $('rig').object3D.position, x0 = p.x, z0 = p.z, ini = performance.now(), dur = 1100;
    andando = true;
    (function passo(agora) {
      var k = Math.min(1, (agora - ini) / dur);
      k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      p.x = x0 + (x - x0) * k; p.z = z0 + (z - z0) * k;
      if (k < 1) requestAnimationFrame(passo); else { andando = false; depois(); }
    })(ini);
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
      if (!$('painel').hidden || andando) return;
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
      if (!AR) $('cena').setAttribute('proximidade', '');
    }).catch(function (e) {
      toast('Erro ao carregar as obras. Abra via servidor (http/https).');
      console.error(e);
    });

    if (!AR) iniciarJoystick();
    $('btn-entrar').addEventListener('click', function () {
      $('intro').hidden = true;
      if ($('hud')) $('hud').hidden = false;
    });
    $('painel-fechar').addEventListener('click', fecharPainel);
    $('painel').addEventListener('click', function (e) { if (e.target === this) fecharPainel(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPainel(); });
  }

  // o A-Frame registra o componente 'proximidade' acima; espera a cena estar pronta
  var cena = $('cena');
  if (cena.hasLoaded) iniciar(); else cena.addEventListener('loaded', iniciar);
})();
