# Matriz de capacidades M4 — Windows

Data: 07/11/2026. Issue [#5](https://github.com/RodReis/war-room3d/issues/5). Este registro distingue ausência de prova e suporte comprovado; não afirma que os provedores não possuem API.

| Provedor / integração | Versão comprovada para comando | Mensagem | Pergunta | Permissão | Resultado |
|---|---|---|---|---|---|
| Claude real | Nenhuma neste projeto | Indisponível | Indisponível | Indisponível | `not_run`: sem conector M1 de sessão e sem laboratório de comando autorizado |
| Codex real | Nenhuma neste projeto | Indisponível | Indisponível | Indisponível | `not_run`: sem conector M1 de sessão e sem laboratório de comando autorizado |
| Adaptador falso dos testes | `fake-1`, `lab-1` / `test-1` | Exercitada sinteticamente | Exercitada sinteticamente | Exercitada sinteticamente | Testes de gateway/HTTP; nunca invoca CLI, hook, shell ou sessão real |
| Laboratório explícito do Player | `synthetic-adapter-1` / `synthetic-1` | Disponível só no laboratório | Disponível só no laboratório | Disponível só no laboratório | `service/scripts/m4-synthetic-lab.mjs`; tokens e SQLite temporários, sem provedor externo |

## Condições para uma futura habilitação real

Registrar versão exata do provedor e do adaptador, identidade opaca da sessão atual, projeto, ação, origem da prova, instante e validade. O mecanismo precisa endereçar essa sessão e preservar a semântica do pedido; retomar uma conversa por CLI não comprova acesso ao processo observado. Documentar autorização específica do laboratório, escopo mínimo, confirmação correlacionada, recusa, timeout, reinício e revogação no Windows antes de habilitar a ação.

O gateway consulta prova e adaptador compatíveis antes de cada envio. Nenhuma rota HTTP aceita cadastrar provas ou pedidos. As implementações `providers/claude.ts` e `providers/codex.ts` anunciam lista vazia e recusam envio. Não instalaram hooks, não iniciaram processos de agentes e não leram sessões pessoais.

Sucesso do fake comprova a fronteira local de controle, não entrega a um provedor real. Uma futura prova de recebimento também não comprova término da tarefa do agente.
