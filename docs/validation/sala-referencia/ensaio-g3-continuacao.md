# #28/#35 — continuação controlada de G2 e G3

## Estado e limite

PI escolheu completar os gates e autorizou a preparação em 08/11/2026. Depois, autorizou especificamente uma nova sessão Claude, uma nova thread Codex com um filho e um contêiner Docker descartável. Esse segundo ensaio foi executado; o resultado é **parcial**, não é aceite. As autorizações de fonte foram consumidas. Outra sessão Claude depende de nova autorização específica.

O build de continuação de desenvolvimento fica em `unity/Builds/WarRoom3D-M5-G3/WarRoom3D.exe`. Ele inclui capturadores opt-in e as cenas live e ilustrativa no mesmo executável; o build anterior `WarRoom3D-M5` e seu [manifesto](player-build-manifest.json) permanecem preservados. RNF-01/02 foram repetidos no hash G3; a matriz física G3 está incompleta em 125/150%.

## Escopo do segundo laboratório autorizado

| Fonte | Ação proposta | Limite e prova esperada |
|---|---|---|
| Claude Code 2.1.319 | Uma sessão nova em projeto temporário, skill local temporária chamada diretamente por `/wr3d-35-synthetic`; prompt e resposta sintéticos, conteúdo opt-in | `--restricted`, somente `Skill`, MCP vazio, sem persistência de sessão, até 60 s e US$ 0,10; verificar hook `Skill` **ou** marcador aleatório presente só no corpo da skill e na resposta. Se nenhum aparecer, skill `fail`, sem inferir chamada. |
| Codex CLI 0.166.0 | Uma thread efêmera nova, uma mensagem sintética, exatamente um subagente real | Sandbox somente leitura, shell desativado, MCPs herdados desativados, até 60 s, sem retry automático; verificar vínculo pai/filho e mensagens de usuário/assistente. Tarefa/skill Codex continuam `sem suporte observado` até prova nativa; não gerar evento fictício. |
| Docker local | Um contêiner `node:24-alpine` descartável com uma linha de log sintética | Sem rede, volumes nem portas, raiz somente leitura; validar Compose project, working dir, serviço, isolamento, Request ID e `[REDACTED]`; `docker compose down` e ausência do contêiner no fim. O recurso fica associado explicitamente ao projeto Claude, sem atribuir log a um agente. |
| Serviço/Player | Reproduzir dois spools sanitizados e o log Docker no mesmo serviço local; abrir sala Claude, sala Codex e log na sala Claude | Capturas e JSON do Player comprovam resposta observada de cada provedor, Request ID e segredo redigido. Comando real desabilitado. Cada captura usa build G3, API e token efêmeros; nenhuma sessão pessoal é lida. |

`node service/scripts/issue-35-claude-lab.mjs`, `node service/scripts/issue-35-codex-lab.mjs` e `node service/scripts/issue-35-operational-lab.mjs` sem `--run` só imprimem o plano. Os dois primeiros geram `result.json` em `Logs/issue-35-*`; o terceiro recebe **os caminhos absolutos** desses dois relatórios e do Player G3. Ele aceita a sessão Claude com falha de skill para registrar o diagnóstico, sem aprovar G3. O primeiro contêiner foi criado e removido, e uma falha no seletor de agente interrompeu a captura. `issue-35-replay-captures.mjs` reabriu o banco gravado e capturou chat/log sem criar outra sessão ou contêiner. Cada captura do Player tem limite de 30 s. Os PNGs publicados abaixo foram revistos; spools e SQLite brutos continuam apenas em `Logs/`.

## Execução autorizada e diagnóstico

