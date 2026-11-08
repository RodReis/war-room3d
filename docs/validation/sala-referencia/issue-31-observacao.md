# #31 — Observação de sessões e atividade

Estado: **prova sintética local**. Laboratório Claude/Codex, subagente real, correlação visual no Player e aceite G3: **not_run**. Nenhum hook foi instalado, nenhuma sessão pessoal foi lida e nenhum comando foi enviado a provedor por esta fatia.

## Escopo implementado

- `event.v1` passou a admitir tarefa, ferramenta, skill, mensagem e pedido por ID/metadados, sem conteúdo bruto. `snapshot.v1` já previa `tasks`/`invocations`; migração `0017` materializa ambas e mantém `event.v1` compatível com eventos anteriores.
- Configuração opt-in exige projeto canônico, provedor, conta opaca, versão, `sourceId` e caminho absoluto de arquivo. `capture-source.ts` descarta prompt, conteúdo, comando, resultado, paths e respostas RPC antes de gravar JSONL. Guarda somente hash do `cwd` canônico; leitor recusa projeto homônimo alheio. Para Codex, `thread/started` precisa trazer `cwd` e notificações seguintes precisam apontar para thread cadastrada. Claude usa entrada única de hook; Codex usa `--stream` para notificações encaminhadas por **cliente dono** do app-server.
- Leitor usa cursor SQLite por identidade de arquivo, aplica todos os eventos de uma linha na mesma transação, ignora linha parcial, reconhece rotação, deduplica IDs nativos quando presentes e recupera após reinício. Captura guarda instante do hook ou da notificação Codex (`startedAtMs`/`completedAtMs` quando exposto); `observedAt` preserva esse instante no backfill e `receivedAt` marca a coleta. Remoção de fonte da configuração marca fonte/sessões como indisponíveis; `staleAfterMs` opcional marca incerteza após silêncio, sem afirmar que a sessão terminou. Snapshot expõe `errorCode` fechado (`file_missing`, `invalid_scope`, `malformed_json`, `stale`, `read_error`, `revoked`) sem conteúdo bruto.
- API `/v1/snapshot` e SSE existente expõem projeção; `LiveSnapshot` do Unity recebe `tasks`, `invocations` e `sources`. Exibição contextual/avatares pertencem às #32/#33; esta fatia não alega G3 visual.

## Matriz de fonte — versões locais verificadas em 08/11/2026

