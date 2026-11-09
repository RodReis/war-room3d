# #28/#35 — consolidação da sala de referência

> Atualização de 09/11/2026: o Player de árvore `0640cb73a624f398e2807e4caa66618faefc3e2937f5c73a374df46c5eb1fa58` ([manifesto](player-build-manifest-final.json)) teve G2 humano, G3 pontual e escala física 7/7 confirmados. Após reinício autorizado do Windows, RNF-01/02 passaram nos três perfis de 600 s do mesmo executável; [métricas atuais](metricas-player-final.json). O PI respondeu **“Aprovar G4 e integrar PR”** para esse hash, arte, fluxo e limites descritos abaixo. A integração técnica é verificada separadamente no PR #45; esta aprovação não prova operação contínua nem amplia a dispensa Codex. As medições sobre `e997da1c…18f087` são histórico do candidato anterior, sem transferência ao hash atual.

## Identidade e estado

Baseline do código: `origin/main` `dc583a643f89428068cf7382b1b96760dda5d2db` (08/11/2026). O [primeiro build](player-build-manifest.json) tinha árvore `c54d1fcd…ecab5`; o candidato atual tem 304 arquivos/175.678.228 bytes e árvore `0640cb73…eb1fa58` no [manifesto final](player-build-manifest-final.json). A [medição anterior](metricas-player-candidato-e997.json) pertence ao hash `e997da1c…18f087`; [a medição atual](metricas-player-final.json) pertence ao hash `0640cb73…eb1fa58`. A decisão G4 do PI é específica desse executável e dos limites do [roteiro](aceite-player.md); merge, CI da `main` e estado das issues são registrados separadamente no [PR #45](https://github.com/RodReis/war-room3d/pull/45) e nas issues.

| Gate | Estado no candidato `0640cb73…eb1fa58` | Evidência | Falta na #35 |
|---|---|---|---|
| G1 — arte | `pass` específico da #29, segundo decisão do PI em 08/11/2026 | [Arte](arte.md), [issue #29](https://github.com/RodReis/war-room3d/issues/29) | Reinspecionar no build final com avatares/HUD/logs, sem alterar aceite anterior. |
| G2 — fluxo controlado | `pass` pontual, sintético, com revisão humana assistida | Automação `Logs/issue-35-v2-g2-auto/`; PI confirmou seleção por lista/avatar, vínculo pai/filho, Tab, roda sobre painel, Esc, contexto longo M4, capacidade ausente e fonte perdida/recuperada. Arrasto direito iniciado no painel permaneceu bloqueado após restauração da câmera; logs distinguem giros iniciados na cena. Demo sem comando passou no retry `Logs/issue-35-v2-demo-retry/`. | Registrar decisão G4 sobre esse conjunto e seus limites. |
| G3 — operação | `pass` pontual no hash atual, **com dispensa PI para tarefa/skill Codex CLI 0.166.0** | [Recibo do replay atual](issue-35-replay-proof-current.json): skill/chat Claude, chat Codex e log Docker no Player; quatro capturas com saída 0 e sem exceção. | Operação contínua e novas versões continuam fora da prova. |
| G4 — aceite final | `pass` por decisão expressa do PI em 09/11/2026 | PI aprovou arte e fluxo no Player de árvore `0640cb73…eb1fa58`, matriz 7/7, [RNF-01/02 de 600 s](metricas-player-final.json) e limites de G3/intervalos/viewport. | Integração técnica no PR #45 e encerramento do card são fatos separados; operação contínua não foi ensaiada. |

## Critérios transversais

| Critério | Estado | Base e limite |
|---|---|---|
| RNF-01, 10 eventos/s, p95 ≤2 s | `pass` visual/reduzido/setor, p95 275/278/285 ms no hash atual | [Resumo atual](metricas-player-final.json): cada perfil cobriu 7.000/7.000 eventos em 600 s, sem desconexão; validade interna completa. Brutos locais `Logs/issue-35-v11-rnf-{visual,reduced,sector}/`. Hash de árvore conferido novamente após os ensaios. |
| RNF-02 visual/reduzido, 1080p/600 s | `pass` visual/reduzido/setor, p95 apresentado 2,5457/2,4871/1,9868 ms | PresentMon 2.6.0 após reinício: três CSVs completos, duração 599,999/599,997/599,998 s, sem aviso de perda ETW. Alvos 16,67/33,33/16,67 ms. Intervalos indisponíveis 39.405/15.614/5.758, separados dos válidos; p95 calcula somente intervalos válidos. [Medição](metricas-player-final.json). A [#16](../m2/issue-16-fps.md) permanece reprovada no seu build anterior (24,663 ms). |
| RNF-06, 100/125/150% físicos | `pass` nas sete células do hash atual | [Matriz final](escala-player-final.json): DPI 96/120/144 em DISPLAY2; 1920×1080 e 1440×900 nas três escalas, mais 1366×768 em 100%. DISPLAY2 restaurado a 96 DPI. |
| Negativos de fonte/comando | `pass` pontual no hash atual | Perda/recuperação de fonte com causa e estado explícitos, sem inventar atividade; M4 sintético bloqueou replay/troca de projeto e projeto sem capacidade; demo não expôs comando. |

## Provas do candidato atual — 09/11/2026

O build Windows Development em `unity/Builds/WarRoom3D-M5-Final/` tem 304 arquivos/175.678.228 bytes, árvore `0640cb73…eb1fa58`. `Logs/issue-35-pointer-diagnostic-build.log` terminou com `Build Finished, Result: Success`; PlayMode `Logs/issue-35-manual-fix-playmode-2.xml` passou 22/22. A fixture G2 `Logs/issue-35-v2-g2-auto/issue-35-result.json` passou 5/5 verificações com saída 0, incluindo filho, chat, log/evidência, perda/recuperação e retorno. [Agente e filho](capturas/issue-35-31-v2-g2-agente.png) e [log sintético](capturas/issue-35-32-v2-g2-log.png). A primeira captura demo expirou em 30 s sem relatório; a repetição `Logs/issue-35-v2-demo-retry/demo-result.json` passou, com selo ilustrativo e comandos ausentes. [Demo](capturas/issue-35-33-v2-demo.png).

Em revisão humana assistida neste build, o PI confirmou: entrada na sala; seleção de subagente por lista e avatar com vínculo ao pai; foco Tab visível; roda sobre painel sem mover câmera; Esc fechando detalhe e depois retornando ao quartel; pedido de permissão M4 com contexto longo legível após selecionar a ação; projeto sem capacidade com fluxo nativo e envio bloqueado; fonte Codex indisponível com sessão incerta, seguida de fonte ativa sem afirmar recuperação da sessão; sem duplicação. No arrasto direito, o diagnóstico opt-in `WR3D_POINTER_DEBUG=1` registrou `startHit=true` e `dragging=false` para pressões dentro do painel, enquanto giros foram iniciados na cena. Após “Restaurar câmera”, o PI repetiu o gesto dentro da linha do subagente e confirmou câmera parada. Não se publica a captura pessoal do PI; este relato usa as respostas e o log local `Logs/issue-35-pointer-diagnostic/player.log`.

A [matriz](escala-player-final.json) do mesmo build passou 7/7 células: 1920×1080 e 1440×900 em 100/125/150% físicos, mais 1366×768 em 100%. O PI ajustou DISPLAY2, `GetDpiForMonitor` confirmou 96/120/144 DPI, e ambos os monitores terminaram em 96. Cada célula usou apenas M4 sintético e produziu `player-result.json` `pass`/saída 0. [Contexto em 125%](capturas/issue-35-34-v2-dpi125.png) e [150%](capturas/issue-35-35-v2-dpi150.png). O laboratório sem capacidade manteve zero prévias, submissões e envios.

O [replay G3 no hash atual](issue-35-replay-proof-current.json) copiou apenas o SQLite e leu os spools sintéticos opt-in do ensaio de 08/11; não criou sessão Claude/Codex nem contêiner. Quatro capturas do Player saíram com código 0, sem exceção: [chat Claude](capturas/issue-35-36-v2-claude-chat.png) com 2 mensagens e resposta, [skill Claude](capturas/issue-35-37-v2-claude-skill.png) observada no detalhe, [chat Codex](capturas/issue-35-38-v2-codex-chat.png) com 3 mensagens e filho vinculado já encerrado, [log Docker](capturas/issue-35-39-v2-docker-log.png) com Request ID exato e segredo redigido. Recibo bruto local `Logs/issue-35-claude-plugin-replay-2c293a02-ee25-4476-abc7-e5f8e96c26f2/result.json`. A dispensa de tarefa/skill Codex vale somente para CLI 0.166.0; não inferir operação contínua.

Primeira medição elevada do candidato atual: smoke de 5 s passou 1.050/1.050 em `Logs/issue-35-v2-smoke-elevated/`; o perfil visual de 600 s recebeu 6.000 eventos regulares e gravou CSV, mas o Player encerrou com código 0 sem `trace.jsonl` nem relatório final. `m2-performance-proof.mjs` falhou ao ler o arquivo ausente (`ENOENT`); o runner interrompeu reduzido/setor. O diagnóstico independente de 120 s no mesmo hash passou 2.200/2.200, duração amostrada 138 s, conexão e validade completas em `Logs/issue-35-v2-diagnostic-120/`. **Nenhuma dessas execuções aprova RNF-01/02 de 600 s**. A causa do encerramento incompleto de 600 s segue indeterminada; não reaproveitar o CSV como prova isolada.

O ensaio seguinte perdeu 30.302.123 eventos ETW no visual de 600 s; outro smoke perdeu 3.065.808 eventos em 5 s, ambos sem CSV válido. O PI informou que não fechou as janelas nem viu alerta no encerramento simultâneo de um ensaio intermediário; a causa desse encerramento continua indeterminada. Com autorização do PI, o Windows reiniciou às 16:00:54 (hora de São Paulo). O [lançador com UAC](../../TESTING.md) executou `Logs/issue-35-v11-rnf`: smoke 5 s `pass` (1.050/1.050, apresentação p95 1,9671 ms), seguido de visual/reduzido/setor 600 s cada, `state=complete`. Os três `presentmon.err.txt` estão vazios, e os CSVs e resumos brutos ficaram apenas em `Logs/`. A árvore do Player permaneceu `0640cb73…eb1fa58` após o ensaio.

| Perfil atual | Propagação p95 | Apresentação p95 / alvo | Apresentações / intervalos válidos / indisponíveis | Memória pontual |
|---|---:|---:|---:|---:|
| Visual | 275 ms | 2,5457 / 16,67 ms | 469.331 / 429.926 / 39.405 | 726.863.872 bytes |
| Reduzido | 278 ms | 2,4871 / 33,33 ms | 476.031 / 460.417 / 15.614 | 352.657.408 bytes |
| Setor | 285 ms | 1,9868 / 16,67 ms | 513.377 / 507.619 / 5.758 | 690.061.312 bytes |

`Hardware: Independent Flip` e tearing predominam; esses intervalos medem mudanças de apresentação observáveis, sem equivaler à varredura física de 60 Hz. CPU/GPU estão na [medição sanitizada](metricas-player-final.json) como média por apresentação; memória é um ponto próximo ao fim, sem série de vazamento. A viewport visual contém uma sala selecionada, não seis interiores simultâneos. Nenhum dado real de cliente ou produção entrou na prova.

## Histórico de medições do candidato anterior

As medições até a seção "Candidato anterior identificado" abaixo foram feitas em builds anteriores. Permanecem como trilha de auditoria e não validam o hash atual.

### Medição visual no Player anterior

Execução sintética local em 08/11/2026, 1920×1080, Windows em 100% físico (`AppliedDPI=96`), monitor 60 Hz, Unity 6000.3.27f1. GPU listada: AMD Radeon Graphics (driver 32.0.21030.2001) e NVIDIA GeForce RTX 5060 (32.0.16.1692); a GPU efetivamente usada pelo processo não foi isolada nesta prova. O Player ficou visível antes da janela e o PresentMon começou a capturar antes do sinal de início. PIDs e horários estão no ambiente bruto local `Logs/issue-35-visual-rnf03-clean/environment.json`.

O script carregou 30 projetos, 50 agentes distribuídos, 200 recursos e seis slots de sala do quartel. A amostra de apresentação foi feita **no interior de uma sala selecionada**, com 12 agentes nela; isto não mede seis interiores simultâneos na viewport. Aceitou 6.000 atualizações a 10/s por 600 s e 1.000 atualizações adicionais em 10,004 s; todas as 7.000 sequências ficaram cobertas pelo HUD, sem desconexão. Latência regular p50 135 ms, p95 275 ms, p99 440 ms, máximo 1.285 ms; p95 da rajada 254 ms. O frame interno Unity p95 2,3941 ms é contexto, não o critério de RNF-02.

No CSV do PresentMon 2.6.0, 447.892 apresentações do PID do Player caíram na janela; 447.752 tinham intervalo `MsBetweenDisplayChange`, com p50 1,2199 ms, p95 2,2521 ms e p99 3,6373 ms. Houve 140 intervalos indisponíveis, 131 acima de 16,67 ms e máximo 117,2904 ms; não chamar os indisponíveis automaticamente de frames perdidos. O modo dominante foi `Hardware: Independent Flip` (447.736 linhas) com tearing habilitado; a leitura é de mudanças de apresentação nesse modo e não equivale à frequência física de 60 Hz. GPU time médio 1,3393 ms/linha, CPU busy médio 1,1776 ms/linha; working set observado perto do fim 731,9 MB, sem série temporal de memória. A [documentação oficial do CSV do PresentMon](https://github.com/GameTechDev/PresentMon/blob/main/Tools/generate/readme/CSVIntro.md) descreve uma linha por apresentação e tempos em milissegundos. CSV bruto: `Logs/issue-35-visual-rnf03-clean/presentmon.csv` (ignorado pelo Git); resumos locais `performance-600s-1794175760854.summary.json` e `presentmon-summary.json` no mesmo diretório.

### Medição reduzida no mesmo build

Player visível em 1920×1080, Windows físico 100%, monitor 60 Hz e `Reduzir efeitos: sim`. O ensaio final aceitou/cobriu 7.000/7.000 eventos, dos quais 1.000 na rajada de 9,997 s, sem desconexão; RNF-01 regular p50 147 ms, p95 434 ms, p99 938 ms, máximo 1.357 ms, rajada p95 254 ms. PresentMon observou 503.798 apresentações em 599,998 s: 410.673 intervalos válidos com p50 1,1421 ms, p95 5,7297 ms, p99 6,6451 ms e máximo 116,7219 ms. Dos 93.125 intervalos indisponíveis, apenas 491 linhas não tinham horário de exibição; são métricas distintas. O p95 foi calculado sobre intervalos válidos, e o comportamento de tearing (`AllowsTearing=1` na maioria) permanece limite da interpretação. GPU time médio 1,1905 ms/linha, CPU busy médio 1,0462 ms/linha; working set observado perto do fim 692,1 MB. Brutos ignorados pelo Git em `Logs/issue-35-reduced-final/`.

Uma primeira medição externa reduzida também cobriu 600 s e p95 2,3761 ms, mas o gerador sintético abortou ao iniciar a rajada por colisão de horário no mesmo milissegundo. O script passou a gerar instantes monotônicos; um smoke com 1.050/1.050 sequências e a execução final acima passaram. Essa primeira tentativa não é contada como prova completa de RNF-01/rajada.

### Regressão do setor no mesmo build

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
| Sessão principal | `pass` nova sessão/spool/API | `pass` nova thread/spool/API | Ambas as salas inspecionadas no Player final. |
| Subagente e pai | Hook sem ID de pai na fonte verificada | `pass` 1 filho, início/turno/fim vinculados | Claude fica vínculo pendente; não inferir pai. |
| Tarefa | Sem tarefa nova no ensaio da skill | 0 tarefa no ensaio #35 | PI dispensou tarefa Codex **somente na CLI 0.166.0**; sem evento inventado. |
| Ferramenta | Skill `/wr3d-35:synthetic` executada; `PreToolUse Skill` não foi emitido | 0 invocação no ensaio #35 | Sem afirmar ferramenta nativa onde o hook não a expôs. |
| Skill | `pass` `UserPromptExpansion` → `skill.observed` → detalhe do agente no Player | 0 invocação no ensaio #35 | PI dispensou skill Codex **somente na CLI 0.166.0**. |
| Chat observado | `pass` opt-in, duas mensagens HTTP 200 e Player | `pass` opt-in, três mensagens HTTP 200 e Player | Resposta visível separada do recibo; laboratório pontual. |
| Pergunta/permissão real | Indisponível no adaptador #33 | Indisponível no adaptador #33 | PI aceitou limite da #33 e fluxo nativo, sem aprovar G3/G4 geral. |
| Log real correlacionado | Fonte Docker pontual #35 sem agente | Fonte Docker pontual #35 sem agente | Cobertura pontual; Request ID exato, sem atribuição fictícia de sessão. |

## Manifesto do primeiro candidato e decisão

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

G4 foi aprovado apenas para a sala de referência e este build. Integração técnica e estado das issues devem ser confirmados no GitHub; eventual replicação de salas é trabalho posterior, fora desta fatia.

## Histórico da continuação anterior

O PI escolheu completar os gates e autorizou preparar um [novo ensaio G2/G3](ensaio-g3-continuacao.md). O build de desenvolvimento G3 foi gerado em diretório separado e passou compilação Windows; chat, log e demonstração sem comando passaram no Player com fixture sintética **no mesmo build G3**. Após autorização específica, o segundo ensaio criou uma sessão Claude, uma thread Codex com um filho e um contêiner Docker descartável. O Player G3 exibiu os dois chats e o log Docker; a skill local Claude não carregou. [Recibo sanitizado](issue-35-operational-proof-g3.json). Uma [sessão Claude adicional](issue-35-claude-plugin-proof-g3.json), autorizada separadamente, executou a skill por plugin temporário, mas o hook usado então não gerou `skill.observed`. Após corrigir o capturador e obter nova autorização, [outro ensaio Claude](issue-35-claude-skill-proof-final.json) comprovou `UserPromptExpansion` até `skill.observed` no serviço e no Player daquele candidato. [Capturas e diagnóstico](ensaio-g3-continuacao.md). Tarefa/skill Codex não foram observadas; **o PI dispensou essas duas capacidades apenas para Codex CLI 0.166.0**. O replay naquele build exibiu skill Claude, chat Claude/Codex e log Docker sem exceções. RNF-01/02 foram [repetidos no hash G3](metricas-player-g3.json) e passaram nos três perfis de 600 s; a [matriz física G3](escala-player-g3.json) passou em 100%, mas 125/150% ficaram `not_run` por erro 31 da API do Windows antes da alteração. O [manifesto G3](player-build-manifest-g3.json) e o [manifesto do candidato anterior](metricas-player-candidato-e997.json) distinguem os builds. Naquele candidato anterior, desempenho passou nos três perfis de 600 s, e a escala física passou a 100% mas ficou `not_run` a 125/150%. Essas lacunas foram reavaliadas no candidato atual, descrito no início deste documento.

## Candidato anterior identificado (`e997da1c…18f087`)

| Campo | Valor |
|---|---|
| Código da PR | [PR #45](https://github.com/RodReis/war-room3d/pull/45) em rascunho na branch `feat/35-player-acceptance`; HEAD e checks atuais no PR |
| Unity / perfil / cenas | 6000.3.27f1, Development, M2 Live e Quartel M0; pacotes do projeto no baseline `dc583a6` |
| Build local | Candidato anterior em `unity/Builds/WarRoom3D-M5-Final/WarRoom3D.exe`; 304 arquivos/175.674.363 bytes; árvore SHA-256 `e997da1cacd98abfe21b5ff54f1c60e65431fce6a4726599a9e625f7c218f087` ([métricas históricas](metricas-player-candidato-e997.json)); executável substituído pelo candidato atual. |
| Executável / Runtime SHA-256 | `93043e47abfce89ae9d048dbf34108e101edb367150e6203e0bcee27cd5a623d` / `29faf2a8d1250709cc1f8782f203a6f829b8a936e2972fe48650f8edafc5b44d` |
| Hardware / monitor | Ryzen 7 9800X3D, 31,1 GiB RAM; Radeon 32.0.21030.2001 e RTX 5060 32.0.16.1692; Player 1920×1080/60 Hz no ensaio visual; GPU usada não isolada |
| Dados / fontes | Carga de desempenho sintética; Claude Code 2.1.319 com skill e chat sintéticos opt-in, Codex 0.166.0 e Docker descartável nos ensaios autorizados separados. Autorizações consumidas; sem operação contínua. |
| Escala / resolução / desempenho | [Hash anterior](metricas-player-candidato-e997.json): visual/reduzido/setor 600 s, 7.000/7.000 eventos cada, propagação p95 270/271/269 ms e apresentação p95 2,2566/1,7119/7,5246 ms, todos abaixo dos alvos. Naquele build, 100% físico `pass` em 1920/1440/1366; 125/150% `not_run`. |
| Aceite PI | G1 específico da #29; G3 pontual `pass` com dispensa Codex CLI 0.166.0; G2 `partial`; G4 `not_run`. |