| Prova no build G3 | Resultado observado |
|---|---|
| Claude Code | Uma sessão nova, 6,5 s, `exit=0`, custo informado US$ 0,0207681, hooks SessionStart/UserPromptSubmit/Stop, duas mensagens `user`/`assistant`. A resposta afirma que `/wr3d-35-synthetic` não estava instalado. `skillHookObserved=false`, marcador do corpo ausente e `roundTrip=false`. [Captura da falha na sala](capturas/issue-35-11-claude-chat-skill-ausente.png). |
| Codex CLI | Uma thread nova, exatamente um subagente com início, turno e conclusão, sem shell, 16 MCPs herdados desativados, três mensagens opt-in. Resposta `WR3D_35_MAIN_ACK` visível na [sala Codex](capturas/issue-35-12-codex-chat-real.png). Tarefa e skill Codex não observadas. |
| Docker local | Um contêiner `node:24-alpine` iniciado e removido, sem rede/volumes/portas, raiz somente leitura. Um log da fonte Docker ficou no projeto Claude com Request ID `req-35-docker` e `token=[REDACTED]`, visível [dentro da sala Claude](capturas/issue-35-13-docker-log-real.png); nenhuma atribuição fictícia a agente. |
| Serviço/Player | Banco do ensaio: três sessões, três agentes, um filho vinculado; conversa HTTP 200 de ambos provedores com consentimento sintético e `receiptIsResponse=false`. Replay do mesmo SQLite no Player G3: três capturas `exit=0`, chat Claude 2 mensagens e falha explícita, chat Codex 3 mensagens e marcador, log 1 resultado com Request ID e redação. Recibo local `Logs/issue-35-operational-d16f2681-5cdc-4a0c-b1d9-9c7304fbe4eb/replay-result.json`. |

