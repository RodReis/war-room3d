# War-Room3D M2 — Infraestrutura Essencial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relacionar projetos a recursos compartilhados de host, Docker, API e um banco de laboratório, exibindo saúde e ausência de dados corretamente no data center.

**Architecture:** Inventário explícito de ambientes e recursos alimenta um grafo de dependências. Coletores somente de leitura emitem fatos com frescor e cobertura; o reducer gera saúde e impacto. O data center Unity apresenta o mesmo estado, com detalhe legível no HUD.

**Tech Stack:** Serviço M1, SQLite, HTTP/SSE, Unity 6.3; sondas HTTP e conectores escolhidos para o laboratório. Acesso ao Docker Engine é privilegiado, mesmo quando o produto só faz leitura; avaliar proxy de escopo mínimo antes de habilitar. Referência: [segurança do daemon Docker](https://docs.docker.com/engine/security/).

---

## Escopo e pré-requisitos

PRD RF-14–RF-23, RF-34–RF-35; GDD seções 3.3, 13, 15 e 20. Antes do ensaio, registrar em `docs/validation/m2/laboratorio.md` um host, uma API, um banco e contêineres de desenvolvimento que o usuário tenha autorizado observar; não inserir nomes, endereços ou credenciais reais no Git. M2 não detecta ataques nem executa ações administrativas. O data center continua ativo quando todas as sessões de agentes terminam.

| Arquivo | Responsabilidade |
|---|---|
| `contracts/schemas/resource.v1.schema.json` | Identidade, ambiente, saúde, frescor e cobertura |
| `service/src/infra/inventory.ts` | Inventário e validação de escopos |
| `service/src/infra/dependency-graph.ts` | Relação muitos-para-muitos projeto↔recurso |
| `service/src/infra/health-reducer.ts` | `saudavel`, `degradado`, `indisponivel`, `sem_dados` |
| `service/src/infra/connectors/{host,docker,http,database}.ts` | Leituras específicas, nenhuma mutação |
| `unity/Assets/WarRoom3D/Runtime/Infrastructure/` | Núcleo, racks e painéis contextuais |
| `service/test/infra/`, `contracts/fixtures/m2/` | Contratos, falhas e dependências compartilhadas |

## Task 1: Definir inventário, identidades e grafo

**Files:** Create `resource.v1.schema.json`, `inventory.ts`, `dependency-graph.ts`, tests.

- [ ] **Step 1: Testar dois projetos ligados à mesma API, API ligada ao mesmo banco e recurso homônimo em ambientes diferentes.** Esperado: IDs distintos por ambiente; selecionar o recurso mostra ambos os projetos.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Criar contrato `Environment`, `Resource`, `ProjectResource` e `Dependency`.** `resourceId` é estável e opaco; `environmentId` obrigatório; vínculo informa origem e confiança. Não derivar topologia apenas do nome do contêiner ou da proximidade na cena.
- [ ] **Step 4: Implementar travessia de impacto por arestas direcionadas, com conjunto `visited` para ciclos.** Testar cadeia API→banco e recurso compartilhado; nenhuma relação é criada por coincidência temporal. Rodar testes e commit seletivo.

## Task 2: Preservar saúde, frescor e cobertura

**Files:** Create `health-reducer.ts`, migration SQL e tests.

- [ ] **Step 1: Testar `healthy` observado, timeout, coletor perdido, dado expirado e recuperação confirmada.** Esperado: `sem_dados` quando não há prova válida; último valor pode ser mostrado com timestamp, sem manter selo verde atual.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar estado separado em três eixos:** `health`, `freshness`, `coverage`. Exemplo de saída de domínio:

```ts
type ResourceReading = {
  resourceId: string;
  health: 'saudavel' | 'degradado' | 'indisponivel' | 'sem_dados';
  observedAt: string | null;
  stale: boolean;
  sourceId: string;
  evidenceRef: string | null;
};
```

- [ ] **Step 4: Persistir leituras e transições com `sourceId`, versão e evidência; reinício não renova `observedAt`.** Rodar testes com relógio injetado e commit seletivo.

## Task 3: Implementar conectores de laboratório com menor privilégio

**Files:** Create `connectors/host.ts`, `http.ts`, `docker.ts`, `database.ts`, tests.

- [ ] **Step 1: Criar fakes para resposta saudável, erro de autenticação, timeout, rate limit e fonte indisponível.** Esperado: falhas produzem cobertura/frescor corretos, sem inventar zero ou saudável.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar host como métricas locais permitidas, HTTP como sonda de URL explicitamente autorizada e banco como consulta de saúde de leitura restrita.** Credenciais ficam no armazenamento do sistema operacional; configuração versionada guarda só referência opaca. Sondas respeitam timeout, intervalo e concorrência limitados.
- [ ] **Step 4: Implementar Docker somente após prova de acesso de escopo mínimo.** Sem proxy seguro, marcar conector indisponível e continuar M2 com fixture Docker; nunca montar socket do daemon no cliente Unity nem abrir endpoint TCP sem proteção. Registrar a decisão em `laboratorio.md`.
- [ ] **Step 5: Rodar testes sintéticos e ensaio autorizado; registrar permissões efetivas, sem segredos.** Commit seletivo.

## Task 4: Relacionar incidente e projetos afetados

**Files:** Create `service/src/infra/impact.ts`, `service/test/infra/impact.test.ts`; extend snapshot/SSE.

- [ ] **Step 1: Testar banco compartilhado degradado com dois projetos, projeto sem vínculo e coletor perdido.** Esperado: impacto nos dois projetos vinculados, nenhum no terceiro; perda de coletor vira cobertura perdida, não incidente inventado do serviço.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Calcular impacto pelo grafo e publicar `resource.changed`/`dependency.changed` com IDs estáveis.** Incidente só é aberto por regra explícita e evidência, não por tela vermelha. Persistir estado operacional independentemente da presença de agentes.
- [ ] **Step 4: Rodar testes após fechar todas as sessões M1.** Recurso e alerta continuam visíveis; commit seletivo.

## Task 5: Construir data center e painel de recurso

**Files:** Create prefabs/presenters em `unity/Assets/WarRoom3D/Runtime/Infrastructure/`; modify quartel/HUD.

- [ ] **Step 1: Testar seleção de recurso compartilhado, filtro por projeto, ausência de dados e retorno à sala.** Cor e som não são a única informação de estado.
- [ ] **Step 2: Rodar testes Unity; esperar falha.**
- [ ] **Step 3: Criar núcleo com racks lógicos por ambiente, mesa de topologia e painéis de rede, banco, servidor, API e Docker.** Painel HUD mostra valor, unidade, fonte, horário, frescor, cobertura, ambiente, evidência e projetos afetados. Sem globo geográfico ou ataque representado em M2.
- [ ] **Step 4: Rodar build Windows em laboratório permitido.** Registrar capturas de estado saudável, sem dados, incidente compartilhado e salas sem agentes em `docs/validation/m2/resultado.md`; medir latência e frame time. Commit seletivo.

## Saída de M2

Aceite: o banco/API compartilhado afeta exatamente os projetos vinculados; perda de coleta nunca parece recuperação; infraestrutura continua observável após a última sessão. Conectores indisponíveis são declarados no resultado, não substituídos silenciosamente por dados ilustrativos.
