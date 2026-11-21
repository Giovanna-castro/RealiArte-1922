# Radar de cancelamentos e atrasos de voo (Voo Direito)

Lê os painéis **oficiais e gratuitos** dos aeroportos, detecta cancelamentos, atrasos grandes, desvios e eventos em massa, e gera um aviso curto por e-mail. Roda de hora em hora por uma rotina agendada na nuvem.

## Cobertura (21/11/2026)

| Aeroporto | Painel | Atraso medido? |
|---|---|---|
| Guarulhos (SBGR) | GRU Airport | sim |
| Galeão (SBGL) | RIOgaleão | parcial |
| Brasília (SBBR) | Inframerica | sim, com nº de passageiros |
| Salvador (SBSV) | Vinci | sim |
| Fortaleza (SBFZ), Porto Alegre (SBPA) | Fraport | sim |
| Florianópolis (SBFL) | Zurich | sim |
| Curitiba, Goiânia, Navegantes, São Luís, Teresina | Motiva | não (só status) |

Fora: Congonhas, Recife, João Pessoa, Maceió, Aracaju (Aena bloqueia), Confins, Santos Dumont, Viracopos, Vitória, Manaus, Natal, Cuiabá, Belém. Voos *para* esses aeroportos ainda são vistos nos painéis acima.

Limitação: os painéis só mostram voos de agora em diante; um voo some depois do horário. O radar vê o que estiver listado no momento da rodada.

## O que conta como evento (`config/regras.json`)

- Cancelamento de voo de passageiros (cargueiros são excluídos).
- Atraso ≥ 3h (estimado ou real × previsto); "sem previsão" há mais de 3h conta como atraso mínimo.
- Desvio (alternado).
- Evento em massa: ≥ 5 cancelamentos ou atrasos ≥ 2h no mesmo aeroporto em 2h.

Cada evento traz: companhia, voo, rota, previsto/estimado, atraso, fontes com URL e hora da consulta, METAR do horário (aviationweather.gov, que retransmite o METAR do DECEA), próximo voo da mesma companhia na mesma rota e nota de 0 a 10. Itens sem fonte pública aparecem como "não verificável em fonte pública".

## Arquivos

- `config/aeroportos.json` — lista editável de aeroportos (prioridade, fonte, coordenadas).
- `config/regras.json` — limites e notas mínimas.
- `dados/historico.json` — eventos já avisados (evita repetir; só reavisa se piorar).
- `saida/AAAA-MM-DD/eventos.jsonl` — registro completo de cada evento novo ou piorado.
- `saida/alerta.md`, `saida/ultima_rodada.md` — resultado da última rodada (não versionados).

## Rodar à mão

```bash
node radar-voos/src/radar.js
```

```bash
node radar-voos/teste/teste_eventos.js
```

`--sem-historico` roda sem ler nem gravar o histórico.
