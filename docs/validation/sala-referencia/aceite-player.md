# #35 — roteiro de aceite no Player Windows

## Objeto da revisão

Uma sala de referência no build identificado em [resultado.md](resultado.md) e na [continuação G3](ensaio-g3-continuacao.md). As provas das #29–#34 foram feitas em builds e momentos distintos. O candidato mais recente é `unity/Builds/WarRoom3D-M5-Final/WarRoom3D.exe`, árvore SHA-256 `e997da1cacd98abfe21b5ff54f1c60e65431fce6a4726599a9e625f7c218f087` ([manifesto](player-build-manifest-final.json)); [chat Claude](capturas/issue-35-18-claude-final-chat.png), [skill Claude](capturas/issue-35-19-claude-final-skill.png), [chat Codex](capturas/issue-35-20-codex-final-chat.png) e [log Docker](capturas/issue-35-21-docker-final-log.png) foram vistos nele. [Desempenho](metricas-player-final.json) e [escala física](escala-player-final.json) têm medição própria nesse hash: RNF-01/02 passaram, 100% passou e 125/150% continuam `not_run`. Dados sintéticos permanecem identificados na tela. Nenhuma sala adicional será replicada por este card.

## Roteiro G1–G4

1. Conferir SHA, hash do executável, versão Unity, pacotes, resolução, escala física do Windows, GPU, perfil de qualidade, fonte de dados e modo da sessão.
2. No quartel, localizar a sala de referência. Entrar e registrar quartel, interior e ângulo oposto da **mesma instância**; comparar com as referências do PI localmente. Alternar perfil visual/reduzido e verificar legibilidade de agentes, mesa, holograma e ações.
3. Selecionar projeto e agente principal pela lista e pelo avatar. Selecionar subagente vinculado; conferir pai, tarefa, ferramenta e skill com origem, horário e capacidade por provedor. Quando não houver suporte, exigir estado explícito, sem evento inventado.
4. Abrir chat da sessão: conferir isolamento e resposta observada. Abrir pedido de interação, revisar alvo/prévia/capacidade, enviar somente no laboratório especificamente autorizado; recibo não substitui resposta. Para pergunta/permissão indisponível, verificar retorno ao fluxo nativo.
5. Abrir Logs no mesmo contexto, filtrar e paginar. Abrir evento/evidência, conferir origem, cobertura, truncamento e redação; fechar detalhe e retornar sem perder seleção. Log sem ID de sessão não deve ganhar agente por coincidência de horário.
6. Perder e recuperar fonte de laboratório; conferir estado incerto, reconexão sem duplicatas, ausência de comandos em demo/replay, mensagem longa, ausência de capacidade, Esc/retorno e input sobre UI sem mover câmera.
7. Medir RNF-01 a 10 eventos/s. Medir RNF-02 por 600 s com janela visível em 1920×1080: p95 de apresentação ≤16,67 ms no perfil visual e ≤33,33 ms no reduzido; registrar CPU, GPU, memória, perdas e condições do compositor. Repetir layout em 1440×900 e 1920×1080 com Windows físico em 100/125/150%, mais 1366×768.
8. PI registra decisão explícita para **este SHA e executável**, arte e fluxo, limites da matriz e eventuais dispensas de requisito obrigatório. Sem decisão ou com obrigatório `fail`/`not_run`, G4 segue pendente.

## Regras da prova

- Cada captura inclui build, modo, resolução, escala e cenário. Capturas de builds diferentes não compõem uma única execução final.
- Laboratórios anteriores das #31/#33/#34 provaram eventos pontuais; suas autorizações foram consumidas. Novo ensaio real exige alvo, fonte, escopo e autorização próprios.
- Falha, `not_run` e incapacidade nativa permanecem visíveis. Aprovação técnica de PR/CI não equivale ao aceite do PI.
