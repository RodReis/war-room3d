# Sala de referência no Player — plano de entrega

> Executar por issues relacionadas, em fatias testáveis e PRs revisáveis. Confirmar ferramentas/skills disponíveis ao iniciar cada fatia; este plano não depende de uma skill de execução ausente e não inicia implementação por sua publicação.

**Objetivo:** Uma sala Unity com arte rica e fiel ao conceito, layout contextual e jornada hooks/agentes/skills/chats/logs, validada pelo PI no Player antes da replicação.

**Arquitetura:** Serviço local mantém fontes, identidades, eventos e comandos; Unity apresenta estado normalizado. Arte modular e presenters por responsabilidade substituem o cenário provisório, preservando o backend e sem produzir seis salas acabadas antes do aceite.

**Base:** Unity 6000.3.27f1/URP do projeto; Node 24/TypeScript/SQLite, JSON e HTTP/SSE existentes. Conferir APIs/versões na documentação oficial/Context7 durante execução. [Especificação](../../specs/2026-11-08-sala-referencia-design.md), entrega [#28](https://github.com/RodReis/war-room3d/issues/28). Main consultada: b630edd, 08/11/2026. Não há prova executada deste novo produto neste planejamento.

## Ordem e dependências

| Fatia | Issue | Dependências | Saída verificável |
|---|---|---|---|
| Arte e luz | [#29](https://github.com/RodReis/war-room3d/issues/29) | Direção aprovada | Sala acabada em três vistas; primeiro Player/G1 |
| Layout | [#30](https://github.com/RodReis/war-room3d/issues/30) | Projeto/contrato atuais | HUD contextual legível com fixture marcada |
| Hooks/observação | [#31](https://github.com/RodReis/war-room3d/issues/31) | M1 parcial | Atividade normalizada, matriz de fontes e ingestão autorizada |
| Avatares/atividade | [#32](https://github.com/RodReis/war-room3d/issues/32) | #29/#30/#31 | Pessoas/estações vinculadas aos IDs e estados |
| Chat | [#33](https://github.com/RodReis/war-room3d/issues/33) | #30/#31; M4 | Histórico e ida/volta por sessão; decisões por capacidade |
| Logs | [#34](https://github.com/RodReis/war-room3d/issues/34) | #30/#31; revisão/integração M5 da PR #26 | Filtros/páginas e fonte real no contexto da sala |
| Player/aceite | [#35](https://github.com/RodReis/war-room3d/issues/35) | Começa em G1; termina após todas | G1–G4, manifesto e decisão do PI |

Arte, layout e preparação de fontes podem avançar independentemente; isso não exige agentes paralelos nem autoriza fontes reais. Revisar o primeiro Player na #29, sem esperar todo backend. Preparar roteiro/manifesto da #35 no começo, mantendo gates não executados explícitos.

## 1. Fixar baseline e prova — preparação #35

- [ ] Conferir HEAD remoto, PRs #26/#27, #16 e mudanças locais; preservar trabalho concorrente e instruções locais.
- [ ] Inventariar referências/capturas com hash e direitos; comparação quartel/interior/oposto, sem publicar arquivos ignorados por conveniência.
- [ ] Criar docs/validation/sala-referencia/aceite-player.md com G1–G4 e roteiro da especificação; resultados começam not_run.
- [ ] Criar matriz provedor/versão/fonte/evento/capacidade/prova; distinguir desconhecido, indisponível, inferido e comprovado. Delimitar ensaios reais na execução.

## 2. Produzir a sala — #29

**Modificar:** unity/Assets/WarRoom3D/Runtime/Scene/SectorBuilder.cs. **Criar:** Prefabs/ReferenceRoom.prefab, Art/ReferenceRoom/, materiais/texturas e perfil de luz sob unity/Assets/WarRoom3D/. Gerar/versionar .meta pelo Editor. Caminhos novos são propostas, a confirmar no HEAD da execução.

- [ ] Conferir escala, pivôs, encaixes, original editável, exportação por peça e licença antes de importar.
- [ ] Modelar/importar arquitetura, mesa/holograma, estações, cadeiras, racks e props; construir prefab com âncoras de câmera/avatar/UI e paredes recortáveis.
- [ ] Substituir uma posição provisória pela sala, mantendo ID/posição e câmeras. Não copiar acabamento para outras posições.
- [ ] Trabalhar materiais/luz conforme especificação: variação de superfície, cores vivas, ambiente/tarefa/destaque, sombras e emissivo controlado.
- [ ] Gerar Player, comparar três vistas e apresentar G1 ao PI. Corrigir desvios; contagem de objetos ou render externo não comprova qualidade.

## 3. Reorganizar HUD — #30

**Modificar:** UI/Hud.uxml, UI/Hud.uss, Runtime/UI/HudPresenter.cs, Runtime/Live/LiveHudPresenter.cs, Runtime/Commands/CommandPresenter.cs e Runtime/Camera/OrbitCamera.cs, sob unity/Assets/WarRoom3D/. **Criar:** componentes focados em Runtime/UI/ e UI/; não concentrar toda evolução no presenter atual.

- [ ] Preparar fixture marcada: duas principais, filho, tarefa/ferramenta/skill, pedido longo e logs; contrato/projeção ao vivo evoluem na #31, sem texto ad hoc.
- [ ] Construir cabeçalho/breadcrumb, etiqueta, resumo à direita, árvore e abas; seleção por cena/lista compartilha contexto.
- [ ] Refazer modal preservando alvo, pedido, ações e invalidação de prévia; apresentar carregamento, erro, vazio e incapacidade.
- [ ] Criar PlayMode de seleção/retorno/Esc/foco e input sobre UI. Reproduzir defeitos antes das correções de comportamento.
- [ ] Capturar resoluções/escalas da especificação no Player e corrigir cortes/sobreposição. G2 depende da jornada completa, não apenas deste HUD.

## 4. Concluir observação — #31

**Modificar:** contracts/schemas/event.v1.schema.json, snapshot.v1.schema.json, testes/fixtures M1; service/src/domain/, store/event-store.ts, http/main.ts e http/server.ts. **Criar:** adaptadores em service/src/sessions/, testes em service/test/ e migração numerada após conferir a última da base, sem reservar número obsoleto.

- [ ] Inspecionar formatos/protocolos instalados e documentação atual; preencher matriz e critérios de presença/atividade/fim por provedor.
- [ ] Especificar contrato de tarefa/ferramenta/skill/mensagem e compatibilidade; escrever regressões de contrato/store antes de alterar comportamento.
- [ ] Implementar adaptadores/cursores, cobrindo duplicação, rotação, linha parcial, backfill, pai ausente, projeto homônimo e recuperação.
- [ ] Ligar ativação/teste/revogação por escopo; separar hook, fonte e transporte. Não instalar hook global por padrão.
- [ ] Executar laboratório autorizado: duas principais Claude/Codex e subagente real, correlação fonte → store/API → Player. Skill sem fim conhecido permanece invocação observada.

## 5. Vincular avatares e atividade — #32

**Criar:** Runtime/Agents/AgentPresenter.cs, AgentView.cs, Prefabs/Agents/, animações e Tests/PlayMode/ReferenceRoomAgentTests.cs sob unity/Assets/WarRoom3D/. **Modificar:** Runtime/Live/LiveSnapshot.cs e integração com HUD/âncoras.

- [ ] Produzir humanos estilizados com rig/poses e origem rastreável; avaliar sentado/trabalhando/esperando no mobiliário real.
- [ ] Vincular IDs e seleção; não fundir principais nem atribuir pai por posição física.
- [ ] PlayMode cobre duplicação, pai pendente, encerramento, fonte perdida, vazio e agrupamento acima de 12; não usar contagem de corpos para aprovar arte.
- [ ] Revisar Player: animação, oclusão, seleção e reduzir movimento, sem gesto gerando fato operacional.

## 6. Chat e decisões — #33

**Reusar:** service/src/commands/, http/commands.ts e gateway/contratos M4. **Criar:** service/src/sessions/conversation-store.ts, rotas de leitura limitadas, Runtime/Chat/, UI/ChatPanel.uxml/.uss e testes. Evoluir migração após revisar base.

- [ ] Modelar mensagem/resposta/papel/cursor/origem/correlação, separados de rascunho e status do comando.
- [ ] Regressões: isolamento entre sessões, paginação, leitura/comando, troca de alvo, confirmação dupla, expiração, timeout e demo/replay.
- [ ] Implementar leitura e chat contextual; revalidar vínculo/capacidade no backend. Mudar texto/alvo exige nova prévia.
- [ ] Apresentar pergunta/permissão original, prazo e consequência; ausência explica retorno ao fluxo nativo.
- [ ] Provar ida/volta por provedor nas sessões autorizadas; recibo não é conclusão. Suporte obrigatório ausente fica pendente de decisão do PI.

## 7. Logs e evidência — #34

**Dependência:** revisar estado da PR #26/M5; draft na consulta. **Criar:** Runtime/Logs/LogPresenter.cs, UI/LogPanel.uxml/.uss e docs/validation/sala-referencia/logs.md. **Modificar:** rotas/projeções M5 efetivamente integradas/revisadas; não copiar conectores para Unity.

- [ ] Listar campos/capacidades M5 disponíveis; manter acesso/redação no serviço.
- [ ] Testar isolamento projeto/ambiente/recurso, canários de segredo, cursor e correlação por ID; log sem sessão não ganha agente fictício.
- [ ] Implementar categorias, filtros, páginas, pausa e detalhe; preservar posição/contexto no retorno da evidência.
- [ ] Demonstrar Player com fonte perdida, vazio, erro, duas páginas e linha longa; comprovar redação antes de store/UI.
- [ ] Consultar fonte real especificamente autorizada e rastrear até Player; não declarar correlação real sem IDs ou observabilidade universal.

## 8. G2–G4 e decisão — #35

- [ ] Jornada/negativos em build único; manifesto/capturas/resultados por critério em docs/validation/sala-referencia/resultado.md.
- [ ] Contratos: npm test no diretório contracts/. Serviço: npm run typecheck e npm test em service/. Unity: EditMode/PlayMode afetados e build Windows por ferramenta validada no ambiente; registrar versão, comando e saída.
- [ ] RNF-01/02: 10 eventos/s, 1080p/10 minutos com janela visível; p95 de apresentação ≤16,67 ms visual e ≤33,33 ms reduzido. Registrar hardware/GPU/memória/perdas, carga do PRD e escalas da especificação. Relacionar #16 sem apagar reprovação anterior.
- [ ] Revisar diff completo, checks do SHA atual, licença/conteúdo dos ativos. PRs usam refs da issue e refs #28. CI Serviço/Contratos e provas Unity locais são distintos.
- [ ] Apresentar Player/comparativo/matriz ao PI; registrar aceite/recusa com SHA/hash e limites. Não pedir aceite abstrato sem resultado aberto para revisão.
- [ ] Atualizar #28 e docs com fatos comprovados. Obrigatório fail/not_run bloqueia gate, salvo dispensa explícita do PI. Sem aceite final, não replicar acabamento; depois dele, planejar expansão como entrega própria.

## Limites e revisão

Não impor prazo artificial antes de reduzir incerteza artística e compatibilidade das fontes. Reestimar na #28 após G1 e matriz de provedores. Não reduzir detalhe ou retirar fluxo sem decisão do PI.

Cobertura conferida: arte/luz/cor (#29), layout (#30), hooks/skills (#31), agentes (#32), chats (#33), logs (#34), Player antes de replicação (#35). Não reabrir issues antigas ou reinterpretar aceites por esta documentação. Ferramentas, caminhos e classes novos são propostas, não funcionalidades existentes.
