# War-Room3D M1 — Quartel Vivo Implementation Plan

> **Prioridade revisada em 08/11/2026:** a [sala completa de referência (#28)](https://github.com/RodReis/war-room3d/issues/28) concentra o acabamento visual e o fluxo de uso antes da replicação. Consultar [especificação](../../specs/2026-11-08-sala-referencia-design.md) e [plano atual](2026-11-08-sala-referencia-player.md). Este plano permanece referência do subsistema; seu fechamento não comprova a nova experiência no Player.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar sessões reais de Claude Code e Codex nas salas corretas, com agentes, tarefas, ferramentas, feed, proveniência e diagnóstico de fontes, sem comandos de controle.

**Architecture:** Um serviço Node 24 normaliza sinais de adaptadores versionados, resolve identidades, persiste eventos e estado em SQLite, publica snapshot HTTP e deltas SSE. A Unity consome apenas esse contrato; a demonstração M0 permanece isolada.

**Tech Stack:** TypeScript estrito, Node.js 24, JSON Schema/Ajv, better-sqlite3 com WAL, HTTP/SSE e Unity 6.3 LTS. Fixar versões efetivas e testar o módulo SQLite nativo em Windows x64. Referências: [transações better-sqlite3](https://github.com/wiselibs/better-sqlite3/blob/master/docs/api.md), [isolamento WAL](https://www.sqlite.org/isolation.html).

---

## Escopo e mapa

PRD RF-01–RF-13, RF-34–RF-37 e RNF-01/RNF-04/RNF-08/RNF-09; GDD seções 10, 13, 14, 18 e 20. M1 observa. Mensagens, aprovações, Docker, GitHub independente e replay ficam em planos posteriores. Não ler contas, sessões ou transcrições pessoais nos testes automatizados: usar fixtures sintéticas, depois executar ensaio controlado em diretórios explicitamente configurados pelo usuário.

| Arquivo | Responsabilidade |
|---|---|
| `contracts/schemas/event.v1.schema.json` | Envelope versionado, proveniência e contexto |
| `contracts/schemas/snapshot.v1.schema.json` | Estado de leitura para Unity |
| `service/src/domain/project-registry.ts` | Projeto, caminho canônico, aliases e colisões |
| `service/src/domain/session-reducer.ts` | Presença, agentes, vínculos, tarefa e ferramentas |
| `service/src/domain/normalize.ts` | Validação, deduplicação e quarentena redigida |
| `service/src/store/event-store.ts` | Transação evento/estado/cursor e revisão |
| `service/src/adapters/claude.ts`, `codex.ts` | Leitores de fonte e saúde, sem comandos |
| `service/src/http/server.ts`, `sse.ts` | Health, snapshot, eventos, reconexão |
| `unity/Assets/WarRoom3D/Runtime/Live/` | StateClient e presenters, sem parsing de fonte |
| `service/test/`, `contracts/fixtures/m1/` | Regressões sintéticas |

## Task 0: Criar o serviço local testável

**Files:** Create `service/package.json`, `service/tsconfig.json`, `service/src/index.ts`, `service/test/smoke.test.ts`.

- [ ] **Step 1: Criar teste `smoke.test.ts` que importa `createService` de `src/index.ts` e verifica `listen=false` sem abrir porta.** Rodar `npm test` em `service/`; esperar falha pela ausência do manifesto e módulo.
- [ ] **Step 2: Criar `package.json` com `type=module`, `engines.node >=24 <25`, scripts `test: node --test`, `typecheck: tsc --noEmit` e dependências exatas instaladas por `npm install --save-exact ajv better-sqlite3` mais `npm install --save-dev --save-exact typescript @types/node @types/better-sqlite3`.** Registrar `package-lock.json`; não adicionar biblioteca HTTP até a API necessitar.
- [ ] **Step 3: Configurar `tsconfig.json` com `target=ES2022`, `module=NodeNext`, `moduleResolution=NodeNext`, `strict=true`, `noEmit=true`; exportar `createService({ listen: false })` como instância inerte em teste.** Rodar `npm test` e `npm run typecheck`; esperar aprovação. Commit seletivo de `service/`.

## Task 1: Definir contratos públicos e testes de compatibilidade

**Files:** Create `contracts/schemas/event.v1.schema.json`, `snapshot.v1.schema.json`, fixtures válidos/inválidos e `contracts/test/m1-contract.test.mjs`.

- [ ] **Step 1: Escrever testes que aceitam evento de sessão e evento de recurso sem sessão; rejeitam ausência de `sourceId`, `observedAt`, `provenance` e versão major diferente.** O teste carrega os schemas por Ajv e verifica `validate(valid) === true`, `validate(invalid) === false` para cada caso.
- [ ] **Step 2: Rodar `npm test` em `contracts/`; esperar falha pelos novos schemas/fixtures.**
- [ ] **Step 3: Criar envelope com campos `schemaVersion`, `sourceId`, `sourceEventId?`, `sourceVersion`, `sourceSequence?`, `eventId`, `streamSequence?`, `type`, `observedAt`, `occurredAt?`, `receivedAt`, `projectId?`, `provider?`, `sessionKey?`, `agentKey?`, `resourceId?`, `environmentId?`, `correlationId?`, `causationId?`, `provenance`, `ingestionMode`, `payload` e `evidenceRefs[]`.** `provenance` é `observed|inferred|user_asserted|illustrative`; `ingestionMode` é `live|backfill|resync|demo`. Regras condicionais exigem `projectId`, `provider` e `sessionKey` para evento de sessão/agente; evento de recurso exige `resourceId` e `environmentId`. `additionalProperties: false` no envelope. O primeiro schema cobre apenas tipos de evento implementados na fatia, sem aceitar payload bruto de provedor.
- [ ] **Step 4: Criar snapshot com `revision`, `streamSequence`, `projects[]`, `roomPlacements[]`, `sessions[]`, `agents[]`, `tasks[]`, `invocations[]`, `feed[]`, `sources[]`, `capabilities[]` e `mode=live`.** Arrays ainda não implementados permanecem vazios e suas capacidades não são anunciadas. Nunca serializar credenciais ou texto bruto de prompt. Rodar `npm test`; esperar aprovação. Commit seletivo de `contracts/`.

## Task 2: Resolver identidade de projeto e sessão

**Files:** Create `project-registry.ts`, `session-reducer.ts` e testes correspondentes em `service/test/domain/`.

- [ ] **Step 1: Testar dois projetos de mesmo nome em caminhos diferentes, alias Windows/WSL explícito, worktree separada e principal com filho sem pai resolvido.** Esperado: IDs distintos onde não há alias, filho em `vinculo_pendente`.
- [ ] **Step 2: Rodar `npm test` em `service/`; esperar falha por módulos ausentes.**
- [ ] **Step 3: Implementar regra de identidade:** chave externa `(provider, accountRef, providerSessionId)` identifica sessão; `cwd` apenas sugere projeto. Registro de projeto usa ID persistido e conjunto de caminhos normalizados; aliases são entradas aprovadas, nunca equivalência por nome. Uma sessão sem projeto vai à quarentena, sem escolher a primeira sala.
- [ ] **Step 4: Implementar transições puras de presença:** `observada`, `trabalhando`, `aguardando`, `desconhecida`, `encerrada`; `lastSeen` e frescor separados. Saída visual requer encerramento confirmado; desconexão marca `desconhecida`. Rodar testes, incluindo evento tardio que não reabre sessão encerrada sem evidência nova. Commit seletivo.

## Task 3: Persistir evento, deduplicação e cursor atomicamente

**Files:** Create `service/src/store/schema.sql`, `event-store.ts`, `service/test/store/event-store.test.ts`.

- [ ] **Step 1: Testar ingestão repetida, falha antes do commit, reinício e novo evento após cursor.** Uma duplicata não altera revisão, feed nem contagem de agente; estado e cursor sobrevivem juntos.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Criar tabelas `events`, `source_cursors`, `projects`, `sessions`, `agents`, `room_placements` e `meta`.** `events` usa `UNIQUE(source_id, dedupe_key)`; `meta` guarda `stream_sequence` e `schema_version`. Habilitar `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout` e diretório de dados fora do repositório.
- [ ] **Step 4: Implementar transação síncrona única.** Exemplo da fronteira, após validação do evento:

```ts
const apply = db.transaction((event: NormalizedEvent, cursor: Cursor) => {
  const inserted = insertEventOrIgnore.run(event);
  if (inserted.changes === 0) {
    advanceCursorIfMonotonic(cursor);
    return { applied: false, revision: readRevision() };
  }
  applyState(event);
  advanceCursorIfMonotonic(cursor);
  return { applied: true, revision: nextRevision() };
});
```

- [ ] **Step 5: Publicar delta somente após retorno da transação.** Rodar testes com banco temporário no Windows, incluindo `SQLITE_FULL` simulado por falha de escrita; comandos futuros ficam indisponíveis quando auditoria não persiste. Commit seletivo.

## Task 4: Adaptadores observadores Claude e Codex

**Files:** Create `service/src/adapters/{claude,codex,source-health}.ts` e `service/test/adapters/`.

- [ ] **Step 1: Criar fixtures sintéticas para linha parcial, truncamento, rotação, arquivo inacessível, fork herdado, sessão sem `cwd`, dois provedores e subagente.** Testar que conteúdo herdado não conta como atividade nova e erro em uma fonte não paralisa outra.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar adaptadores com diretórios explicitamente permitidos, leitura incremental, checkpoint por arquivo/geração/offset e reconciliação periódica limitada.** Cada adaptador declara `sourceVersion`, `capabilities` e `lastObserved`; nunca instala hook global automaticamente. Aplicar redação antes de persistir evidência ou erro.
- [ ] **Step 4: Validar fontes em laboratório controlado, versões de CLI e formato observadas; registrar matriz em `docs/validation/m1/sources.md`.** Se formato não tiver semântica estável, apresentar capacidade como indisponível. Rodar suíte sintética e ensaio permitido; commit seletivo.

## Task 5: Expor snapshot e SSE com recuperação

**Files:** Create `service/src/http/{server,sse}.ts`, `service/test/http/sync.test.ts`.

- [ ] **Step 1: Testar snapshot `revision=N`, delta `N+1`, reconexão com cursor, cursor expirado, cliente lento e versão major incompatível.** Heartbeat não altera presença de agentes.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar `GET /v1/health`, `/v1/capabilities`, `/v1/snapshot`, `/v1/events` em loopback, com autenticação local e serialização validada.** SSE usa `id: <streamSequence>`, `data: <json>`, heartbeat de 15 s, replay somente dentro da retenção. Cursor expirado retorna instrução de novo snapshot; fila acima de 8 MB desconecta o cliente com diagnóstico.
- [ ] **Step 4: Rodar teste de carga sintética 10 eventos/s e burst de 100 eventos; registrar p95 serviço→HUD separadamente do atraso da fonte.** Commit seletivo.

## Task 6: Ligar Unity à leitura real sem misturar demonstração

**Files:** Create `StateClient.cs`, `RoomPresenter.cs`, `AgentPresenter.cs`, `SourceStatusPresenter.cs` em `unity/Assets/WarRoom3D/Runtime/Live/`; modify HUD and scene M0.

- [ ] **Step 1: Testar que `mode=demo` rejeita endereço de serviço e que `mode=live` não carrega fixture.** Testar seleção e isolamento de dois projetos, dois principais na mesma sala, subagente e perda de fonte.
- [ ] **Step 2: Rodar testes Unity; esperar falha.**
- [ ] **Step 3: Implementar cliente assíncrono snapshot→deltas, com aplicação no thread principal em lotes limitados.** A cena lê modelos de consulta; sala reutiliza módulos M0, estado da fonte fica separado da atividade. Reconexão não duplica avatar nem efeitos.
- [ ] **Step 4: Testar build Windows fora do Editor com duas sessões independentes e um subagente, sem dados de demonstração.** Capturar quartel, interior, feed, árvore, fonte desatualizada e última sessão saindo. Registrar versão, testes e latência em `docs/validation/m1/resultado.md`; commit seletivo.

## Saída de M1

Concluir somente com isolamento de projetos, reconexão sem duplicação, diagnóstico de cobertura, build Windows e evidências reais de laboratório autorizadas. M2 receberá inventário e vínculo de recursos; ausência de conector não equivale a infraestrutura saudável.
