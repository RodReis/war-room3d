# Desenvolvimento

## Próxima entrega prioritária — sala de referência

Direção autorizada pelo PI em 08/11/2026: [#28](https://github.com/RodReis/war-room3d/issues/28), [especificação](specs/2026-11-08-sala-referencia-design.md) e [plano](superpowers/plans/2026-11-08-sala-referencia-player.md). #29 arte/luz, #30 layout, #31 hooks/observação, #32 avatares/atividade, #33 chat, #34 logs e #35 Player/aceite. Uma sala acabada e funcional deve passar por revisão visual inicial e aceite final no Player; replicação do acabamento fica bloqueada até decisão explícita do PI.

O fechamento remoto de M0–M5 não comprova essa experiência. Em 08/11/2026, #1–#6 e #16 estavam fechadas. As PRs #27 e #39 foram integradas; RNF-02 foi reprovado no build da #16. O laboratório G3 da #35 observou Claude/Codex/Docker de forma pontual e a dispensa de tarefa/skill Codex CLI 0.166.0 foi registrada pelo PI. No [build atual da sala](validation/sala-referencia/resultado.md), G2, G3, escala física e RNF-01/02 passaram com limites; a medição física de três perfis foi concluída após reinício autorizado do Windows. A PR #26 acrescentou base técnica M5, sem aceite visual próprio. A sala de referência aguarda decisão G4 do PI para esse executável.

## Registro técnico das etapas anteriores

| Etapa | Issue | Plano | Estado |
|---|---|---|---|
| M0 — contrato e cena modular | [#1](https://github.com/RodReis/war-room3d/issues/1) | [M0](superpowers/plans/2026-11-06-m0-fundacao-visual.md) | [PR #7](https://github.com/RodReis/war-room3d/pull/7) integrada em `e962a532`; aceite funcional pendente |
| M1 — sessões e salas vivas | [#2](https://github.com/RodReis/war-room3d/issues/2) | [M1](superpowers/plans/2026-11-06-m1-quartel-vivo.md) | [PR #8](https://github.com/RodReis/war-room3d/pull/8) de contrato/store e [PR #39](https://github.com/RodReis/war-room3d/pull/39) de adaptadores opt-in integradas; laboratório real G3 da #31 pendente |
| M2 — data center essencial | [#3](https://github.com/RodReis/war-room3d/issues/3) | [M2](superpowers/plans/2026-11-06-m2-infraestrutura.md) | [PR #9](https://github.com/RodReis/war-room3d/pull/9)–[#15](https://github.com/RodReis/war-room3d/pull/15), [#18](https://github.com/RodReis/war-room3d/pull/18), [#20](https://github.com/RodReis/war-room3d/pull/20) e [#27](https://github.com/RodReis/war-room3d/pull/27) integradas; #16 fechada pelo PI com RNF-02 reprovado no ensaio apresentado |
| M3 — histórico e GitHub | [#4](https://github.com/RodReis/war-room3d/issues/4) | [M3](superpowers/plans/2026-11-06-m3-historico-github.md) | [PR #23](https://github.com/RodReis/war-room3d/pull/23) integrada; serviço, painel e retenção ainda parciais; [provas e limites](validation/m3/resultado.md) |
| M4 — interação assistida | [#5](https://github.com/RodReis/war-room3d/issues/5) | [M4](superpowers/plans/2026-11-06-m4-interacao.md) | [PR #24](https://github.com/RodReis/war-room3d/pull/24) integrada em `75ad486`, com gateway, auditoria, painel, [protocolos](validation/m4/protocolos.md) e descoberta restrita à credencial; recibos pontuais [Claude](validation/m4/claude-windows.md) e [Codex](validation/m4/codex-windows.md), alvos encerrados. [Aceite com limites](validation/m4/aceite-funcional.md) do PI em 07/11/2026 e issue encerrada; vínculo contínuo M1 e perguntas/permissões reais não comprovados |
| M5 — operação ampliada | [#6](https://github.com/RodReis/war-room3d/issues/6) | [M5](superpowers/plans/2026-11-06-m5-operacao-ampliada.md) | [PR #26](https://github.com/RodReis/war-room3d/pull/26): API, cobertura, regras/incidentes, rede HTTP M2 opt-in e logs locais da API ContaIA via Docker autorizados. Traces distribuídos, detector, coleta contínua e Player visual pendentes; [provas e limites](validation/m5/resultado.md). Issue #6 fechada pelo PI; esta ampliação não recebeu aceite visual. |

As dependências não exigem um único PR por etapa. Cada fatia deve produzir comportamento verificável e não misturar subsistemas independentes. A ordem pode mudar por decisão de produto registrada em [DECISIONS](DECISIONS.md).

## Baseline de ambiente

- Repositório público: `RodReis/war-room3d`, branch `main`.
- Cliente M0: Unity 6000.3.27f1, URP 17.3.0, Windows x64; versões e provas em [baseline M0](validation/m0/baseline.md) e [resultado M0](validation/m0/resultado.md).
- Serviço M1 integrado pela PR #8: Node.js 24, TypeScript e SQLite local. A fatia M2 adicionou snapshot HTTP/SSE e cena Unity live; a PR #39 adicionou adaptadores opt-in testados sinteticamente. O laboratório real G3 permanece pendente. A issue #2 foi fechada pelo PI como planejamento, sem prova de ingestão operacional.
- A fatia M2 adiciona grafo, estado de infraestrutura e sondas de host/HTTP testadas sinteticamente. O proxy e a sonda Docker foram [ensaiados pontualmente](validation/m2/docker-proxy.md); [outros dois serviços autorizados](validation/m2/laboratorio.md) foram observados somente via metadata Docker. A PR #27 registrou ensaios temporários de SQL e Docker por dez minutos; coleta contínua não foi ativada.
- O [snapshot HTTP e os avisos SSE](validation/m2/transport.md) foram testados com estado M1/M2 sintético. A [cena Unity live](validation/m2/unity-live.md) consome esse transporte em ensaio sintético separado da fixture demonstrativa.
- A [sonda PostgreSQL](validation/m2/database-probe.md) usa transação de leitura e consulta fixa. A PR #27 ensaiou `SELECT 1` com papel temporário restrito e removido; não há credencial de coleta permanente.
- A [ativação local controlada](validation/m2/monitoring-local.md) permite sondas host/HTTP/Docker explicitamente configuradas no serviço; PostgreSQL permanente e Docker contínuo seguem desativados até validação das permissões exigidas.
- A configuração GitHub M3 cadastra projeto e repositório sem exigir sonda M2. Copiar [exemplo](../service/examples/github.example.json) para arquivo `*.github.local.json` ignorado pelo Git e apontar `WR3D_GITHUB_CONFIG_PATH` para ele. O cadastro usa `repositoryId` numérico da API GitHub e caminho local absoluto. O coletor consulta repositório público sem token a cada 10 minutos; `WR3D_GITHUB_TOKEN` opcional, em variável de ambiente, habilita acesso autenticado e ciclo de 1 minuto. O token não fica no JSON nem na Unity. A identidade remota é conferida antes da ingestão; falha de API é relatada e não apaga marcos anteriores.
- A política M3 aprovada em 07/11/2026 expõe cortes de consulta em `/v1/history/retention`: detalhe de replay por 7 dias e Meu dia por 90 dias. Um dia mais antigo retorna `410`, e detalhes expirados de marcos viram contagens sem URL. A exclusão física no SQLite depende de compactação com estado base, ainda pendente; [provas e limites](validation/m3/resultado.md).
- O [laboratório ContaIA local](validation/m2/contaia-local.md) foi consultado pontualmente: a sonda HTTP M2 classificou a API como `saudavel` e o Vault selado como `degradado`. O [Player Windows](validation/m2/player-operacional.md) consumiu snapshot/SSE desses estados em ensaio pontual com projetos sintéticos, sem coleta recorrente.
- Uma [carga local sintética sustentada](validation/m2/performance-operacional.md) mediu propagação de sequência a 10 eventos/s e frame time do Player por mais de dez minutos em 1080p, com VSync desligado. O [ensaio complementar com VSync 1](validation/m2/cadencia-vsync.md) registrou p95 interno de 16,725 ms, acima de 16,67 ms. A [PR #27](validation/m2/issue-16-fps.md) mediu FPS apresentado: p95 24,663 ms; o modo reduzido permanece `not_run`.
- Uma [API própria em produção](validation/m2/api-producao.md) respondeu a uma leitura pontual de liveness/readiness e à sonda HTTP M2; o endereço e dados de negócio ficaram fora do Git.
- `docs/arte`, `docs/analise` e `docs/preview` são referências locais ignoradas pelo Git.
- Não há Compose, banco compartilhado ou instalador configurado neste repositório. O pipeline CI cobre contratos e serviço; builds e testes Unity continuam locais. O M2 live foi validado com fonte sintética e, depois, com fontes HTTP locais autorizadas em ensaio pontual.

Se Compose for introduzido, registrar aqui nome, comandos, portas, volumes, política de backup/restauração e usuários autorizados antes de ativar fontes reais. Nunca copiar credenciais para este documento.

## Registro por entrega

Ao concluir uma fatia, adicionar data, issue/PR, SHA de merge, prova executada e limitação em [STATUS-ARQUIVO](STATUS-ARQUIVO.md); atualizar o resumo em [STATUS](STATUS.md). Aceite funcional do PI é registrado separadamente do merge técnico.
