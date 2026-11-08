# #28/#35 — continuação controlada de G2 e G3

## Estado e limite

PI escolheu completar os gates e autorizou a **preparação** em 08/11/2026. Esta página prepara novo ensaio; não é recibo de execução nem aceite. A autorização anterior para Claude, Codex e Docker foi consumida no ensaio registrado em [resultado.md](resultado.md). A execução de novas fontes requer autorização específica do PI, solicitada separadamente.

O build de continuação de desenvolvimento fica em `unity/Builds/WarRoom3D-M5-G3/WarRoom3D.exe`. Ele inclui capturadores opt-in e as cenas live e ilustrativa no mesmo executável; o build anterior `WarRoom3D-M5` e seu [manifesto](player-build-manifest.json) permanecem preservados. As três medições de 600 s e a matriz física pertencem ao build anterior. Se o build G3 virar candidato final, repetir RNF-01/02 e matriz no hash dele antes de G4.

## Escopo do novo laboratório proposto

| Fonte | Ação proposta | Limite e prova esperada |
|---|---|---|
| Claude Code 2.1.319 | Uma sessão nova em projeto temporário, skill local temporária chamada diretamente por `/wr3d-35-synthetic`; prompt e resposta sintéticos, conteúdo opt-in | `--restricted`, somente `Skill`, MCP vazio, sem persistência de sessão, até 60 s e US$ 0,10; verificar hook `Skill` **ou** marcador aleatório presente só no corpo da skill e na resposta. Se nenhum aparecer, skill `fail`, sem inferir chamada. |
| Codex CLI 0.166.0 | Uma thread efêmera nova, uma mensagem sintética, exatamente um subagente real | Sandbox somente leitura, shell desativado, MCPs herdados desativados, até 60 s, sem retry automático; verificar vínculo pai/filho e mensagens de usuário/assistente. Tarefa/skill Codex continuam `sem suporte observado` até prova nativa; não gerar evento fictício. |
| Docker local | Um contêiner `node:24-alpine` descartável com uma linha de log sintética | Sem rede, volumes nem portas, raiz somente leitura; validar Compose project, working dir, serviço, isolamento, Request ID e `[REDACTED]`; `docker compose down` e ausência do contêiner no fim. O recurso fica associado explicitamente ao projeto Claude, sem atribuir log a um agente. |
| Serviço/Player | Reproduzir dois spools sanitizados e o log Docker no mesmo serviço local; abrir sala Claude, sala Codex e log na sala Claude | Capturas e JSON do Player comprovam resposta observada de cada provedor, Request ID e segredo redigido. Comando real desabilitado. Cada captura usa build G3, API e token efêmeros; nenhuma sessão pessoal é lida. |

`node service/scripts/issue-35-claude-lab.mjs`, `node service/scripts/issue-35-codex-lab.mjs` e `node service/scripts/issue-35-operational-lab.mjs` sem `--run` só imprimem o plano. Depois da autorização específica, os dois primeiros geram `result.json` em `Logs/issue-35-*`; o terceiro recebe **os caminhos absolutos** desses dois relatórios e do Player G3. O terceiro exige `roundTrip` de ambos e skill Claude observada antes de criar o contêiner. Cada captura do Player tem limite de 30 s, em processos separados no mesmo build e serviço. Nenhum relatório bruto ou PNG com conteúdo de chat sai de `Logs/` sem revisão de redação e proveniência.

## Preparação já validada

- Unity 6000.3.27f1: EditMode 15/15, PlayMode 22/22; build G3 com as duas cenas `Build Finished, Result: Success`, 304 arquivos/175.673.128 bytes, árvore SHA-256 `ecbff36349675059123d9edbe7ab5975bff074125dbe6b191defe7a4968f7b1c`. Manifesto bruto em `Logs/issue-35-continuation-demo-manifest.json`. O novo código condicionado a `DEVELOPMENT_BUILD && !UNITY_EDITOR` compilou no build Windows.
- No **mesmo build G3**, fixture sintética: chat na sala `playerExit=0`, duas mensagens e marcador de resposta visível; log na sala `playerExit=0`, um resultado, Request ID exato e `[REDACTED]`; demo `playerExit=0`, selo `CONCEITO · DADOS ILUSTRATIVOS`, `CommandPresenter` ausente e botão de comando oculto. [Captura da demo](capturas/issue-35-10-demo-quartel.png); recibos brutos: `Logs/issue-35-continuation-chat-demo-build/`, `Logs/issue-35-continuation-logs-demo-build/` e `Logs/issue-35-continuation-demo-synthetic/`.
- `node --check` nos três scripts; dry-run sem fonte real; `git diff --check`. Os resultados acima não aprovam G3 operacional.

## Gates restantes após o laboratório

1. G2: demo sem comando passou de modo sintético no Player candidato; foco/gestos humanos e negativos de mensagem longa/capacidade ausente ainda requerem inspeção no mesmo build, registrando falha e captura se ocorrer. Em 08/11, Player e serviço sintéticos ficaram visíveis, mas a automação do Windows retornou `failed to activate captured window` ao tentar clicar em **Entrar na sala**; nenhum gesto foi contabilizado. O laboratório foi encerrado sem comando ou fonte externa. O modo `WR3D_35_CAPTURE_VIEW=interactive` mantém a fixture por até 180 s para nova inspeção, encerra por `stop.signal` e não produz recibo de aprovação.
2. G3: preencher matriz por provedor com eventos nativos realmente observados. Se skill Claude não virar `skill.observed` no adaptador, registrar separadamente execução da skill e ausência do evento na UI; não declarar G3 completo. Tarefa/skill Codex sem suporte requer decisão explícita do PI se forem obrigatórias.
3. G4: repetir desempenho/matriz no **mesmo hash** do build candidato; PI revisa arte, fluxo e limites e registra aceite explícito. Até lá, PR #45 permanece rascunho, #28/#35 abertas e nenhuma sala adicional é replicada.

O caminho de invocação direta da skill segue a [documentação oficial do Claude Code](https://code.claude.com/docs/en/skills): `/nome-da-skill` no começo do prompt. O ensaio anterior pediu a invocação em texto comum e não observou a skill; isso motivou a correção do roteiro, não altera o resultado anterior.
