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
| M5 | Redação antes da persistência, paginação/retensão, isolamento por ambiente/projeto, correlação exata por trace/span/request ID, cobertura por fonte, regras imutáveis e incidente que não se resolve com perda de coleta |

Testes unitários cobrem regras determinísticas; integração cobre SQLite, HTTP/SSE e adaptadores com fakes controlados; Unity EditMode/PlayMode cobre cena/input/UI. E2E real exige fonte e laboratório autorizados. Prova visual inclui captura com versão, resolução, câmera/estado e descrição do que a imagem demonstra. Dados sintéticos devem estar marcados; não usar sessões pessoais para fazer o CI passar.

As provas atuais de M5 ficam em [laboratório](validation/m5/laboratorio.md) e [resultado](validation/m5/resultado.md). `m5NetworkSignals` é opt-in, deriva somente health/latência da sonda API M2 e exige retenção explícita. Nenhuma prova sintética é apresentada como conexão de logs, rastros ou detecção real.

## Relatório por SPEC/issue

Guardar em `docs/validation/<etapa>/resultado.md`: issue/PR/SHA, comando, resultado, total de casos, falhas, ambiente, evidência e limitações. Artefatos brutos volumosos podem ficar no CI, com link e retenção registrada. Se não houver SPEC numerada, usar a issue da etapa; não inventar identificador.

Ao alterar testes ou geradores, verificar que uma falha deliberada é detectada pelo gate antes de confiar no novo relatório. Correção de bug verificável deve ter regressão; se não for viável, justificar e anexar prova alternativa.
