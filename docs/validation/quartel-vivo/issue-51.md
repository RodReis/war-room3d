# #51 — atividade observada por projeto

Data: 11/11/2026. Estado: prova sintética no Player concluída; fonte real e aceite funcional do PI pendentes.

## Contrato e implementação

- `GET /v1/activity` retorna 12 intervalos UTC de cinco minutos por projeto, com unidade `eventos observados`, horário de origem, último sinal e estado de cobertura. `GET /v1/activity/events` abre os eventos normalizados do projeto e intervalo selecionados, com origem e horário, limitado a 100 itens por página.
- Eventos operacionais observados entram na contagem depois da deduplicação pelo store. Backfill entra no intervalo do horário de origem sem atualizar o frescor da fonte. Replay demonstrativo, inferência, heartbeats e animação não entram na série real.
- Zero requer marcador `source.covered` com fonte vinculada, intervalo válido e referência de evidência, cobrindo integralmente todas as fontes vinculadas do projeto. Perda de fonte cria lacuna. Havendo eventos sem cobertura integral, a contagem aparece como parcial (`*`). Ausência de prova de cobertura aparece como lacuna (`—`), nunca como zero.
- O gráfico da vista geral mostra nome, unidade, período, último sinal e legenda textual. Cada célula é selecionável por teclado; o detalhe lista evento, fonte e horário.

## Validação

| Prova | Resultado |
|---|---|
| Contratos JSON Schema | `pass`, 19/19; zero indevido e marcador sem prova rejeitados |
| Serviço Node 24: typecheck e suíte completa | `pass`, 185/185 |
| Unity PlayMode `ActivityChartTests` | `pass`, 1/1; duas séries, zero, lacuna e abertura por teclado |
| Build Windows Development, Unity 6000.3.27f1 | `pass`, 175.730.048 bytes, `Logs/issue-51-build-windows-v5.log` (local) |
| Player 1280×720 com laboratório sintético de dois projetos | `pass`, API=tela em 24/24 intervalos; uma ação só em Atlas, zero em Orion, lacunas e detalhe com fonte/horário; `Logs/issue-51-player-v5/resultado.txt` (local) |

SHA-256 do `Builds/WarRoom3D-Quartel/WarRoom3D.exe` testado: `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D`.
SHA-256 de `WarRoom3D_Data/Managed/WarRoom3D.Runtime.dll`: `E201F070632481B7E07B2E3AF24D6EED5FFDF4C7FEB90BFE300C780C5B851F58`.

## Evidência visual sintética

- [Duas séries, zero e lacuna](capturas/issue-51-atividade.png).
- [Detalhe do evento com origem e horário](capturas/issue-51-detalhe.png).

As imagens são do laboratório local `issue51-player-lab.ts`, sem contas, prompts, respostas ou comandos reais. A primeira captura do Player passou na comparação automática, mas revelou corte das linhas e legenda em 720p; o painel foi ajustado e recapturado no build final acima. O build intermediário iniciado em sandbox travou no IPC de licenciamento da Unity; a recompilação no contexto do usuário concluiu normalmente.

## Limites

A comparação no Player usa apenas projetos, eventos e fontes sintéticos. Ela prova o isolamento da projeção e a correspondência API/tela, mas não prova que uma ação real do ArenaHub ou de outro projeto chegou a este gráfico. Os hooks Claude Code existentes não emitem `source.covered`; sem essa evidência de cobertura, silêncio real deve continuar como lacuna. O hook reversível autorizado no ArenaHub para a janela de trabalho do usuário permanece ativo, sem captura de conteúdo bruto; não foi ligado ao laboratório da #51. Aceite funcional do PI permanece separado da integração técnica.
