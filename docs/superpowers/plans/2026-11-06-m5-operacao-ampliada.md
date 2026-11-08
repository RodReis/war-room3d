# War-Room3D M5 — Operação Ampliada Implementation Plan

> **Prioridade revisada em 08/11/2026:** a [sala completa de referência (#28)](https://github.com/RodReis/war-room3d/issues/28) concentra o acabamento visual e o fluxo de uso antes da replicação. Consultar [especificação](../../specs/2026-11-08-sala-referencia-design.md) e [plano atual](2026-11-08-sala-referencia-player.md). Este plano permanece referência do subsistema; seu fechamento não comprova a nova experiência no Player.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar o data center com logs, rastros, sinais de rede e fontes de segurança autorizadas, mantendo evidência, cobertura e incidentes verificáveis por recurso e ambiente.

**Architecture:** Adaptadores somente de leitura consultam backends de observabilidade e segurança existentes, normalizam sinais redigidos e os ligam ao grafo de M2. Um motor de incidentes versionado avalia regras explícitas; o HUD apresenta amostras paginadas e referências autorizadas. A cena resume prioridades, sem alegar localização geográfica ou origem de ataque sem prova.

**Tech Stack:** Serviço M1–M4, SQLite para metadados/marcos, OpenTelemetry Collector/OTLP quando houver fonte compatível, API de logs/rastros do backend escolhido e Unity 6.3. O Collector recebe/processa/exporta; não é armazenamento de pesquisa. Conectores reais exigem inventário e permissões por ambiente antes de serem habilitados.

---

## Escopo e mapa

PRD RF-14–RF-23, RF-35–RF-38 e RNF-03/RNF-04/RNF-08/RNF-09; GDD seções 3.3, 15, 18 e 20. M5 não promete SIEM universal nem resposta ativa a ataques. Fontes ausentes aparecem como `sem_dados`; detector desligado não é “sem ataques”. Eventos de segurança incluem classe, regra, fonte, escopo, severidade e limite de confiança.

| Arquivo | Responsabilidade |
|---|---|
| `contracts/schemas/observation.v1.schema.json` | Log, rastro, rede e segurança com proveniência |
| `service/src/operations/source-catalog.ts` | Cobertura, escopo e permissão das fontes |
| `service/src/operations/log-query.ts` | Busca paginada e redação |
| `service/src/operations/trace-link.ts` | Correlação por IDs explícitos |
| `service/src/operations/network-signals.ts` | Latência, erro, perda e origem declarada |
| `service/src/operations/incident-engine.ts` | Regras versionadas e ciclo de vida |
| `unity/Assets/WarRoom3D/Runtime/Operations/` | Painéis e foco de incidente |
| `service/test/operations/` | Fixtures com segredos fictícios e falsos positivos |

## Task 1: Inventariar fontes e contrato de cobertura

**Files:** Create observation schema, `source-catalog.ts`, tests e `docs/validation/m5/laboratorio.md`.

- [x] **Step 1: Testar fonte presente, sem permissão, atraso, falha e ambiente não monitorado.** Esperado: cada caso possui cobertura distinta; nenhum produz verde implícito.
- [x] **Step 2: Rodar testes; esperar falha.**
- [x] **Step 3: Contrato exige `sourceId`, `sourceVersion`, `environmentId`, `resourceId?`, `observedAt`, `receivedAt`, `category`, `classification`, `confidence`, `evidenceRef?` e `coverage`.** `classification` distingue `metric`, `log`, `trace`, `network`, `security_detection` e `security_report`. Não aceitar campo de coordenada geográfica sem origem autorizada e precisão declarada.
- [ ] **Step 4: Inventariar backend de laboratório por ambiente, tipo, permissão e retenção sem credenciais no Git.** Rodar testes e commit seletivo.

## Task 2: Consultar logs e rastros com redação e limites

**Files:** Create `log-query.ts`, `trace-link.ts`, tests e rotas `/v1/logs`, `/v1/traces`.

- [ ] **Step 1: Testar consulta paginada, token/cookie/string de conexão fictícios, log ausente, trace sem span pai e evidência expirada.** Esperado: campos sensíveis são redigidos antes de persistir/exibir; falta de span não cria causalidade.
- [x] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Buscar somente fontes e intervalos autorizados, com limite de página e timeout.** Armazenar metadados e referências de evidência, não copiar todo o volume bruto para SQLite. Revalidar autorização ao abrir detalhe. Ainda sem backend configurado para consulta externa.
- [x] **Step 4: Correlacionar apenas `traceId`, `spanId`, `requestId` ou vínculo explícito; proximidade temporal vira sugestão marcada como inferência.** Rodar testes, incluindo acesso cruzado de ambiente negado; commit seletivo.

## Task 3: Normalizar sinais de rede e segurança

**Files:** Create `network-signals.ts`, `service/src/operations/security-signals.ts`, tests.

- [ ] **Step 1: Testar latência/erro com unidade, pacote perdido, detector desligado, alerta de segurança com regra/fonte, falso positivo e sinal sem evidência.** Esperado: gráfico de rede usa valores observados; segurança sem detector ativo mostra `sem cobertura`.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar normalização por adaptador, sem classificar tráfego como ataque apenas por pico.** Distinguir alerta emitido pela fonte de incidente confirmado; nunca desenhar “ataque de país X” sem geolocalização comprovada e incerteza visível.
- [ ] **Step 4: Persistir versão da regra de origem, severidade original e interpretação do produto separadamente.** Rodar testes e commit seletivo.

## Task 4: Implementar ciclo de incidente verificável

**Files:** Create `incident-engine.ts`, migration SQL, tests.

- [ ] **Step 1: Testar abertura, atualização, reconhecimento, resolução, reabertura, regra alterada, evento duplicado e perda de coleta durante incidente.** A perda de coleta não resolve incidente anterior.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Criar transições `open`, `acknowledged`, `resolved` com `ruleId`, `ruleVersion`, recurso, ambiente, evidências, autor/horário do reconhecimento e motivo de resolução.** Exemplo de identidade:

```ts
type IncidentKey = {
  environmentId: string;
  resourceId: string;
  ruleId: string;
  ruleVersion: number;
};
```

- [ ] **Step 4: Projetar impacto via grafo M2 sem inferir causa por coincidência.** Registrar transições em evento persistido e idempotente; rodar testes e commit seletivo.

## Task 5: Entregar painéis, filtros e aceite operacional

**Files:** Create Unity presenters em `Runtime/Operations/`, modify HUD/data center, `docs/validation/m5/resultado.md`.

- [ ] **Step 1: Testar painel de rede, banco/API, logs, rastros, segurança e incidente compartilhado com fonte perdida.** Texto, unidade, horário, ambiente e evidência ficam visíveis; efeitos reduzidos não escondem severidade.
- [ ] **Step 2: Rodar testes Unity; esperar falha.**
- [ ] **Step 3: Adicionar filtros por projeto, ambiente, recurso, intervalo e severidade; clicar no recurso abre detalhe paginado.** Alertas âmbar/vermelho só para situação operacional; estado `sem_dados` visualmente distinto de saudável/inativo.
- [ ] **Step 4: Ensaiar backend de laboratório autorizado, teste de carga e build Windows fora do Editor.** Registrar cobertura, permissões, limites, cenários de ataque simulados e falso positivo, capturas e métricas em `resultado.md`; commit seletivo.

## Saída de M5

Uma detecção tem origem e regra; um incidente mantém histórico e evidência; a perda de fonte é visível; logs/rastros não expõem segredos nem atravessam ambientes. A conclusão de M5 não transforma o produto em SIEM nem autoriza respostas administrativas.
