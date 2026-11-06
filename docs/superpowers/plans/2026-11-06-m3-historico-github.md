# War-Room3D M3 — Histórico e GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar “Meu dia” e replay determinísticos a partir dos eventos persistidos, correlacionar PR/CI do GitHub e exibir celebrações e alarmes reproduzíveis sem apagar incidentes.

**Architecture:** Um conector GitHub independente observa repositórios explicitamente vinculados. Uma camada de marcos deduplica sinais de transcrições e da API; agregadores derivados calculam o dia e o replay por cursor. A Unity apresenta marcos/efeitos como projeção, mantendo fatos e animações separados.

**Tech Stack:** Serviço M1/M2, SQLite, API GitHub REST, HTTP/SSE, Unity. [Runs de workflows](https://docs.github.com/en/rest/actions/workflow-runs), [estado de merge](https://docs.github.com/en/rest/pulls/pulls). Token com escopo mínimo guardado fora do Git; polling com paginação, `ETag` quando aplicável e tratamento de limite da API.

---

## Escopo e mapa

PRD RF-24–RF-30, RF-35–RF-38; GDD seções 8, 15, 17 e 20. O conector GitHub é independente da execução dos agentes. Um merge agendado não é merge concluído; `workflow/ref/run/attempt` compõem identidade do CI. “Meu dia” relata cobertura e lacunas, não produtividade humana. Replay/demonstração bloqueiam comandos reais no servidor, mesmo que a UI erre.

| Arquivo | Responsabilidade |
|---|---|
| `service/src/github/repository-map.ts` | Associação explícita projeto↔repositório |
| `service/src/github/github-client.ts` | Paginação, `ETag`, limite e credencial |
| `service/src/github/github-normalizer.ts` | PR, merge, workflow/run/attempt |
| `service/src/history/milestones.ts` | Deduplicação por entidade/transição |
| `service/src/history/day-summary.ts` | Intervalos, marcos e cobertura |
| `service/src/history/replay.ts` | Snapshot temporal e deltas sem efeitos ao vivo |
| `unity/Assets/WarRoom3D/Runtime/History/` | Meu dia, linha do tempo e EffectDirector |
| `service/test/{github,history}/` | Fakes paginados, relógio e fusos |

## Task 1: Vincular GitHub sem inferir projeto pelo nome

**Files:** Create `repository-map.ts`, migration `project_repositories` e tests.

- [ ] **Step 1: Testar dois projetos com repositórios homônimos em owners diferentes, mesmo repositório em dois projetos e remoção do vínculo.** Esperado: nenhum evento atribuído sem vínculo explícito; remoção não reescreve marcos antigos.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Persistir `repositoryId`, owner/repo, `projectId`, escopo e data de vigência.** Não usar caminho local ou texto de commit como identidade. Rodar testes e commit seletivo.

## Task 2: Coletar PR e CI por API independente

**Files:** Create `github-client.ts`, `github-normalizer.ts`, tests com servidor HTTP fake.

- [ ] **Step 1: Testar paginação, `304`, limite de taxa, token revogado, PR aberto/fechado/mergeado, execução de CI com segunda tentativa e falha após verde antigo.** Um erro de API afeta cobertura do GitHub, não apaga marcos anteriores.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Consultar somente repositórios vinculados, com token de escopo mínimo e cursor por entidade.** Normalizar identidade:

```ts
type CiIdentity = {
  repositoryId: string;
  workflowId: number;
  runId: number;
  attempt: number;
  ref: string;
  headSha: string;
};
```

- [ ] **Step 4: Aplicar paginação e backoff conforme resposta da API; persistir cursor após eventos.** Não usar webhook público em M3. Rodar testes, incluindo merge fora de sessão de agente; commit seletivo.

## Task 3: Unificar marcos e acionar efeitos persistidos

**Files:** Create `milestones.ts`, `service/src/history/effects.ts`, tests.

- [ ] **Step 1: Testar mesmo merge visto em transcrição e API, CI vermelho de workflow A e verde de workflow B, rerun verde do workflow A.** Esperado: um marco/uma festa; verde B não resolve A; rerun A pode resolver pela regra versionada.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Usar chave `(provider, repositoryId, entityType, entityId, transition)` para marco e `causationId` para efeito.** Persistir festa breve de merge (8 s configuráveis) e giroflex breve para falha; marcador de incidente não expira com a animação. Backfill não toca efeito ao vivo.
- [ ] **Step 4: Rodar testes de duplicação/reinício; commit seletivo.**

## Task 4: Calcular Meu dia com cobertura honesta

**Files:** Create `day-summary.ts`, tests com relógio/fuso injetados; extend `/v1/history/day`.

- [ ] **Step 1: Testar dia em `America/Sao_Paulo`, intervalo que cruza meia-noite, duas sessões simultâneas, espera sobreposta, lacuna sem coleta, contador de tokens inicial e reset.**
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Calcular `elapsedDuration` por união de intervalos e `agentHours` por soma dos intervalos de agente, com rótulos diferentes.** Expor `coverage`, projetos, marcos, incidentes, espera e custos somente quando fonte/regra existir. Tokens iniciais acumulados não contam como produção do dia.
- [ ] **Step 4: Conferir resultado determinístico após reinício e evento tardio; agregar novamente só o intervalo afetado.** Testar HTTP paginado e commit seletivo.

## Task 5: Implementar replay isolado

**Files:** Create `replay.ts`, endpoints `/v1/history/replay`, tests; Unity history presenters.

- [ ] **Step 1: Testar snapshot temporal, sequência tardia, cursor expirado, evento corrigido e tentativa de `POST /v1/commands` com contexto `replay`.** Esperado: replay consistente, comando rejeitado no servidor.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Expor snapshot inicial e deltas até tempo/cursor solicitados com `viewMode=replay` no contrato de leitura.** Preservar `ingestionMode` original de cada evento (`live`, `backfill`, `resync` ou `demo`). Não publicar no canal `live` nem alterar presença atual. UI mostra selo persistente `REPRODUÇÃO` e controles de tempo; eventos sem evidência suficiente aparecem como lacuna.
- [ ] **Step 4: Rodar testes de isolamento e commit seletivo.**

## Task 6: Entregar HUD, efeitos e aceite

**Files:** Create Unity `DaySummaryPresenter`, `ReplayPresenter`, `EffectDirector`; `docs/validation/m3/resultado.md`.

- [ ] **Step 1: Testar cena com merge, CI falho, CI recuperado e ausência de dados.** Efeitos não bloqueiam leitura, podem ser reduzidos/desligados e têm texto equivalente.
- [ ] **Step 2: Rodar testes Unity; esperar falha.**
- [ ] **Step 3: Exibir resumo diário e timeline em português; EffectDirector consome somente efeitos persistidos e prioriza alertas sobre festa.** Reentrada no quartel não repete festa já apresentada; replay reencena visualmente apenas no contexto de replay.
- [ ] **Step 4: Validar build Windows e registrar capturas/replay, testes, fonte GitHub e limites em `resultado.md`.** Não usar conta/repositório pessoal sem configuração explícita; commit seletivo.

## Saída de M3

Um PR mergeado fora de sessão é reconhecido, o mesmo marco vindo de duas fontes é único, falha de CI mantém contexto até recuperação correta, e Meu dia/replay reproduzem o histórico com lacunas declaradas. M4 acrescenta comandos somente após comprovar capacidades reais por provedor.
