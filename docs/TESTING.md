# Estratégia de validação

## Estado e princípio

Ainda não há código de produto neste checkout. Os cenários abaixo definem provas para cada etapa; não são resultados executados. Cada relatório informa `pass`, `fail` ou `not_run`, versão do código, ambiente, comando e evidência. Um check verde de CI não substitui aceite visual e funcional.

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