`claude --version`: 2.1.319. `codex --version`: 0.166.0. Matriz baseada em [hooks oficiais Claude](https://code.claude.com/docs/en/hooks) e [protocolo oficial Codex](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol). Versões instaladas foram consultadas; eventos reais destas versões **não foram capturados** nesta issue. “Adaptado” significa caminho de código sinteticamente exercitado, não prova de suporte operacional.

| Informação | Claude 2.1.319 | Codex 0.166.0 |
|---|---|---|
| Início/presença | `SessionStart` adaptado | `thread/started` adaptado |
| Trabalho/espera/fim | `UserPromptSubmit`/`Stop`/`SessionEnd` adaptados; `resume` explícito | `turn/started`/`turn/completed` adaptados; fim definitivo de thread ausente nesta fonte |
| Subagente/pai | `SubagentStart`/`SubagentStop` adaptados; ID de pai ausente no payload documentado fica vínculo pendente | `collabAgentToolCall` com `senderThreadId`/`receiverThreadIds` adaptado; fim de filho não comprovado |
| Tarefa | `TaskCreated`/`TaskCompleted` adaptados; título redigido | Evento de tarefa não identificado; ausente |
| Ferramenta | `PreToolUse`/`PostToolUse`/`PostToolUseFailure` adaptados | `item/started`/`item/completed` por categoria adaptados |
| Skill | `PreToolUse` de `Skill` adaptado como **invocação observada**; fim confiável ausente | Evento de invocação de skill não identificado; ausente |
| Mensagem | `UserPromptSubmit` como metadado de mensagem; texto descartado | `userMessage` em `item/completed` como metadado; texto descartado |
| Pedido | `PermissionRequest` como metadado; decisão não observada | Callback do cliente não é notificação capturada; ausente |

Em ambos, caminhos não observados ficam **ausentes**; nenhum estado de tarefa, skill ou agente é inferido a partir de silêncio. `source.unavailable` e expiração de frescor tornam trabalho pendente `desconhecida`; não marcam conclusão. Pai Claude sem ID explícito permanece `vinculo_pendente`. Esses limites impedem marcar G3 como `pass`.

## Ativação e revogação delimitadas

Pré-condição: autorização específica do PI para **projeto e sessão de laboratório**, caminho de spool, conta opaca, versão e janela; não apontar para transcrições pessoais. Criar configuração local fora do Git, com `schemaVersion: "1.0"`, `projects: [{"projectId":"lab","name":"Laboratório","canonicalPath":"C:\\lab\\projeto"}]` e `sources: [{"sourceId":"claude-lab","sourceVersion":"2.1.319","provider":"claude","projectId":"lab","accountRef":"lab-opaca","filePath":"C:\\lab\\observacao\\claude.jsonl","staleAfterMs":60000}]`. `staleAfterMs` é janela escolhida para o laboratório, não regra de negócio. Definir `WR3D_SESSIONS_CONFIG_PATH` para esse JSON ao iniciar o serviço.

Para Claude, um hook **local ao projeto autorizado** em `.claude/settings.local.json` pode chamar `node <caminho absoluto>/service/src/sessions/capture-source.ts claude <spool absoluto>` para os eventos listados na matriz. Não substituir configurações existentes; revisar diff e remover somente entradas próprias na revogação. Para Codex, cliente que **já possui** o app-server pode encaminhar linhas de notificação para `node <caminho absoluto>/service/src/sessions/capture-source.ts codex <spool absoluto> --stream`; esta fatia não inicia/retoma thread nem se anexa a sessão pessoal.

Teste de configuração: iniciar serviço, confirmar fonte/IDs e `lastApplied` em `/v1/snapshot`, SSE após cursor e ausência de conteúdo bruto no spool/SQLite. Revogação: retirar hook/encaminhamento e a entrada correspondente de `sources`, reiniciar serviço; `session_source_bindings` reconcilia e publica `source.unavailable`. Preservar spool para auditoria ou remover somente após revisão do alvo. Não existe instalação global automática.

## Validação

Ambiente: Windows, Node 24.15.0, Unity 6000.3.27f1. Testes usam arquivos e sessões sintéticos temporários. `cd contracts && npm test`: **13/13 pass**. `cd service && npm run typecheck && npm test`: **typecheck pass, 143/143 pass**. Unity EditMode: **15/15 pass** após campo `errorCode`, XML em `%TEMP%/wr3d-31-editmode-final.xml`; primeira execução apenas importou projeto, segunda e terceira executaram testes. `git diff --check`: **pass**. Provas específicas: duas principais homônimas em projetos distintos, rejeição de `cwd` homônimo alheio, filho Codex com pai, linha parcial, duplicata, rotação, reinício/cursor, perda, expiração, retomada explícita, captura redigida, backfill com horário da fonte, SQLite → HTTP/SSE. Player e hook real: **not_run**.

## Impedimento externo para G3

A issue e o planejamento da #28 proíbem inferir autorização para hooks, contas e sessões. Falta alvo autorizado para ensaio real: projeto/caminho, novas sessões Claude/Codex descartáveis, conta e custo/prazo máximos, um subagente real e permissão de instalar/remover hook local. Sem isso, não há prova fonte → store/API → Player nem decisão sobre capacidades obrigatórias ausentes. Esta PR contém somente a base opt-in validada com dados sintéticos; a #31 permanece em `proplan:doing` até G3 e decisão do PI. CI verde sintética não substitui G3.
