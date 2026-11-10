# Plano de implementação — quartel vivo no Player

> Executar um card por fatia, com revisão de diff, testes e prova no Player. Este plano organiza a execução autorizada como direção de produto. A instalação de hooks, o acesso a projetos reais e a integração de PR seguem suas autorizações próprias.

**Objetivo** — Entregar a vista inicial fiel ao protótipo, com dois projetos ativos de uma fonte real, avatares humanos reconhecíveis e gráfico ligado a eventos.

**Arquitetura** — Fontes opt-in entregam metadados normalizados ao serviço local. SQLite mantém vínculo de projeto e origem, sequência, frescor, posição e histórico; a API envia projeções distintas de sala, agentes, cobertura e atividade. A Unity renderiza o mesmo estado em cartões, cena e gráfico, preservando seleção e navegação.

**Tecnologias** — Unity 6.3 LTS, URP, UI Toolkit, Node.js/TypeScript, SQLite, contratos JSON, HTTP/SSE e Unity Player Windows.

[Épico #46](https://github.com/RodReis/war-room3d/issues/46) · [Especificação](../../specs/2026-11-09-quartel-vivo-design.md) · [TESTING](../../TESTING.md). Base documental verificada em `ca94cf4`; conferir o SHA corrente antes de cada card.

## Ordem e dependências

| Ordem | Card | Dependência | Prova mínima da fatia |
|---|---|---|---|
| 1 | [#47](https://github.com/RodReis/war-room3d/issues/47) Vista geral 3D e UX | Base atual | Dois cartões legíveis sem clique, cena navegável e comparação com o conceito no Player. |
| 2 | [#48](https://github.com/RodReis/war-room3d/issues/48) Salas dinâmicas | Base atual | Criação, estabilidade, fechamento e reconexão com duas identidades e sem duplicação. |
| 3 | [#49](https://github.com/RodReis/war-room3d/issues/49) Claude Code no VS Code local | [#48](https://github.com/RodReis/war-room3d/issues/48) | Dois projetos reais chegaram ao mesmo Player; perda/reconexão da fonte do forja comprovada. Aceite funcional do PI pendente. Ensaio Codex no VS Code sem evento. |
| 4 | [#50](https://github.com/RodReis/war-room3d/issues/50) Avatares | [#47](https://github.com/RodReis/war-room3d/issues/47), [#48](https://github.com/RodReis/war-room3d/issues/48) | Nomes, roupas distintas, movimento e seleção com estados verificáveis. |
| 5 | [#51](https://github.com/RodReis/war-room3d/issues/51) Gráfico | [#48](https://github.com/RodReis/war-room3d/issues/48), [#49](https://github.com/RodReis/war-room3d/issues/49) | Ação real isolada por projeto, lacuna quando falta cobertura e drill-down para evidência. |
| Gate | [#52](https://github.com/RodReis/war-room3d/issues/52) Validação integrada | 1–5 | Aceite do PI no mesmo Player Windows com arte e jornada real. |
| Expansão | [#53](https://github.com/RodReis/war-room3d/issues/53) Cafeteria e sala do PI | [#52](https://github.com/RodReis/war-room3d/issues/52) | Dois espaços fixos navegáveis, disponíveis com e sem projetos. |
| Expansão | [#54](https://github.com/RodReis/war-room3d/issues/54) Workspaces VS Code | [#52](https://github.com/RodReis/war-room3d/issues/52) | Workspace aberto cria sala e fechamento concilia outras fontes, sem confundir com o plugin Codex. |
| Expansão | [#55](https://github.com/RodReis/war-room3d/issues/55) Codex Desktop | [#52](https://github.com/RodReis/war-room3d/issues/52) | Fonte comprovada no aplicativo desktop atualiza a sala existente sem duplicação. |
| Expansão | [#59](https://github.com/RodReis/war-room3d/issues/59) Claude Code Desktop | [#49](https://github.com/RodReis/war-room3d/issues/49) e decisão do PI | Prova independente na aba Code local do aplicativo, sem transferir a prova do VS Code. |

## Primeira entrega

### 1 · Vista do quartel [#47](https://github.com/RodReis/war-room3d/issues/47)

Pontos de entrada: `unity/Assets/WarRoom3D/Runtime/Scene/SectorBuilder.cs`, `ReferenceRoomView.cs` no mesmo diretório, `unity/Assets/WarRoom3D/Runtime/Live/LiveHudPresenter.cs` e `unity/Assets/WarRoom3D/UI/Hud.uxml`. Separar layout e estilo de dados. Novos componentes de cartão e enquadramento devem reaproveitar seleção e câmera existentes.

- [ ] No Player atual, capturar entrada e interior para comparação e registrar onde a cena perde escala, luz e leitura. Usar a prancha aprovada como referência.
- [ ] Montar duas salas com interior visível, corredores e núcleo legíveis. Reservar as duas zonas fixas. Ajustar câmera e oclusão de modo que a vista de entrada mostre simultaneamente os dois cartões e a cena.
- [ ] Reusar a mesma ação de seleção no cartão e no objeto 3D. Separar estado do serviço, da fonte e do modo. Se a proveniência não for comprovada, mostrar estado desconhecido sem indicar atividade real.
- [ ] Conferir Player nas três resoluções, legibilidade e contraste, navegação por teclado, seleção e retorno. Capturar prova em dados de teste identificados até o gate integrado.

### 2 · Salas dinâmicas [#48](https://github.com/RodReis/war-room3d/issues/48)

Pontos de entrada: `service/src/domain/identity.ts`, `service/src/store/event-store.ts`, migrações existentes de presença e posição (`0010_project_presence_evidence.sql`, `0012_room_placement_history.sql`), `contracts/schemas/snapshot.v1.schema.json`, `LiveSnapshot.cs` e `SectorBuilder.cs`.

- [ ] Exercitar com regressão duas identidades homônimas, uma identidade com duas fontes e entrega repetida do mesmo evento. Usar chave de projeto canônica e vínculos autorizados, sem agrupar por nome.
- [ ] Reconciliar por último vínculo ativo. Abertura de workspace pode registrar projeto e sessão observada pode ativá-lo; apenas evento operacional normalizado muda trabalho. Perda de cobertura preserva posição em estado incerto. Fechamento explícito do último vínculo desativa a sala e conserva ID/histórico.
- [ ] Reutilizar a projeção no Player sem criar seis salas vazias com nomes fictícios. Manter seis posições dinâmicas por setor e IDs próprios para espaços fixos. Testar sétimo projeto em fixture e reativação após reinício.
- [ ] Executar contratos e serviço. Conferir no Player que duplicação de fonte não duplica sala, posição ou estado operacional.

### 3 · Primeira fonte real [#49](https://github.com/RodReis/war-room3d/issues/49)

Pontos de entrada: `service/src/sessions/capture-source.ts`, `adapters.ts`, `file-source.ts` e `service/test/session-sources.test.ts`. Referência do mecanismo e dos limites atuais: [#31](../../validation/sala-referencia/issue-31-observacao.md) e [hooks oficiais Claude](https://code.claude.com/docs/en/hooks). O PI autorizou a prova do Claude Code no VS Code em `arenahub` e `rrb-forja` após o ensaio sem evento do Codex em `rrb-forjaOS`; Claude Code Desktop fica para etapa posterior.

- [x] Conferir runtime Claude Code `2.1.322`; observar início, submissão e `Stop` nativos nos dois projetos. Subagente, ferramenta, tarefa e skill não foram observados.
- [x] Configurar hooks opt-in somente nos dois projetos autorizados, sanitizar antes da persistência e restaurar os arquivos locais originais byte a byte após o ensaio.
- [x] Observar fonte → spool sanitizado → store → API → Player em duas salas independentes. A atribuição ao painel VS Code depende da ação controlada pelo PI e da correlação temporal; o hook não informa o aplicativo hospedeiro.
- [x] Exercitar perda e reconexão da fonte do forja com novo sinal nativo; reinício anterior do serviço com o mesmo banco e spool não duplicou a sessão. [Relatório dos dois projetos](../../validation/quartel-vivo/claude-dual-arenahub-forja.md). Aceite funcional do PI ainda pendente.

### 4 · Agentes humanos [#50](https://github.com/RodReis/war-room3d/issues/50)

Pontos de entrada: `unity/Assets/WarRoom3D/Runtime/Agents/AgentProjection.cs`, `AgentPresenter.cs`, `AgentView.cs`, testes `AgentProjectionTests.cs` e `AgentViewTests.cs` em `unity/Assets/WarRoom3D/Tests/PlayMode/`, `art-source/agents/`.

- [ ] Manter a identidade por agente/sessão e testar rótulo e aparência estáveis após reinício. Nome da fonte tem proveniência; apelido e aparência locais persistem sem alterar identidade normalizada.
- [ ] Autorizar o usuário a escolher estilos e apresentar quatro combinações distintas de roupa e silhueta no cenário de validação, com homens e mulheres. Documentar autoria, origem e licença dos ativos distribuídos.
- [ ] Conectar entrada, trajeto curto, gestos de trabalho/espera e modo reduzido aos estados observados. Usar movimento decorativo apenas como composição. Validar seleção do avatar, ausência de informação, fonte perdida e saída explícita.
- [ ] Capturar vídeo do Player, incluindo atividade real quando disponível. Distinguir no relatório a prova da variedade visual por fixture da prova real da identidade/estado.

### 5 · Gráfico [#51](https://github.com/RodReis/war-room3d/issues/51)

Pontos de entrada: `service/src/http/server.ts`, `service/src/store/event-store.ts` e `unity/Assets/WarRoom3D/Runtime/Live/`. Criar projeção de atividade isolada do presenter. Definir contrato da projeção e validar janela, resolução temporal e cobertura antes de ligar o gráfico.

- [ ] Adicionar casos de deduplicação, atraso, intervalo coberto sem eventos, desconexão e alteração exclusiva do projeto A. Operações decorativas, heartbeats e replay não entram na série real.
- [ ] Agregar eventos operacionais normalizados pelo timestamp de origem em intervalos UTC de cinco minutos na última hora. Calcular cobertura com a evidência de fonte do período e marcar parcial/desconhecida quando o intervalo não puder ser demonstrado. Persistir a proveniência necessária para backfill sem alterar frescor.
- [ ] Atualizar a projeção pelo fluxo de eventos existente, preservando acesso a intervalos anteriores. Renderizar no Player nome, unidade, período e lacuna; selecionar um intervalo leva aos eventos correspondentes.
- [ ] Comparar API e tela com dois projetos, parada e retomada. Conferir caso de cobertura confirmada sem eventos (zero) e caso sem cobertura (lacuna).

## Gate integrado [#52](https://github.com/RodReis/war-room3d/issues/52)

- [ ] Em `contracts` executar `npm test`; em `service` executar `npm run typecheck` e `npm test`. Esperado: códigos zero. Rodar EditMode, PlayMode e build Windows conforme [TESTING](../../TESTING.md).
- [ ] Registrar manifesto de build com SHA, versão da fonte e os dois alvos autorizados. Usar nomes sanitizados nas evidências publicáveis. Comparar com a prancha no Player, em 1920×1080, 1440×900, 1366×768 e nas escalas aplicáveis.
- [ ] No mesmo Player, disparar atividade em A, conferir o caminho até cartão/avatar/série, confirmar que B preserva estado e identidade, e inspecionar o detalhe do evento. Interromper a fonte e reiniciar Player/serviço. Conferir lacuna, retorno sem duplicação e posição estável.
- [ ] Medir RNF-01/02 no build da prova conforme os métodos vigentes; anotar falha, ausência de cobertura ou não execução explicitamente. Registrar o aceite do PI em `docs/validation/quartel-vivo/resultado.md` antes de iniciar a expansão visual.

## Expansão

- [ ] [#53](https://github.com/RodReis/war-room3d/issues/53) Criar prefabs e navegação da cafeteria e da sala de reunião do PI. Conferir posição estável, existência com zero projetos e isolamento das vagas dinâmicas.
- [ ] [#54](https://github.com/RodReis/war-room3d/issues/54) Validar a [interface do VS Code](https://code.visualstudio.com/api) e o mecanismo documentado da versão. Abrir/fechar workspace autorizado, separar presença de trabalho de sessões do plugin Codex e demonstrar coexistência com outras fontes. Testar multi-root e reinstalação/remoção apenas no escopo acordado.
- [ ] [#55](https://github.com/RodReis/war-room3d/issues/55) Confirmar as capacidades documentadas da versão do [Codex](https://github.com/openai/codex). Provar no desktop real o fluxo de projeto/sessão, trust e revogação, reconexão e coexistência com outras fontes. Declarar limitações com evidência; não transferir prova de CLI ou App Server próprio para o desktop.
- [ ] [#59](https://github.com/RodReis/war-room3d/issues/59) Validar Claude Code Desktop na aba Code local, com autorização própria de projetos/sessões, hash do aplicativo e versão interna; não transferir prova de terminal ou VS Code.
