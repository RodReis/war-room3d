# Matriz de capacidades M4 — Windows

Data: 07/11/2026. Issue [#5](https://github.com/RodReis/war-room3d/issues/5). Este registro distingue ausência de prova e suporte comprovado; não afirma que os provedores não possuem API.

| Provedor / integração | Versão comprovada para comando | Mensagem | Pergunta | Permissão | Resultado |
|---|---|---|---|---|---|
| Claude Code real em laboratório | `2.1.319`, sessão nova encerrada ao final | Recibo CLI comprovado pontualmente; indisponível fora do alvo ensaiado | Indisponível | Indisponível | `pass` pontual: uma mensagem, eco correlacionado e auditoria; [prova Windows](claude-windows.md); não atesta conclusão do modelo |
| Codex real | Sem prova de entrega; CLI local `0.166.0` | Indisponível | Indisponível | Indisponível | `not_run`: [laboratório preparado](codex-laboratorio.md), pré-testes sintéticos e schema local; falta autorização específica e prova real |
| Fábricas de canal vinculado | Codex `0.166.0`, Claude `2.1.319` | Testes sintéticos de protocolo | Indisponível | Indisponível | [Continuação](protocolos.md); não recebem canal/sessão automaticamente do serviço normal |
| Adaptador falso dos testes | `fake-1`, `lab-1` / `test-1` | Exercitada sinteticamente | Exercitada sinteticamente | Exercitada sinteticamente | Testes de gateway/HTTP; nunca invoca CLI, hook, shell ou sessão real |
| Laboratório explícito do Player | `synthetic-adapter-1` / `synthetic-1` | Disponível só no laboratório | Disponível só no laboratório | Disponível só no laboratório | `service/scripts/m4-synthetic-lab.mjs`; tokens e SQLite temporários, sem provedor externo |

## Condições para uma futura habilitação real

Registrar versão exata do provedor e do adaptador, identidade opaca da sessão atual, projeto, ação, origem da prova, instante e validade. O mecanismo precisa endereçar essa sessão e preservar a semântica do pedido; retomar uma conversa por CLI não comprova acesso ao processo observado. Documentar autorização específica do laboratório, escopo mínimo, confirmação correlacionada, recusa, timeout, reinício e revogação no Windows antes de habilitar a ação.

O gateway consulta prova e adaptador compatíveis antes de cada envio. Nenhuma rota HTTP aceita cadastrar provas ou pedidos. Os exports padrão `claudeCommands` e `codexCommands` anunciam lista vazia e recusam envio; as novas fábricas exigem conexão já vinculada pelo host e prova separada antes de oferecê-las na UI. O ensaio autorizado iniciou somente um processo Claude descartável e o encerrou após o recibo; não instalou hooks nem leu sessões pessoais pelo roteiro.

Sucesso do fake comprova a fronteira local de controle, não entrega a um provedor real. O recibo CLI do laboratório não comprova término da tarefa do agente e não habilita outra sessão ou provedor.
