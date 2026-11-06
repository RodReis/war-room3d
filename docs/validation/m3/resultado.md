# M3 — resultado parcial

Data: 06/11/2026. Issue #4. Implementação baseada no HEAD `7179dd68901971add5efb5b76d69ac639b135679`.

## Evidência executada

| Prova | Estado | Evidência |
|---|---|---|
| TypeScript estrito do serviço | `pass` | `cd service; npm run typecheck` |
| Testes do serviço | `pass` | `cd service; npm test`; 54/54, Node 24.15.0 |
| Contratos compartilhados | `pass` | `cd contracts; npm test`; 8/8 |
| Repositório explicitamente vinculado | `pass` | Teste sintético usa ID opaco do GitHub; nome igual não cria associação |
| Deduplicação de marco importado | `pass` | Chave por repositório/entidade/transição; desvincular preserva marco histórico |
| Paginação e proteção de credencial | `pass` | HTTP fake cobre páginas, `304`, token recusado e bloqueio de link para outra origem |
| Meu dia | `partial` | União temporal de sessões sobrepostas e fuso IANA; tempo de agente derivado de eventos. Cobertura fica `unknown` enquanto janelas esperadas não forem persistidas |
| Replay HTTP | `partial` | Endpoint autenticado pagina eventos M1 e marcos/efeitos GitHub por cursor, rotula `viewMode=replay`; `POST /v1/commands` retorna `405` |
| API GitHub real | `not_run` | Sem token/repositório explicitamente configurado; testes usam servidor fake |
| Unity M3 / Player Windows | `not_run` | Ainda sem presenters de Meu dia/replay/efeitos; build não provaria a UI M3 |

## Limites conhecidos

- O PR adiciona a base de serviço, não conclui o aceite da issue #4.
- GitHub grava marcos de PR e tentativas concluídas de workflow. Deduplicação cruzada com eventos de transcript ainda não existe. Falha abre incidente por repositório/workflow/run/ref/SHA; somente sucesso em tentativa posterior da mesma identidade resolve.
- Celebração de merge (8s) e alarme CI (5s) ficam persistidos com causa. Retenção/reentrada, snapshots temporais e lacunas explícitas do replay ainda faltam.
- Meu dia não afirma cobertura completa, custos ou produção de tokens. O store atual não persiste janelas esperadas de coleta.
- Não houve acesso a conta/repositório remoto, build Unity, captura visual nem aceite funcional do PI.

Fixtures e testes são sintéticos. Nenhum segredo foi salvo no repositório.