A primeira tentativa de captura terminou após o log ser gravado porque o orquestrador procurou `projectId` no registro de agente; a projeção guarda o vínculo pelo `sessionKey`. O seletor foi corrigido e o replay usou o SQLite já gravado, sem ampliar o acesso às fontes. A skill Claude segue `fail`, logo **G3 permanece `partial`**. O próximo roteiro usa um plugin temporário `--plugin-dir`, conforme [documentação oficial](https://code.claude.com/docs/en/plugins/create), com validação estática `claude plugin validate`; nenhuma nova sessão foi iniciada por essa preparação.

## Desempenho e escala no mesmo build G3

O [manifesto G3](player-build-manifest-g3.json) identifica 304 arquivos/175.673.128 bytes e árvore SHA-256 `ecbff36349675059123d9edbe7ab5975bff074125dbe6b191defe7a4968f7b1c`. O [consolidado G3](metricas-player-g3.json) usa três perfis independentes de 600 s com Player visível em 1920×1080, DPI físico 96 (100%) e PresentMon 2.6.0. Cada perfil aceitou/cobriu 7.000/7.000 eventos (6.000 regulares e rajada de 1.000), sem desconexão; validade interna e duração externa passaram.

| Perfil | Propagação p95 | Apresentação p95 / alvo | Intervalos válidos / indisponíveis | Memória pontual |
|---|---:|---:|---:|---:|
| Visual, sala | 272 ms | 3,9186 / 16,67 ms | 420.341 / 47.202 | 712.777.728 bytes |
| Reduzido, sala | 271 ms | 5,4858 / 33,33 ms | 418.236 / 86.177 | 693.043.200 bytes |
| Setor | 268 ms | 2,7315 / 16,67 ms | 472.898 / 24.724 | 700.788.736 bytes |

O p95 externo usa somente intervalos válidos; os indisponíveis não são automaticamente frames perdidos. Tearing e `Hardware: Independent Flip` dominam as séries, e a GPU efetivamente usada não foi isolada. CSVs, sinais, ambiente e relatórios integrais permanecem em `Logs/issue-35-g3-{visual,reduced,sector}-final/`, ignorados pelo Git. A memória é uma leitura próxima ao fim, sem série temporal.

A [matriz física G3](escala-player-g3.json) passou em 100% (DPI 96) para 1920×1080, 1440×900 e 1366×768 no mesmo Player, com envio somente ao adaptador sintético: [1920](capturas/issue-35-g3-dpi100-1920.png), [1440](capturas/issue-35-g3-dpi100-1440.png), [1366](capturas/issue-35-g3-dpi100-1366.png). A API `DisplayConfigGetDeviceInfo` retornou Win32 31 antes de alterar escala, em `DISPLAY1` e `DISPLAY2`, também no Windows PowerShell clássico. O app Configurações não expôs janela acessível à automação. **125/150% no build G3 = `not_run`**; a matriz completa do build anterior não transfere aprovação ao hash G3. `GetDpiForMonitor` confirmou ambos os monitores em 96 DPI (100%) após as tentativas. Nenhum logout ou alteração de registro foi feito.

## Preparação do build validada

- Unity 6000.3.27f1: EditMode 15/15, PlayMode 22/22; build G3 com as duas cenas `Build Finished, Result: Success`, 304 arquivos/175.673.128 bytes, árvore SHA-256 `ecbff36349675059123d9edbe7ab5975bff074125dbe6b191defe7a4968f7b1c`. Manifesto bruto em `Logs/issue-35-continuation-demo-manifest.json`. O novo código condicionado a `DEVELOPMENT_BUILD && !UNITY_EDITOR` compilou no build Windows.
- No **mesmo build G3**, fixture sintética: chat na sala `playerExit=0`, duas mensagens e marcador de resposta visível; log na sala `playerExit=0`, um resultado, Request ID exato e `[REDACTED]`; demo `playerExit=0`, selo `CONCEITO · DADOS ILUSTRATIVOS`, `CommandPresenter` ausente e botão de comando oculto. [Captura da demo](capturas/issue-35-10-demo-quartel.png); recibos brutos: `Logs/issue-35-continuation-chat-demo-build/`, `Logs/issue-35-continuation-logs-demo-build/` e `Logs/issue-35-continuation-demo-synthetic/`.
- `node --check` nos três scripts; dry-run sem fonte real; `git diff --check`. Os resultados acima não aprovam G3 operacional.

## Gates restantes após o laboratório

1. G2: demo sem comando passou de modo sintético no Player candidato; foco/gestos humanos e negativos de mensagem longa/capacidade ausente ainda requerem inspeção no mesmo build, registrando falha e captura se ocorrer. Em 08/11, Player e serviço sintéticos ficaram visíveis, mas a automação do Windows retornou `failed to activate captured window` ao tentar clicar em **Entrar na sala**; nenhum gesto foi contabilizado. O laboratório foi encerrado sem comando ou fonte externa. O modo `WR3D_35_CAPTURE_VIEW=interactive` mantém a fixture por até 180 s para nova inspeção, encerra por `stop.signal` e não produz recibo de aprovação.
2. G3: preencher matriz por provedor com eventos nativos realmente observados. Se skill Claude não virar `skill.observed` no adaptador, registrar separadamente execução da skill e ausência do evento na UI; não declarar G3 completo. Tarefa/skill Codex sem suporte requer decisão explícita do PI se forem obrigatórias.
3. G4: a matriz 125/150% e os gates G2/G3 obrigatórios precisam de prova ou decisão explícita de dispensa; PI revisa arte, fluxo e limites do **mesmo hash** e registra aceite. Até lá, PR #45 permanece rascunho, #28/#35 abertas e nenhuma sala adicional é replicada.

O primeiro roteiro usou a invocação direta descrita na [documentação de skills do Claude Code](https://code.claude.com/docs/en/skills), mas o modo restrito não reconheceu a skill local nesse ensaio. A [referência da CLI](https://code.claude.com/docs/en/cli-reference) documenta `--restricted` e `--plugin-dir`; a [documentação de plugins](https://code.claude.com/docs/en/plugins/create) documenta o prefixo `/plugin:skill` e a validação estática. A hipótese de que o plugin temporário resolva o carregamento ainda não foi testada em sessão.
