# #33 — chat por sessão e interação assistida

## Estado

Implementação técnica em andamento. A prova desta fatia usa somente conteúdo sintético; chat de ida e volta real por provedor, pedido real de pergunta/permissão e aceite funcional do PI permanecem **not_run**. Um recibo M4 confirma apenas o nível de entrega disponível no adaptador, não a resposta do modelo. Esta página não declara G3 concluído.

## Conteúdo e privacidade

O capturador M1 continua removendo prompts e respostas por padrão. Conteúdo só entra no arquivo de observação se o comando do capturador usar `--content` (Claude) ou `--stream --content` (Codex) **e** a fonte configurada no serviço declarar `conversationContent: { "consentRef": "identificador-da-autorizacao", "retentionDays": 1 }`. O prazo aceito é de 1 a 30 dias. Não há fonte de conteúdo real habilitada nesta entrega. IDs de evento M1 e feed não carregam texto; SQLite armazena conteúdo em tabela separada, limita cada mensagem a 8.000 caracteres e remove fisicamente linhas vencidas na inicialização e nas consultas/gravações. Alterar/remover consentimento ou prazo na configuração elimina as linhas antigas. A opção exige autorização específica para fonte, sessão e conteúdo antes do uso fora de laboratório sintético.

`GET /v1/conversations?projectId=…&sessionKey=…&limit=20&before=…` exige token de leitura ou token de comando com projeto autorizado, Host/Origin locais e limite máximo de 50. Cursor é a sequência anterior; a resposta informa origem, papel, horário, fonte, referência nativa, turno explícito quando existe, truncamento e expiração. Mensagem sem referência de turno não é ligada a outra por horário. A UI usa texto literal, sem rich text. Exportação exige percorrer as páginas. `DELETE /v1/conversations?projectId=…&sessionKey=…` exige token de comando do projeto e cabeçalho com a sessão exata; a UI pede confirmação em dois cliques dentro de 10 s. A exclusão remove o conteúdo observado do SQLite e grava um marco para impedir reimportação das mensagens antigas. Não modifica a conversa no provedor nem apaga o arquivo bruto da fonte.

## Player e comandos

A aba Chat mostra histórico do `sessionKey` do agente selecionado na árvore ou no corpo 3D; um botão na atividade abre a aba sem trocar de sala. A paginação mantém os itens da sessão; troca de projeto/agente limpa a vista. Replay não consulta conteúdo live. O botão de interação abre a prévia M4 no mesmo projeto/sessão, e o rascunho é guardado por projeto/sessão/ação. O gateway continua revalidando capacidade e alvo, expiração, idempotência e bloqueio demo/replay; timeout não reenvia. Perguntas e permissões ficam no fluxo nativo quando os adaptadores não as suportam.

## Matriz atual

| Provedor | Histórico opt-in | Envio M4 | Ida e volta real nesta fatia | Pergunta/permissão |
|---|---|---|---|---|
| Claude Code 2.1.319 | Parser de `UserPromptSubmit` e `Stop` com texto, se o hook o expuser; prova sintética | Adaptador de mensagem requer sessão própria e prova atual | **not_run**; ensaio anterior da #31 atingiu rate limit | Adaptador indisponível; fluxo nativo |
| Codex CLI 0.166.0 | Parser de `item/completed` `userMessage`/`agentMessage`; prova sintética | Adaptador de mensagem requer thread própria e prova atual | **not_run**; autorizações anteriores foram consumidas | Adaptador indisponível; fluxo nativo |

## Validação

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | 15/15 pass | `npm test` em `contracts`; página de conversa distingue conteúdo observado de recibo |
| Serviço | 168/168 pass, typecheck pass | `npm test`, `npm run typecheck` em `service`; inclui CLI sintético → coletor → SQLite → HTTP, paginação, isolamento, expiração, revogação e exclusão autorizada |
| Unity PlayMode | 22/22 pass | `Logs/issue-33-playmode-final.xml` |
| Build Windows | pass; Unity 6000.3.27f1; Runtime.dll SHA-256 `81e8e5229dcb0fa266196135ff987e4a6cd2659b9433476293c74fe37cdfd530` | `Logs/issue-33-build-final.log`; build local, distinto da CI |
| Player sintético | pass; 3 avatares, 1 filho vinculado, 2 mensagens da sessão filha, 3ª mensagem de outra sessão excluída; 1280×720 | [captura](issue-33-chat.png) SHA-256 `2d374717ba5562f26d207a13608aeb8f4b88c4f4ec3c91182deef8701549af4d`; `Logs/issue-33-player-final/issue-33-chat.json` |

## Limites

Sem acesso a conversas pessoais, sem novo envio a provedores e sem instalação de hook por esta implementação. As autorizações de laboratório da #31 foram consumidas. O arquivo bruto da fonte com conteúdo opt-in exige política própria de retenção/exclusão; a rota DELETE não o apaga. Não há botão de exportação na UI; a API permite exportação percorrendo páginas. Respostas sintéticas não provam retorno do modelo real; prova por provedor e decisão do PI sobre suporte a pergunta/permissão ainda faltam para concluir a #33 e o G3.
