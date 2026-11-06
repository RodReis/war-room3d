# M1 — primeira fatia: contrato e persistência

Issue [#2](https://github.com/RodReis/war-room3d/issues/2). Esta fatia não observa sessões reais e não liga a Unity ao vivo.

## Escopo entregue no branch

- Envelope `1.0` validado, com contexto obrigatório por família de evento e payload restrito; snapshot `live` com entidades necessárias ao HUD. Capacidades sem implementação são arrays vazios e não são anunciadas.
- Registro explícito de projeto e alias; pastas homônimas permanecem distintas. A sétima sala ocupa outro setor. Chave de sessão deriva de provedor, conta opaca e ID externo.
- SQLite em WAL: evento, estado, revisão, sequência e cursor em transação única. Uma duplicata avança somente cursor monotônico; uma colisão de identidade reverte tudo.
- Sessão sem contexto entra em diagnóstico redigido, sem atribuição arbitrária. Perda de fonte marca sessão e agentes como desconhecidos; encerramento exige evento explícito.

## Validação local

| Prova | Comando | Resultado |
|---|---|---|
| Contratos M0 e M1 | `cd contracts && npm ci && npm test` | `pass`, 7/7 |
| Tipos TypeScript | `cd service && npm run typecheck` | `pass` |
| Domínio e SQLite Windows | `cd service && npm test` | `pass`, 19/19 |
| Adaptadores Claude/Codex | — | `not_run`; fatia posterior |
| HTTP/SSE e Unity live | — | `not_run`; fatias posteriores |
| Sessões reais | — | `not_run`; requer laboratório e escopo de leitura explícitos |

Ambiente: Windows x64, Node.js 24.15.0, npm 11.12.1. Banco de teste criado em diretório temporário e removido após cada caso. Nenhuma conta, transcrição ou sessão pessoal foi lida. As imagens e os GLBs em `docs/arte` foram vistos como referência de experiência e permanecem ignorados pelo Git; não compõem esta entrega.

A revisão automática inicial da PR #8 identificou três regressões reproduzíveis. Os testes passaram a cobrir precisão fracionária dos horários, precedência temporal da perda de fonte e preservação do vínculo pai/filho em atualizações sem parentesco; o código foi corrigido no mesmo branch.

## Limites para a próxima fatia

- Adaptadores devem fornecer `generation` monotônica por arquivo e cursor em offset de fim de registro. Uma quarentena guarda só razão e posição; resolver o contexto depois exige releitura dirigida da fonte autorizada.
- A fonte de evento desconhecida não entra no reducer. A primeira versão do contrato cobre sessão, agente, fonte e um marcador de recurso sem estado M2.
- `tasks[]` e `invocations[]` ainda são vazios. O feed do snapshot contém somente os 100 eventos aceitos mais recentes. Retenção e paginação histórica pertencem a outra fatia.
- Build Unity Windows, p95 serviço→HUD, coleta real e aceite funcional da M1 seguem `not_run`.
