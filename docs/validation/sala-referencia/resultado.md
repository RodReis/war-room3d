# #28/#35 — consolidação da sala de referência

## Identidade e estado

Baseline do código: `origin/main` `dc583a643f89428068cf7382b1b96760dda5d2db` (08/11/2026). O [manifesto do build](player-build-manifest.json) identifica 302 arquivos/175.634.292 bytes pelo SHA-256 da árvore `c54d1fcdbf2f9e2dc9cbe9d3feda6853dc2007dba9cd2880bc76be2b1beecab5`. A [medição consolidada](metricas-player.json) associa as três capturas de 600 s à mesma árvore. Commit/PR final e decisão do PI permanecem pendentes; **este documento não é recibo de aceite**. [Roteiro](aceite-player.md).

| Gate | Estado nesta preparação | Evidência já existente | Falta na #35 |
|---|---|---|---|
| G1 — arte | `pass` específico da #29, segundo decisão do PI em 08/11/2026 | [Arte](arte.md), [issue #29](https://github.com/RodReis/war-room3d/issues/29) | Reinspecionar no build final com avatares/HUD/logs, sem alterar aceite anterior. |
| G2 — fluxo controlado | `partial`; cadeia principal, M4 e matriz de layout sintéticos `pass` | [HUD](issue-30-hud.md), [avatares](issue-32-avatares.md), [chat](issue-33-chat.md), [logs](issue-34-logs.md) têm provas anteriores. A [prova #35](#prova-sintetica-da-jornada) executou cadeia no mesmo Player; [M4](#pedido-m4-no-player-final) cobriu prévia/recibo/replay/troca de projeto; [matriz](#matriz-de-resolucao-e-escala-fisica) cobriu o layout. | Demo e gesto/foco humano em todas as combinações. |
| G3 — operação | `partial`; serviço integrado `pass`, Player visual pontual | [#31](issue-31-observacao.md), [#33](issue-33-chat.md) e [#34](issue-34-logs.md) eram provas separadas. O [ensaio #35](#laboratorio-g3-autorizado) reuniu duas novas sessões, um filho e Docker no mesmo serviço/Player. | Skill Claude não invocada, tarefa/skill Codex ausentes; chat/log real não inspecionado na sala por automação de UI sem acesso. Limite aceito da #33 não dispensa G3 geral. |
| G4 — aceite final | `not_run` | G1 aprovado na #29; manifesto, desempenho e escala física medidos no build local. | Decisão explícita do PI sobre este SHA/build e limites G2/G3. |

## Critérios transversais

| Critério | Estado | Base e limite |
|---|---|---|
| RNF-01, 10 eventos/s, p95 ≤2 s | `pass` visual, reduzido e setor | P95 275/434/370 ms; 6.000 eventos regulares e 1.000 de rajada aceitos/cobertos por perfil. |
| RNF-02 visual, 1080p/600 s, apresentação p95 ≤16,67 ms | `pass` nesta medição | PresentMon 2.6.0: p95 2,2521 ms em 599,999 s, janela visível. A [#16](../m2/issue-16-fps.md) permanece reprovada no seu build anterior (24,663 ms). |
| RNF-02 reduzido, 1080p/600 s, apresentação p95 ≤33,33 ms | `pass` nesta medição | PresentMon 2.6.0: p95 5,7297 ms em 599,998 s, janela visível; intervalos indisponíveis separados. |
| RNF-06, 100/125/150% físicos | `pass` na matriz sintética de layout | Windows/monitor do Player em DPI efetivo 96/120/144; 1920×1080 e 1440×900 nos três percentuais e 1366×768 em 100%. [Matriz e capturas](#matriz-de-resolucao-e-escala-fisica). Não substitui gesto/foco humano. |
| Negativos de fonte/comando | `partial` | Perda/recuperação de fonte sem atividade inventada no Player #35; M4 sintético bloqueou replay e troca de projeto. Demo e capacidades indisponíveis ainda requerem consolidação na mesma jornada. |

## Medição visual no Player final

Execução sintética local em 08/11/2026, 1920×1080, Windows em 100% físico (`AppliedDPI=96`), monitor 60 Hz, Unity 6000.3.27f1. GPU listada: AMD Radeon Graphics (driver 32.0.21030.2001) e NVIDIA GeForce RTX 5060 (32.0.16.1692); a GPU efetivamente usada pelo processo não foi isolada nesta prova. O Player ficou visível antes da janela e o PresentMon começou a capturar antes do sinal de início. PIDs e horários estão no ambiente bruto local `Logs/issue-35-visual-rnf03-clean/environment.json`.

O script carregou 30 projetos, 50 agentes distribuídos, 200 recursos e seis slots de sala do quartel. A amostra de apresentação foi feita **no interior de uma sala selecionada**, com 12 agentes nela; isto não mede seis interiores simultâneos na viewport. Aceitou 6.000 atualizações a 10/s por 600 s e 1.000 atualizações adicionais em 10,004 s; todas as 7.000 sequências ficaram cobertas pelo HUD, sem desconexão. Latência regular p50 135 ms, p95 275 ms, p99 440 ms, máximo 1.285 ms; p95 da rajada 254 ms. O frame interno Unity p95 2,3941 ms é contexto, não o critério de RNF-02.

No CSV do PresentMon 2.6.0, 447.892 apresentações do PID do Player caíram na janela; 447.752 tinham intervalo `MsBetweenDisplayChange`, com p50 1,2199 ms, p95 2,2521 ms e p99 3,6373 ms. Houve 140 intervalos indisponíveis, 131 acima de 16,67 ms e máximo 117,2904 ms; não chamar os indisponíveis automaticamente de frames perdidos. O modo dominante foi `Hardware: Independent Flip` (447.736 linhas) com tearing habilitado; a leitura é de mudanças de apresentação nesse modo e não equivale à frequência física de 60 Hz. GPU time médio 1,3393 ms/linha, CPU busy médio 1,1776 ms/linha; working set observado perto do fim 731,9 MB, sem série temporal de memória. A [documentação oficial do CSV do PresentMon](https://github.com/GameTechDev/PresentMon/blob/main/Tools/generate/readme/CSVIntro.md) descreve uma linha por apresentação e tempos em milissegundos. CSV bruto: `Logs/issue-35-visual-rnf03-clean/presentmon.csv` (ignorado pelo Git); resumos locais `performance-600s-1794175760854.summary.json` e `presentmon-summary.json` no mesmo diretório.

## Medição reduzida no mesmo build

Player visível em 1920×1080, Windows físico 100%, monitor 60 Hz e `Reduzir efeitos: sim`. O ensaio final aceitou/cobriu 7.000/7.000 eventos, dos quais 1.000 na rajada de 9,997 s, sem desconexão; RNF-01 regular p50 147 ms, p95 434 ms, p99 938 ms, máximo 1.357 ms, rajada p95 254 ms. PresentMon observou 503.798 apresentações em 599,998 s: 410.673 intervalos válidos com p50 1,1421 ms, p95 5,7297 ms, p99 6,6451 ms e máximo 116,7219 ms. Dos 93.125 intervalos indisponíveis, apenas 491 linhas não tinham horário de exibição; são métricas distintas. O p95 foi calculado sobre intervalos válidos, e o comportamento de tearing (`AllowsTearing=1` na maioria) permanece limite da interpretação. GPU time médio 1,1905 ms/linha, CPU busy médio 1,0462 ms/linha; working set observado perto do fim 692,1 MB. Brutos ignorados pelo Git em `Logs/issue-35-reduced-final/`.

Uma primeira medição externa reduzida também cobriu 600 s e p95 2,3761 ms, mas o gerador sintético abortou ao iniciar a rajada por colisão de horário no mesmo milissegundo. O script passou a gerar instantes monotônicos; um smoke com 1.050/1.050 sequências e a execução final acima passaram. Essa primeira tentativa não é contada como prova completa de RNF-01/rajada.

## Regressão do setor no mesmo build

O perfil `sector` manteve o quartel/setor visível em 1920×1080 e Windows físico 100% por 599,998 s. Aceitou/cobriu 7.000/7.000 eventos sem desconexão, RNF-01 regular p95 370 ms e rajada p95 257 ms. PresentMon observou 493.956 apresentações, 491.008 intervalos válidos, p95 2,221 ms contra alvo 16,67 ms; 2.948 intervalos indisponíveis e 47 acima do alvo. GPU time médio 1,2142 ms/linha, CPU busy médio 1,0624 ms/linha; working set pontual 694,7 MB. A viewport foi a do setor, não seis interiores simultâneos. Brutos em `Logs/issue-35-sector-final/`, hashes e contagens na [medição consolidada](metricas-player.json).

## Prova sintética da jornada

`node service/scripts/issue-35-synthetic-lab.ts` iniciou serviço em memória e Player de desenvolvimento com projeto `LAB #35 · SINTÉTICO` no `slot-03`, dois agentes principais e um filho. O script não fornece credencial de comando nem consulta fonte externa. O Player registrou `status=pass`, `exit=0`, resolução 1280×720 e cinco verificações verdadeiras: seleção/atividade com tarefa, ferramenta e skill **sintéticas**, chat isolado com duas mensagens, log com Request ID e canário redigido, perda/recuperação da fonte sem inventar atividade, retorno ao quartel. [Agente](capturas/issue-35-01-agente-atividade.png), [chat](capturas/issue-35-02-chat.png), [log e evidência](capturas/issue-35-03-log-evidencia.png), [fonte perdida](capturas/issue-35-04-fonte-perdida.png), [retorno](capturas/issue-35-05-retorno-quartel.png). Relatório bruto local: `Logs/issue-35-g2-final/issue-35-result.json`.

O Player usado nessa prova tem `WarRoom3D.exe` SHA-256 `93043e47abfce89ae9d048dbf34108e101edb367150e6203e0bcee27cd5a623d` e `WarRoom3D.Runtime.dll` SHA-256 `423be5170112bb6d5d539959276f6e42dcf70868cbb96539db72f737e1fe817c`. O executável é o carregador Unity e seu hash permaneceu igual em builds distintos; a DLL e os assets também precisam entrar no manifesto final. A prova foi repetida após a recompilação que adicionou a sincronização da medição física.

## Pedido M4 no Player final

`service/scripts/m4-synthetic-lab.mjs` usou o mesmo Player M5, 1280×720, Windows físico 100%, sessão/projeto sintéticos e adaptador falso, sem enviar a provedor real. `WR3D_M4_SYNTHETIC_PROOF=1` produziu `status=pass`, `playerExitCode=0`, uma emissão ao fake, prévia, recibo, contexto longo de permissão, duplo clique sem duplicação, bloqueio em replay e bloqueio ao trocar projeto. Brutos em `Logs/issue-35-m4-m5-100-1280/`; o recibo prova recebimento pelo fake, não resposta do modelo. A ausência de capacidade em outro projeto foi observada, mas não é teste de todas as combinações de capacidades; demo permanece pendente neste build.

## Matriz de resolução e escala física

No Windows, a tela do Player (`DISPLAY2`, à esquerda) foi selecionada em Configurações > Sistema > Tela. A seleção de 100/125/150% foi conferida com `GetDpiForMonitor` sob consciência de DPI por monitor: 96/120/144. Nenhuma sessão foi encerrada. Após os testes, o DPI de ambos os monitores foi verificado em 96 (100%). Cada execução abaixo é do laboratório M4 sintético no **mesmo build**, com `player-result.json` `status=pass`, `exit=0`, prévia/recibo e bloqueios de replay/troca de projeto verdadeiros; não houve envio real.

| Resolução | 100% | 125% | 150% |
|---|---|---|---|
| 1920×1080 | `pass` `Logs/issue-35-m4-m5-100-1920/` | `pass` `Logs/issue-35-m4-m5-125-1920/` | `pass` `Logs/issue-35-m4-m5-150-1920/` |
| 1440×900 | [`pass` captura](capturas/issue-35-06-dpi100-1440x900.png) | [`pass` captura](capturas/issue-35-07-dpi125-1440x900.png) | [`pass` captura](capturas/issue-35-08-dpi150-1440x900.png) |
| 1366×768 | [`pass` captura](capturas/issue-35-09-dpi100-1366x768.png) | Fora da matriz exigida | Fora da matriz exigida |

Os relatórios e demais PNGs de cada célula estão em `Logs/issue-35-m4-m5-{escala}-{largura}/`, ignorados pelo Git. As capturas versionadas mostram a prévia longa e os controles acessíveis; não provam clique/foco manual em cada célula.

## Laboratório G3 autorizado

Autorização do PI em 08/11/2026: duas sessões novas descartáveis Claude/Codex, um subagente Codex, chat sintético opt-in, um contêiner Docker local sem rede/volumes, até 60 s por CLI e teto US$ 0,10 no Claude. Nenhuma sessão pessoal ou conta operacional foi lida. Claude Code 2.1.319: uma sessão nova, `exit=0`, custo informado US$ 0,0196, `SessionStart`/`UserPromptSubmit`/`Stop`, duas mensagens `user`/`assistant` no SQLite; hook local removido. A skill local foi oferecida, mas **não invocada** (`skillObserved=false`). Codex CLI 0.166.0: primeira inspeção expirou antes de `thread/start`; segunda tentativa criou **uma** thread, com sandbox `read-only`, 16 MCPs herdados desativados, turno concluído e três mensagens observadas. Um único ID de filho teve `started`, `turn/started` e `completed`; o aviso de configuração no stderr não impediu a verificação de isolamento. Custo monetário Codex não mensurável pela CLI.

O replay dos dois spools no serviço mostrou 3 sessões, 3 agentes, 1 filho vinculado/encerrado, HTTP 200 e SSE; `taskCount=0` e `invocationCount=0`. No mesmo serviço, um contêiner `node:24-alpine` descartável em `network_mode:none`, sem volume/porta e com raiz somente leitura emitiu um log sintético. O coletor Docker real registrou 1 log, `coverage=covered`, `requestId` exato e `token=[REDACTED]`. As conversas de ambos os provedores responderam HTTP 200 sob opt-in, com papéis e `receiptIsResponse=false`. O Player M5 exibiu no quartel as três fontes `LAB #35 · CLAUDE`, `CODEX`, `DOCKER` da mesma API; a automação de UI não conseguiu acionar os botões por diferença de integridade entre helper e Player. Portanto chat/log **dentro da sala** com essas fontes reais continua `not_run`. O contêiner, Player e proxy foram encerrados e a ausência do contêiner foi verificada. Spools, SQLite e detalhes de processo permanecem em `Logs/issue-35-*` ignorados; publicar só [resumo sanitizado](issue-35-operational-proof.json).

## Validação local e limites de leitura

No código atual, `contracts npm test` passou 15/15, `service npm test` 172/172, `service npm run typecheck` passou, Unity EditMode 15/15 e PlayMode 22/22 passaram. O build Windows M5 Development terminou com `Build Finished, Result: Success` e saída 0 (`Logs/issue-35-build-signal.log`). O gate de performance foi exercitado com um caso positivo, dois negativos e compatibilidade com o relatório legado; `node --check` dos novos scripts e `git diff --check` passaram. CI remota será informada somente no SHA da PR. Os relatórios completos de teste/Unity e CSVs de desempenho estão em `Logs/` local, ignorados pelo Git.

O PresentMon mede intervalos entre mudanças de apresentação observáveis, não um relógio de varredura de 60 Hz; `Hardware: Independent Flip` com tearing domina as três séries. O p95 foi calculado apenas sobre intervalos válidos, com indisponíveis contados à parte. A soma de tempos de GPU/CPU é média por apresentação, não uso total de CPU/GPU. A memória é um ponto observado perto do fim, sem série de vazamento. O número de projetos/recursos/slots é da carga do serviço; a viewport visual selecionou uma sala. Nenhum dado real de cliente/produção entrou na prova.

## Matriz de capacidades observadas

Versões locais ensaiadas na #35: Claude Code 2.1.319 e Codex CLI 0.166.0. `pass` abaixo é pontual nesse laboratório descartável, não comprovação de operação contínua.

| Capacidade | Claude | Codex | Consequência para G3 |
|---|---|---|---|
| Sessão principal | `pass` nova sessão/spool/API | `pass` nova thread/spool/API | Quartel mostrou ambas; sala não inspecionada nessa prova. |
| Subagente e pai | Hook sem ID de pai na fonte verificada | `pass` 1 filho, início/turno/fim vinculados | Claude fica vínculo pendente; não inferir pai. |
| Tarefa | Eventos adaptados #31 | 0 tarefa no ensaio #35 | Obrigatório sem suporte precisa decisão do PI. |
| Ferramenta | Skill não invocada no ensaio #35 | 0 invocação no ensaio #35 | A fixture G2 mostra a UI, mas G3 real segue parcial. |
| Skill | Skill oferecida, `skillObserved=false` | 0 invocação no ensaio #35 | Obrigatório sem suporte precisa decisão do PI. |
| Chat observado | `pass` opt-in, duas mensagens HTTP 200 | `pass` opt-in, três mensagens HTTP 200 | Ida/volta no backend; inspeção na sala com fontes reais `not_run`. |
| Pergunta/permissão real | Indisponível no adaptador #33 | Indisponível no adaptador #33 | PI aceitou limite da #33 e fluxo nativo, sem aprovar G3/G4 geral. |
| Log real correlacionado | Fonte Docker pontual #35 sem agente | Fonte Docker pontual #35 sem agente | Cobertura pontual; Request ID exato, sem atribuição fictícia de sessão. |

## Manifesto final e decisão

| Campo | Valor |
|---|---|
| Commit da PR / merge | `not_run` |
| Unity / pacotes | 6000.3.27f1; pacotes do baseline `dc583a6` |
| Árvore do build / tamanho | SHA-256 `c54d1fcdbf2f9e2dc9cbe9d3feda6853dc2007dba9cd2880bc76be2b1beecab5`; 302 arquivos/175.634.292 bytes; [manifesto](player-build-manifest.json) |
| Executável / Runtime SHA-256 | `93043e47abfce89ae9d048dbf34108e101edb367150e6203e0bcee27cd5a623d` / `423be5170112bb6d5d539959276f6e42dcf70868cbb96539db72f737e1fe817c` |
| Cena / perfil / build | M2 Live e setor, Development, `unity/Builds/WarRoom3D-M5` local |
| Hardware / driver / monitor / escala | AMD Radeon Graphics 32.0.21030.2001; NVIDIA RTX 5060 32.0.16.1692; monitor Player 1920×1080/60 Hz; DPI 96/120/144; GPU usada não isolada |
| Fonte e autorização por ensaio | G2 sintético sem provedor; G3 autorização específica de 08/11/2026 já consumida; [resumo](issue-35-operational-proof.json) |
| Capturas e relatórios | [capturas sintéticas](capturas/), [métricas sanitizadas](metricas-player.json); CSVs/SQLite/spools brutos em `Logs/` ignorados |
| Decisão visual/funcional do PI | `not_run` |

Enquanto G2–G4 estiverem pendentes, #28 e #35 permanecem abertas; não replicar a sala.
