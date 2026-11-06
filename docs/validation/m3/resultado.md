# M3 — resultado parcial

Data: 06/11/2026. Issue #4. Implementação na branch `feat/m3-historico-github`, derivada de `dfbead358bc67d8daacbb03d1bb00f41f5929fac`.

## Evidência executada

| Prova | Estado | Evidência |
|---|---|---|
| TypeScript estrito do serviço | `pass` | `cd service; npm run typecheck` |
| Testes do serviço | `pass` | `cd service; npm test`; 58/58, Node 24.15.0 |
| Contratos compartilhados | `pass` | `cd contracts; npm test`; 8/8 |
| Repositório explicitamente vinculado | `pass` | Teste sintético usa ID opaco do GitHub; nome igual não cria associação |
| Deduplicação de marco importado | `pass` | Chave por repositório/entidade/transição; desvincular preserva marco histórico |
| Repositório compartilhado | `pass` | Dois projetos vinculados ao mesmo ID recebem marcos e efeitos próprios no teste sintético |
| Paginação e proteção de credencial | `pass` | HTTP fake cobre páginas, `304`, token recusado e bloqueio de link para outra origem |
| Cadastro GitHub sem sonda M2 | `pass` | Configuração local ignorada pelo Git; SQLite em memória retornou um projeto `contaia` e repositório `1371493574` |
| Meu dia | `partial` | União temporal de sessões sobrepostas e fuso IANA; tempo de agente derivado de eventos. Cobertura fica `unknown` enquanto janelas esperadas não forem persistidas |
| Replay HTTP | `partial` | Endpoint autenticado pagina eventos M1 e marcos/efeitos GitHub por cursor, rotula `viewMode=replay`; `POST /v1/commands` retorna `405` |
| Metadados GitHub públicos do ContaIA | `pass` pontual | [Repositório](https://api.github.com/repos/RodReis/rrb-contaia) confirmou ID `1371493574`; [lista de PRs](https://api.github.com/repos/RodReis/rrb-contaia/pulls?state=closed&sort=updated&direction=desc&per_page=1) trouxe `merged_at`, e [runs](https://api.github.com/repos/RodReis/rrb-contaia/actions/runs?status=completed&per_page=1) trouxeram envelope `workflow_runs`. Leitura por conector, sem ingestão pelo produto |
| Polling do produto na API GitHub real | `pass` pontual | Cliente do produto, sem token, consultou o repositório público configurado; SQLite temporário retornou 542 marcos de primeiro carregamento, 6 no dia local, 0 incidentes abertos/resolvidos no dia e 0 erros. Primeiro replay rotulado `backfill`. Sem processo contínuo nem acesso a dados privados |
| Unity M3 / Player Windows | `not_run` | Ainda sem presenters de Meu dia/replay/efeitos; build não provaria a UI M3 |

## Limites conhecidos

- O PR adiciona a base de serviço, não conclui o aceite da issue #4.
- GitHub grava marcos de PR e tentativas concluídas de workflow. Deduplicação cruzada com eventos de transcript ainda não existe. Falha abre incidente por repositório/projeto/workflow/ref; sucesso posterior da mesma trilha resolve. Falhas históricas não viram incidentes do dia atual. O dia lista aberturas e resoluções do período, não todos os incidentes ainda abertos.
- Celebração de merge (8s) e alarme CI (5s) ficam persistidos com causa. Retenção/reentrada, snapshots temporais e lacunas explícitas do replay ainda faltam.
- Meu dia não afirma cobertura completa, custos ou produção de tokens. O store atual não persiste janelas esperadas de coleta.
- Não houve polling com token, build Unity, captura visual nem aceite funcional do PI. O checkout ContaIA foi apenas inspecionado por metadados Git e permanece com mudanças locais próprias preservadas.

Fixtures de eventos e testes são sintéticos; metadados públicos pontuais têm fonte identificada. Nenhum segredo foi salvo no repositório.
