# M4 — mensagens em canais vinculados

Continuação da issue #5 / PR #24, base `346af67`. Escopo: substituir ausência de implementação de mensagem por fábricas de adaptadores testáveis, preservando o padrão indisponível no serviço normal.

## Contrato

Um supervisor autorizado entrega um canal JSONL já aberto e a vinculação `(provider, providerVersion, accountRef, providerSessionId, projectId, connectionId)`. A chave local deve ser a identidade M1 derivada desse vínculo. O adaptador não inicia processo, não lê históricos, não cria/retoma thread e não emite shell. Trocar ou fechar o canal invalida o vínculo.

Codex 0.166.0: `turn/start` para thread ociosa; `turn/steer` com `expectedTurnId` para turno ativo conhecido. Só a resposta RPC do ID emitido confirma recebimento; status de erro ou resposta incompatível não confirma. Claude Code 2.1.319: envia `user` com UUID próprio e só confirma o eco `isReplay=true`, UUID, sessão e conteúdo correspondentes. Texto do assistente, resultado de outra mensagem ou simples escrita no stdin não comprova recebimento.

Permissão e pergunta permanecem indisponíveis nesta fatia. Não inferir confirmação de uma aprovação pelo sucesso de escrita ou por `serverRequest/resolved`: o protocolo também emite resolução quando limpa pedidos. Nenhuma regra persistente de permissão é emitida.

## Execução nesta sessão

- [x] Escrever testes vermelhos de canal limitado, fragmentação UTF-8, fechamento/cancelamento e correlação.
- [x] Implementar `commands/providers/jsonl-channel.ts` e `owned-session.ts`, sem acesso a contas ou processos.
- [x] Escrever testes vermelhos dos adaptadores por versão, alvo e protocolo.
- [x] Implementar fábricas em `codex.ts`/`claude.ts`, mantendo exports padrão indisponíveis.
- [x] Integrar adaptador de protocolo com gateway/auditoria no teste sintético; clique duplo, timeout e revogação não podem duplicar mensagem.
- [x] Preparar roteiro reproduzível para laboratório real, com destinatários descartáveis e limites explícitos. O ensaio real exige autorização específica conforme AGENTS.md; autenticações e sessões pessoais não serão inspecionadas.
- [x] Validar contratos/serviço, revisar diff, atualizar matriz/evidências, publicar na mesma PR e conferir CI no HEAD. Protocolos em `e769409`, prova Claude em `bec34ae`, ambos com CI aprovado; laboratório Codex posterior em [evidência própria](../../validation/m4/codex-laboratorio.md).

## Fontes

- Schema emitido pelo CLI local: `codex-cli 0.166.0`, `codex app-server generate-json-schema --out Logs/m4-protocol-codex-0.166.0`. Geração não inicia thread nem inferência. O schema local é a referência da versão instalada.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): inicialização, turn/start, turn/steer e correlação RPC.
- [Claude CLI](https://code.claude.com/docs/en/cli-reference) e [tipos do SDK](https://code.claude.com/docs/en/agent-sdk/typescript): stream-json, replay-user-messages e SDKUserMessageReplay. Versão local consultada somente com `--version`/`--help`.
