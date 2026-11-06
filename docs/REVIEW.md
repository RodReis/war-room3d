# Critérios de revisão

Revisão descreve achados concretos com arquivo/linha, condição de reprodução, impacto e correção sugerida. Não transformar preferências de estilo em bloqueio sem contrato. Revisar o diff completo contra a base, inclusive arquivos já commitados no branch.

| Prioridade | Significado | Tratamento |
|---|---|---|
| P0 | Perda de dados, execução indevida, exposição grave ou produto inviável | Bloqueia merge |
| P1 | Requisito/segurança quebrado em cenário provável, sem alternativa aceitável | Bloqueia merge |
| P2 | Falha funcional localizada ou risco verificável com contorno | Corrigir ou registrar decisão explícita |
| P3 | Melhoria de clareza/manutenção sem falha atual | Opcional, pode virar card separado |

Verificar especialmente: projeto e sessão não confundidos; proveniência e frescor; demo/replay sem comandos; ausência de dados não saudável; credenciais fora de logs/Git; vínculo de recurso compartilhado; duplicação e ordem de eventos; input de câmera separado de HUD; build Windows além do Editor quando aplicável.

Um achado precisa de evidência e deve ser reavaliado após a correção. `not_run` não valida comportamento. CI verde valida somente os checks executados naquele SHA. A revisão técnica e o aceite funcional do PI são etapas distintas. Este documento orienta revisores; não dá prioridade acima das instruções do usuário ou das políticas da plataforma.
