# Histórico de estado

Este arquivo guarda fatos datados que saem do resumo curto de [STATUS](STATUS.md). Não converter um plano em entrega técnica. Cada registro futuro deve citar issue, PR, SHA remoto, validação executada e aceite do PI, quando houver.

## 07/11/2026 — Aceite funcional M4 com limites e encerramento da issue #5

- O PI respondeu “Aceito com esses limites; pode encerrar a #5”. [Comentário de aceite](https://github.com/RodReis/war-room3d/issues/5#issuecomment-6715930879) e estado remoto `closed/completed`, `closed_at=2026-11-08T02:01:56Z` (23h01 de 07/11, São Paulo), conferidos. Entrega técnica permanece na PR #24, SHA `75ad486`.
- Publicação do aceite: [PR #25](https://github.com/RodReis/war-room3d/pull/25), HEAD `1a58fcd169f124a070fd01bf5f18687e23f2baf0`, integrada por squash em `2ffdfc69abab38e41c4eb8d6653bd32048e804fe`, `mergedAt=2026-11-08T02:04:54Z`. [CI da PR](https://github.com/RodReis/war-room3d/actions/runs/42436910742): Contratos `SUCCESS` em 8 s e Serviço `SUCCESS` em 17 s. [CI da integração](https://github.com/RodReis/war-room3d/actions/runs/42436977867) também `SUCCESS`. Revisão local sem achados bloqueantes, zero threads e nenhuma revisão externa nessa PR; branches preservadas e projeção concorrente `.proplan/STATUS.md` conservada.
- [Registro funcional](validation/m4/aceite-funcional.md): três intenções sintéticas distintas, uma emissão confirmada por comando; prévia de permissão e alteração da decisão invalidando confirmação, comprovadas pelas imagens do PI e zero submissões/envios no backend da rodada de permissão. As duas primeiras rodadas sem correlação continuam registradas como tal.
- Modo interativo do roteiro: duração limitada a 1–60 minutos, identificador exclusivo por rodada, observações sintéticas periódicas e contadores HTTP sem corpos/credenciais; artefatos retidos para conferência. Validação: sintaxe Node, quatro rodadas manuais, contraprova automática com um envio ao fake e revisão local; o produto C#/serviço não foi alterado pelo aceite.
- Laboratórios encerrados. O aceite não comprova operação contínua M1, perguntas/permissões reais, conclusão do modelo ou custo. Ações reais sem canal e prova atuais permanecem indisponíveis.

## 07/11/2026 — Integração técnica da M4 e revisão externa resolvida

- [PR #24](https://github.com/RodReis/war-room3d/pull/24) integrada por squash em `75ad486ce0ed66ef06fae142405685d13f5658dd`, `mergedAt=2026-11-07T23:48:13Z`, após a continuação do PI até a integração técnica. SHA remoto confirmado e branch `feat/m4-interacao` preservada; issue #5 aberta, sem aceite funcional presumido.
- Revisão externa Codex no HEAD `71bf062` identificou P2 em `service/src/http/commands.ts:26`: credencial de comando A descobria pedidos de B. Correção `510274fc7a3a2073a5eeb38c9d92ab9266641b7c`, com regressão HTTP vermelha/positiva, resposta ao revisor e thread resolvida. Leitura conserva sua própria autorização; comando só descobre seus projetos e não recebe capacidades globais de leitura.
- CI do HEAD integrado `510274f`: [run 42426787642](https://github.com/RodReis/war-room3d/actions/runs/42426787642), Contratos `SUCCESS` em 7 s e Serviço `SUCCESS` em 16 s. Serviço 130/130 e typecheck locais aprovados; contratos 12/12 no CI. Branch `main` sem proteção/rulesets ativos no instante da integração, sem bypass administrativo.
- Provas Windows anteriores preservadas: Unity EditMode 15/15, PlayMode 12/12 e build/Player sintético; uma mensagem real por provedor em alvos descartáveis encerrados, recibos CLI e auditoria. Perguntas/permissões reais e vínculo contínuo M1 não comprovados permanecem indisponíveis. [Provas e critérios](validation/m4/resultado.md).

## 07/11/2026 — Recibo Codex comprovado e revisão técnica M4

- Continuação autorizada pelo PI até o fim, dentro do mesmo laboratório. Correções `b6d1fcc` (IDs MCP literais no valor TOML) e `858796786ee84bff6c317720ada0e99db1d22789` (política global nativa identificada por caminho exato), sem alterar perfil global ou retomar conversas.
- Uma mensagem sintética Codex 0.166.0 confirmada por resposta RPC: `requested → sending → confirmed`, uma tentativa, ambos os processos encerrados e sem retry. Auditoria entre 23:26:47.480 e 23:26:47.507 UTC; intervalo não mede inferência. [Relatório, hashes e histórico das tentativas sem envio](validation/m4/codex-windows.md).
- Serviço 129/129, contratos 12/12 e typecheck aprovados. [Revisão dos cinco critérios técnicos](validation/m4/resultado.md), preservando limites das provas sintéticas/Windows. C# inalterado após as provas anteriores.
- Não habilita a sessão encerrada nem outra sessão no produto. Perguntas/permissões reais e vínculo operacional M1 não comprovados; issue #5 aberta, sem merge ou aceite funcional.

## 07/11/2026 — Segunda tentativa Codex e contraprova sem credenciais

- Nova autorização específica do PI e uma execução de `a8372638fe88c3f7d560401773915fd04c596853`: `not_sent`, `bootstrap_unconfirmed`, código 1. Processo de inspeção encerrado, sem segundo processo/thread/mensagem/auditoria ou retry. Etapa interna e causa não registradas; [relatório e hashes](validation/m4/codex-windows.md).
- Perfil Codex novo e vazio, credenciais somente em arquivo e sem cópia de autenticação: `initialize` e `config/read` confirmados, zero servidores MCP, processo encerrado, sem thread ou inferência. Isola diferenças de perfil/ambiente, sem identificar a causa no contexto atual.
- Instrumentação posterior registra etapas, contadores/prazo e classes fixas de pedidos inesperados, sem dados dos pipes ou respostas a pedidos do CLI. Serviço 128/128 e typecheck aprovados; sem nova execução autenticada. Capacidades reais indisponíveis, PR #24 em rascunho e issue #5 aberta, sem merge ou aceite.

## 07/11/2026 — Pré-teste Codex autorizado sem envio M4

- Issue [#5](https://github.com/RodReis/war-room3d/issues/5), [PR #24](https://github.com/RodReis/war-room3d/pull/24), roteiro executado uma vez em `3152cccf2f58419665d7c0afd1e1735fcdd6e1dd`, sem merge.
- Autorização específica do PI para dois processos próprios, uma thread nova e uma mensagem sintética. A configuração legada `features.rmcp_client` foi recusada por `--strict-config`; o primeiro processo foi encerrado, sem segundo processo, thread ou mensagem. Resultado `not_sent`, código 1; [relatório e hash](validation/m4/codex-windows.md).
- Correção do roteiro preserva as verificações de isolamento, não altera configuração global e distingue falha de bootstrap de envio incerto. Serviço 126/126 e typecheck aprovados; consulta nativa somente de metadados com configuração corrigida retornou código 0. Sem nova execução `--run` ou inferência; prova real Codex e aceite do PI continuam pendentes.

## 07/11/2026 — Recibo Claude autorizado em laboratório M4

- Issue [#5](https://github.com/RodReis/war-room3d/issues/5), [PR #24](https://github.com/RodReis/war-room3d/pull/24), código executado `e7694095f3f247f8b59e8fc2806d5ab8a2657ffc`, sem merge.
- PI autorizou uma sessão nova descartável Claude Code 2.1.319, autenticação atual do CLI, uma mensagem sintética e limite de US$ 0,10, com ferramentas/hooks/MCP desativados e sem retomar conversas existentes. O roteiro foi executado uma vez.
- Recibo CLI `confirmed`, correlacionado por UUID, sessão e conteúdo; auditoria `requested → sending → confirmed` em 2,027 s, sem retry e saída 0. Processo descartável encerrado; custo efetivo e conclusão de inferência não atestados. [Prova Windows](validation/m4/claude-windows.md).
- Não habilita outra sessão no produto. Perguntas/permissões reais, Codex, vínculo operacional M1 e aceite do PI continuam pendentes. Serviço/contratos sem alteração neste registro; a documentação passa novamente pelo CI no HEAD da PR.

## 07/11/2026 — M4 em revisão técnica, provedores reais indisponíveis

- Issue [#5](https://github.com/RodReis/war-room3d/issues/5), [PR #24](https://github.com/RodReis/war-room3d/pull/24) em rascunho; código publicado em `e1eccbce8190fba1f66f6f7055641988b8e84338`, sem merge.
- Gateway de prévia/validação, idempotência, auditoria SQLite v16, recuperação incerta e API com credencial separada. Painel Unity ligado à cena live, com contexto/consequência e bloqueio demo/replay.
- Provas locais: contratos 12/12, serviço 101/101 e typecheck; Unity EditMode 15/15, PlayMode 12/12; build Windows 172.334.593 bytes. Player sintético: clique duplo produz uma emissão no fake, mensagem confirmada, prévia de permissão e invalidação por replay/projeto; quatro capturas 1280×720. Gate negativo recusa sucesso sem confirmação. [Resultado e limites](validation/m4/resultado.md).
- Claude/Codex reais sem prova de interface/versão/sessão; os adaptadores continuam indisponíveis. Sem hooks ou comandos a sessões pessoais. Interação nativa por mouse/teclado não executada por indisponibilidade do Computer Use. Issue aberta com `proplan:doing`; aceite funcional do PI pendente. CI deve ser conferido no SHA atual da PR.

## 06/11/2026 — Fundação documental

- PRD/GDD e planos M0–M5 aprovados como referência de planejamento e publicados no repositório.
- Issues [#1–#6](https://github.com/RodReis/war-room3d/issues) criadas para as seis etapas.
- Nenhum projeto Unity, serviço de coleta, Compose ou workflow CI entregue neste estado.
- Este conjunto de documentos de governança foi criado para orientar as futuras fatias; a publicação e o aceite dessa alteração ainda devem ser verificados separadamente.

## 06/11/2026 — M0 integrada tecnicamente

- Issue [#1](https://github.com/RodReis/war-room3d/issues/1); [PR #7](https://github.com/RodReis/war-room3d/pull/7) integrada por squash em `e962a532d54281d469a794487609db073fe19718` (`mergedAt` 15:48:47 UTC), a partir do HEAD `d51ce8f8ee5a7165b9e607f924ce3f0901b5791f`.
- Validação local: contrato 4/4; Unity EditMode 3/3; PlayMode 3/3; build Windows x64 de 104.370.751 bytes em 17,18 s, sem erros ou avisos; provas visuais e limites em [resultado M0](validation/m0/resultado.md).
- Nenhum check de CI configurado no HEAD da PR e nenhuma regra de proteção na `main` no momento do merge. Isso não equivale a CI aprovado.
- Limites: GLB v2 e rack de ensaio fora do build; direitos de redistribuição do GLB v2, custo de geração Tripo, frame time/VRAM, mouse físico no executável e teste em outra máquina não validados. Não há conectores reais, infraestrutura operacional nem comandos reais na M0.
- Aceite funcional do PI pendente; a issue continua aberta.

## 06/11/2026 — Primeira fatia M1 em revisão

- Issue [#2](https://github.com/RodReis/war-room3d/issues/2); [PR #8](https://github.com/RodReis/war-room3d/pull/8) aberta no HEAD remoto `abb61b4fb56b79160af131ba3054e2569f5018af`, sem merge.
- Validação local sintética: contratos 7/7; serviço 19/19 e typecheck aprovado no Windows x64 com Node.js 24.15.0. Detalhes e limites em [contrato/store M1](validation/m1/contrato-store.md).
- Adaptadores reais, HTTP/SSE, Unity live, build M1 e p95 serviço→HUD não executados. Nenhuma sessão pessoal ou ativo de `docs/arte` foi publicado.
- Aceite funcional do PI pendente; a issue continua aberta.

## 06/11/2026 — Primeira fatia M2 em revisão

- Issue [#3](https://github.com/RodReis/war-room3d/issues/3); [PR #9](https://github.com/RodReis/war-room3d/pull/9) em revisão no HEAD remoto `459a13c7987a54d5c4b1b9930fd433f13af636ed`, sobre a PR #8, sem merge.
- Contratos 8/8, serviço 30/30 e typecheck, Unity EditMode 6/6, PlayMode 4/4 e build Windows x64 concluídos após correção do carregador serializado e dois achados da revisão automática. [Resultado e limites](validation/m2/resultado.md).
- Data center Unity usa fixture ilustrativa; a sonda host leu memória local pontualmente no teste, HTTP usou fake e Docker/banco permaneciam desativados nesta fatia. O [levantamento](validation/m2/laboratorio.md) documenta a falta de proxy mínimo e papel de monitoração naquele momento.
- Aceite funcional do PI pendente; a issue continua aberta.

## 06/11/2026 — Proxy Docker M2 em revisão

- Issue [#3](https://github.com/RodReis/war-room3d/issues/3); [PR #10](https://github.com/RodReis/war-room3d/pull/10) aberta sobre #9, sem merge.
- Proxy local em processo separado e sonda de leitura restrita ao projeto Compose e diretório exato do checkout autorizado. Um ensaio real pontual confirmou recusa 401/404 e leitura de contêiner parado, persistida em SQLite temporário. Typecheck e 34/34 testes do serviço; [prova e limites](validation/m2/docker-proxy.md).
- A identidade Windows do proxy ainda alcança o daemon com permissão ampla; não há instalação de coleta contínua, conector SQL, transporte M1/Unity live ou aceite funcional do PI.

## 06/11/2026 — Transporte de estado M2 em revisão

- Issue [#3](https://github.com/RodReis/war-room3d/issues/3); [PR #11](https://github.com/RodReis/war-room3d/pull/11) aberta sobre #10, sem merge. O HEAD remoto deve ser conferido na PR antes da integração.
- Snapshot HTTP autenticado e avisos SSE persistidos com sequência M1/M2; migração SQLite 0003 exige snapshot novo de clientes antigos. Contratos 8/8, serviço typecheck e 38/38; [prova e limites](validation/m2/transport.md).
- Unity live, fontes reais de sessão/API/banco, ensaio de carga, CI e aceite funcional do PI permanecem pendentes.

## 06/11/2026 — Cena Unity live M2 em revisão

- Issue [#3](https://github.com/RodReis/war-room3d/issues/3); [PR #12](https://github.com/RodReis/war-room3d/pull/12) aberta sobre #11 no HEAD remoto inicial `da3d0c53ead2e6b5dd942799a8be3c03d68b2f76`, sem merge e sem checks configurados.
- Cena live separada da demonstração, cliente de snapshot HTTP/SSE com reconexão e HUD de infraestrutura. Dois achados da revisão automática foram corrigidos: atualização periódica para expiração e contagem separada de agentes incertos. EditMode 9/9, PlayMode 7/7, incluindo servidor sintético em loopback; build Windows x64 de 172.230.310 bytes após revisão. [Prova e limites](validation/m2/unity-live.md).
- API/banco reais, coleta Docker contínua sob identidade isolada, prova visual/frame time do Player e aceite funcional do PI permanecem pendentes.

## 06/11/2026 — Observação pontual adicional do laboratório M2

- O PI ampliou a autorização de leitura pontual para o servidor de jogo e o banco em dois checkouts distintos do Compose compartilhado. [PR #13](https://github.com/RodReis/war-room3d/pull/13) documental aberta sobre #12 no HEAD remoto inicial `e1e1e6a2693bc401cb9d02bcebd0374508cefee1`, sem merge ou checks configurados.
- Proxy Docker autenticado e efêmero retornou `200` para cada escopo exato, um contêiner por checkout: servidor `exited/unhealthy` sem porta publicada; banco `running/healthy` no healthcheck Docker. [Evidência e limites](validation/m2/laboratorio.md).
- Nenhuma consulta SQL, log, variável de ambiente, volume ou comando dentro de contêiner foi usado. Saúde HTTP/SQL reais, coleta contínua isolada e aceite funcional do PI permanecem pendentes.

## 06/11/2026 — Sonda PostgreSQL M2 preparada em revisão

- [PR #14](https://github.com/RodReis/war-room3d/pull/14) aberta sobre #13 no HEAD remoto inicial `d6c0177bcc6de3c3fe2658b68901a6ec218e7ae4`, sem merge e sem checks configurados.
- Sonda limitada a loopback, consulta `SELECT 1` em transação `READ ONLY`, timeout e senha por callback injetada. Um achado P1 da revisão automática sobre `pg.Client` sem listener de erro ocioso foi corrigido; `npm ci` sem vulnerabilidades reportadas, typecheck e 42/42 testes do serviço passaram. [Prova e limites](validation/m2/database-probe.md).
- Não houve conexão SQL real, papel/consulta de monitoração verificados ou integração com armazenamento local de segredo. Aceite funcional do PI permanece pendente.

## 06/11/2026 — API de produção observada pontualmente para M2

- O PI autorizou consultar uma API própria em produção e seu checkout local. [PR #15](https://github.com/RodReis/war-room3d/pull/15) documental aberta sobre #14 no HEAD remoto inicial `a8ca4294e3c1a5c3cfb5d7e97de868b42f7a509b`, sem merge ou checks configurados.
- Três GET com timeout de 5 s: liveness e readiness `200`; a sonda M2 persistiu `saudavel`, frescor e cobertura atuais em SQLite temporário. Sem autenticação, dados de negócio ou escrita. [Evidência e limites](validation/m2/api-producao.md).
- Readiness relata banco, Redis e storage indiretamente; SQL direto, coleta contínua, Player Unity ligado à fonte e aceite funcional do PI permanecem pendentes.

## 06/11/2026 — Integração e encerramento da #3

- O PI solicitou merge e encerramento. A base M1 [PR #8](https://github.com/RodReis/war-room3d/pull/8) foi integrada em `fd15d106fa3b7e2f96534cd84b8701b5ce11bd42`; a issue #2 continua aberta, com adaptadores M1 pendentes.
- As PRs M2 [#9](https://github.com/RodReis/war-room3d/pull/9), [#10](https://github.com/RodReis/war-room3d/pull/10), [#11](https://github.com/RodReis/war-room3d/pull/11), [#12](https://github.com/RodReis/war-room3d/pull/12), [#13](https://github.com/RodReis/war-room3d/pull/13), [#14](https://github.com/RodReis/war-room3d/pull/14) e [#15](https://github.com/RodReis/war-room3d/pull/15) foram integradas nessa ordem por merge commits. SHA da `main` após #15: `3018e980afdfbd0e82d696db5e93265a96b8558b`; `mergedAt` verificado em cada PR.
- A revisão P1 da #11 sobre consistência entre snapshot e sequência SSE foi corrigida em `3f171864ac5b7607d284c945915916badb207727` e resolvida antes do merge. No HEAD integrado, contratos 8/8, serviço 43/43 e typecheck passaram. EditMode 9/9, PlayMode 7/7 e build Windows pertencem à branch Unity anterior ao merge final; não há CI no HEAD.
- A [issue #3](https://github.com/RodReis/war-room3d/issues/3) foi encerrada por solicitação do PI com comentário de limites. SQL real, coleta Docker contínua com identidade isolada, Player ligado à fonte real e prova visual/frame time continuam abertos na [#16](https://github.com/RodReis/war-room3d/issues/16). O encerramento não atesta esses critérios operacionais.

## 06/11/2026 — #3 reaberta e ativação local M2 integrada

- A [issue #3](https://github.com/RodReis/war-room3d/issues/3) foi reaberta. A [PR #18](https://github.com/RodReis/war-room3d/pull/18) integrou configuração local opcional de inventário e sondas host/HTTP, com cadastro atômico, em `2cdc6d9db3fb651b16ccea96f3514b5f0d307aa5` (`mergedAt` 20:23:00 UTC; HEAD da PR `fc0b4b480367de77a7f469224f08e02173bbbbeb`). A branch de origem foi preservada.
- No HEAD integrado `2cdc6d9`, contratos 8/8, serviço 48/48 e typecheck passaram localmente; Unity EditMode 9/9, PlayMode 7/7 e build Windows foram executados no checkout da fatia antes dos commits somente documentais. Não há workflow de CI; duas discussões de revisão foram resolvidas antes do merge.
- O [ContaIA local](validation/m2/contaia-local.md) foi consultado pontualmente. A API real gerou snapshot M2 autenticado com saúde, cobertura e frescor atuais e zero sessões, usando SQLite em memória. O Vault selado gerou incidente somente nos projetos vinculados de um grafo sintético. Não houve instalação de coleta contínua.
- SQL real depende de papel e referência de credencial; Docker contínuo depende de identidade isolada. O Player conectado, capturas e frame time seguem `not_run` porque o controle visual retornou `native pipe is unavailable`. A issue #3 permanece aberta; aceite funcional e operacional do PI pendente, com critérios restantes também na [#16](https://github.com/RodReis/war-room3d/issues/16).

## 06/11/2026 — correção de estado remoto M1 durante M3

- A [issue #2](https://github.com/RodReis/war-room3d/issues/2) consta `CLOSED` desde 19:09:48 UTC, com comentário do PI de que o planejamento terminou. O fechamento não demonstra adaptadores reais de transcript, que permanecem pendentes no checkout; `STATUS.md` e `DEVELOPMENT.md` foram corrigidos sem alterar a decisão remota do PI.

## 07/11/2026 — base M3 integrada tecnicamente

- [PR #23](https://github.com/RodReis/war-room3d/pull/23) integrada por squash em `db810ee0f755a71b0cc0573bfd8411a36f672cbe` (`mergedAt` 14:58:20 UTC), a partir do HEAD `1e4799c860270cb3f4c20fe12f254757290aed4d`. Branch de origem preservada.
- No HEAD da PR: contratos 9/9, serviço 88/88 e typecheck locais; [CI](https://github.com/RodReis/war-room3d/actions/runs/42383433461) com Contratos e Serviço verdes em 7 s e 15 s. Unity EditMode 13/13, PlayMode 10/10 e build Windows de 172.310.849 bytes foram medidos no último commit com C# (`eec3770`); não foram repetidos no SHA de merge. Três threads P2 resolvidas. [Provas e limites](validation/m3/resultado.md).
- Coleta GitHub, Meu dia, replay, efeitos Unity e limpeza parcial 7/90 entregues; faltam compactação estrutural/agregados de 90 dias, adaptadores reais de transcript, cobertura contínua, posicionamento individual da infraestrutura e prova visual do Player. A revisão automática bloqueou o início do serviço local em background para essa última prova; não houve contorno. A [issue #4](https://github.com/RodReis/war-room3d/issues/4) continua aberta, sem aceite funcional do PI.

## 08/11/2026 — replanejamento da experiência por sala de referência

- PI solicitou corrigir planejamento e criar issues para uma sala Unity fiel ao conceito, com design rico/detalhado, luz/cores vivas, layout e fluxo hooks/agentes/skills/chats/logs; validação no Player antes da replicação.
- Criada [entrega #28](https://github.com/RodReis/war-room3d/issues/28) e fatias #29–#35. [Especificação](specs/2026-11-08-sala-referencia-design.md), [plano](superpowers/plans/2026-11-08-sala-referencia-player.md), prioridade e ADR-006 documentam G1–G4. Somente planejamento; nenhum novo resultado de produto ou aceite foi declarado.
- Estado remoto consultado: #1–#6 fechadas, #16 aberta, PRs #26/#27 draft. Base main b630edd. Não reabertas issues antigas nem reinterpretados aceites anteriores. Lacunas de observação M1, chat e apresentação passam a ter critérios explícitos na nova entrega; RNF-02 permanece vinculada à #16.
