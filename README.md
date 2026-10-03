# RealiArte 1922

Sala de museu virtual em 360° (A-Frame / WebGL) com obras ligadas à **Semana de Arte Moderna de 1922**. Funciona no navegador do celular, sem instalar nada.

## Como usar
- **Olhar:** gire o celular (giroscópio) ou arraste a tela. No iPhone, o Safari pede permissão de movimento.
- **Andar:** joystick na tela (celular) ou WASD/setas (computador).
- **Quadros:** toque num quadro. Se estiver longe, você é levado até ele. Abre autor, técnicas, o que inspirou a obra e o que ela simboliza.
- **Parede central:** toque no letreiro "Semana de Arte Moderna" para ler o que foi a Semana e o que a motivou.

## Modo AR (câmera) — `ar.html`
Realidade aumentada com marcador (AR.js), que funciona no **iPhone (Safari)** e no Android.
1. Abra `ar/marcador-realiarte.png` em outra tela (computador) ou imprima.
2. No celular, abra `.../ar.html`, toque em **Abrir câmera** e permita o uso da câmera.
3. Aponte para o marcador, com boa luz. A exposição aparece em miniatura sobre ele.
4. Toque num quadro ou no letreiro para ver as informações.

Obs.: `js/vendor/aframe-1.3.0.min.js` é usado só no modo AR (o AR.js é incompatível com o A-Frame 1.6 da sala 360°).

## Rodar no computador
```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Testar no celular
Giroscópio e câmera exigem **HTTPS**. O jeito mais simples é publicar no GitHub Pages
(Settings → Pages → branch → `/ (root)`) e abrir o link no celular, ou gerar um QR code dele.

## Editar o conteúdo
Todos os textos estão em `data/obras.json` (autor, técnica, simbolismo, posição na parede).
**Os textos são rascunhos: confira com a bibliografia do seu trabalho antes de entregar.**

## Imagens dos quadros
Sem imagem, cada quadro mostra uma arte provisória gerada. As imagens reais precisam ser adicionadas por você. Para usar a reprodução real,
salve o arquivo com o nome indicado em `imagem` no JSON, dentro de `assets/obras/`
(ex.: `assets/obras/abaporu.jpg`). Ele substitui a provisória automaticamente.
Para trabalho acadêmico, cite a fonte da imagem (museu, Wikimedia Commons etc.).

## Estrutura
```
index.html        página e interface (HUD, painel)
js/app.js         sala 3D, quadros, movimento, interação
js/vendor/        A-Frame 1.6.0 (local, funciona sem CDN)
data/obras.json   conteúdo
assets/obras/     imagens dos quadros
```

## Próximos passos possíveis
AR por superfície (WebXR, só Chrome Android), áudio-guia, mais salas, PWA offline.
