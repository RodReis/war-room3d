# #34 — logs e evidências da sala

## Estado e escopo

A aba Logs da sala consulta eventos M1 paginados, observações de log M5 por projeto/ambiente/recurso e diagnóstico das fontes de sessão do último snapshot. A PR #26/M5 já estava integrada antes desta fatia; as consultas novas reusam seu store e seu token de leitura. O G3 da sala ainda depende da prova de uma fonte Docker real de laboratório até o Player. Nenhuma fonte pessoal ou operacional foi consultada nesta fatia.

O evento M1 expõe ID, horário, fonte, sessão, agente, proveniência e IDs de evidência; o payload e o conteúdo de conversa ficam fora dessa rota. O detalhe revalida o projeto. A observação M5 conserva IDs explícitos de correlação e revalida projeto e ambiente ao abrir o detalhe. Log de infraestrutura sem sessão permanece sem agente. Referências externas são exibidas como texto; a UI não abre o destino automaticamente. O serviço redige antes de gravar e sinaliza com `[TRUNCADO PELO SERVIÇO]` quando limita um campo textual a 4.096 caracteres.

A consulta recente usa cursor exclusivo e ordem decrescente. A página anterior acrescenta itens sem repetir os já visíveis e pausa a atualização automática; ao consultar página recente, o Player leva a primeira linha para a área visível. O detalhe sobreposto preserva a lista e a posição ao fechar. Filtros: projeto, agente/sessão M1 quando houver, ambiente, recurso, intervalo UTC, severidade e Request ID explícito M5. Ambiente sem recurso associado e fonte ausente aparecem como ausência de cobertura. A cobertura M5 exibida é do **ambiente**; ela não comprova cobertura individual do recurso.

## Validação

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | `pass` — 15/15 | `npm test` em `contracts/` |
| Serviço | `pass` — 172/172 e typecheck | `npm test`, `npm run typecheck` em `service/`; projeto cruzado 404, leitura/comando separados, canário redigido, truncamento, cursor, intervalo com frações, severidade e ID explícito |
| Unity EditMode | `pass` — 15/15 | `Logs/issue-34-validation/unity-edit-final.xml`; fixture M2 atualizada para vínculo projeto/recurso |
| Unity PlayMode | `pass` — 22/22 no HEAD local | `Logs/issue-34-validation/unity-play-34-head.xml`; inclui replay, transporte e sala M2 com fixtures do contrato atual |
| Build Windows | `pass` — Unity 6000.3.27f1, Development, 175.620.684 bytes | `M2LiveProjectSetup.BuildWindowsM5Operations`, `Logs/issue-34-validation/unity-build-34-head-2.log`; Runtime.dll SHA-256 `1613e6ee64d044a7200adda52d3614648e0cbd25107ec21778d3aa188245e565` |
| Player sintético | `pass` funcional e revisão visual local, 1280×720 | Serviço local efêmero e [roteiro](../../../service/scripts/issue-34-synthetic-lab.ts): 13 eventos M1, 13 logs, duas páginas, filtro Request ID, linha longa, canário, detalhe, filtro vazio e perda da fonte. [Página 1](issue-34-01-eventos-pagina-1.png), [página 2](issue-34-02-eventos-pagina-2.png), [detalhe redigido](issue-34-04-log-detalhe-redigido.png), [filtro vazio](issue-34-05-sem-resultado.png), [fonte indisponível](issue-34-06-fonte-indisponivel.png). Resultado em `Logs/issue-34-player-head/issue-34-result.json`; primeira captura SHA-256 `3156ece7e3b884054f2eb79b5fa03b291cd3bef8726b810ebf61f7c99d0db80e`. |
| Fonte Docker real de laboratório → Player | `not_run` — autorização específica pendente | [Roteiro preparado](../../../service/scripts/issue-34-docker-lab.ts): contêiner `api` descartável, imagem local `node:24-alpine`, sem rede/porta/volume, linha sintética, proxy GET restrito ao Compose temporário, coletor M5, SQLite, API e Player. Não executar com autorização antiga da #26. |

## Limites

O Player sintético prova comportamento da UI e contratos, não operação contínua. A fonte Docker proposta é um processo real do laboratório com conteúdo sintético; sua prova só vale depois de autorização específica e execução. O ensaio autorizado de ContaIA da #26 não se estende à #34. Não há vínculo de agente para logs M5 sem ID de sessão; coincidência de horário não cria causalidade. A aba não executa comandos, não consulta conteúdo bruto da conversa e não dá acesso automático a evidências externas.
