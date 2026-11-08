# Estratégia de validação

## Estado e princípio

A M0 tem código e provas em `docs/validation/m0/resultado.md`. A primeira fatia M1 tem [provas sintéticas](validation/m1/contrato-store.md) e a M2 tem [provas de domínio e demonstração](validation/m2/resultado.md). Os demais cenários definem provas, não resultados executados. Cada relatório informa `pass`, `fail` ou `not_run`, versão do código, ambiente, comando e evidência. Um check verde de CI não substitui aceite visual e funcional.

| Etapa | Provas essenciais |
|---|---|
| M0 | Fixture/schema, seis módulos, mesma sala em três vistas, órbita/zoom, HUD, build Windows |
| M1 | Identidades, duas sessões e subagente, deduplicação, reinício, reconexão, perda de fonte |
| M2 | Vínculo muitos-para-muitos, sem dados, coletor perdido, recurso compartilhado, infraestrutura sem agentes |
| M3 | Merge/CI por entidade, Meu dia com fuso/lacuna, replay isolado |
| M4 | Capacidade por provedor, prazo, idempotência, timeout incerto, auditoria e rejeição demo/replay |
| M5 | Redação de logs, paginação, correlação explícita, detector ausente, incidente e falso positivo |

Testes unitários cobrem regras determinísticas; integração cobre SQLite, HTTP/SSE e adaptadores com fakes controlados; Unity EditMode/PlayMode cobre cena/input/UI. E2E real exige fonte e laboratório autorizados. Prova visual inclui captura com versão, resolução, câmera/estado e descrição do que a imagem demonstra. Dados sintéticos devem estar marcados; não usar sessões pessoais para fazer o CI passar.

## Relatório por SPEC/issue

Guardar em `docs/validation/<etapa>/resultado.md`: issue/PR/SHA, comando, resultado, total de casos, falhas, ambiente, evidência e limitações. Artefatos brutos volumosos podem ficar no CI, com link e retenção registrada. Se não houver SPEC numerada, usar a issue da etapa; não inventar identificador.

Ao alterar testes ou geradores, verificar que uma falha deliberada é detectada pelo gate antes de confiar no novo relatório. Correção de bug verificável deve ter regressão; se não for viável, justificar e anexar prova alternativa.

## Sala de referência — #28 e #35

Aplicar a [especificação](specs/2026-11-08-sala-referencia-design.md) e o [plano](superpowers/plans/2026-11-08-sala-referencia-player.md). Resultados ainda não executados. Guardar manifesto, roteiro, matriz por provedor e resultado em docs/validation/sala-referencia/ na implementação.

- G1: arte no Player, quartel/interior/ângulo oposto da mesma instância, comparação ao conceito e revisão do PI.
- G2: jornada controlada identificada, seleção/atividade/chat/pedido/log/evidência/retorno e negativos.
- G3: duas principais Claude/Codex, subagente real, atividade/skills expostas, chat de ida/volta por provedor e fonte real de logs, em laboratório especificamente autorizado; correlação até Player. Obrigatório sem suporte exige decisão do PI, não PASS automático.
- G4: mesmo build final, hash/SHA, ambiente, matriz de fontes, capturas e decisão explícita do PI. Nada de replicar acabamento antes do aceite.
- RNF-01: p95 ≤2 s em 10 eventos/s; RNF-02: 1080p/10 minutos, apresentação p95 ≤16,67 ms visual e ≤33,33 ms reduzido; perda de amostras, CPU/GPU/memória e janela visível registradas. FPS interno não substitui apresentação. Relacionar #16.
- RNF-06: 1920×1080 e 1440×900 em 100/125/150%, mais regressão 1366×768; contexto/ações legíveis e input de UI separado da câmera.

Editor, CI, build, fixture, operação real e aceite humano são evidências distintas. Capturas de builds diferentes não formam uma entrega final única. Ausência de fonte e not_run ficam explícitos; não contornar revisão automática por outro canal.
