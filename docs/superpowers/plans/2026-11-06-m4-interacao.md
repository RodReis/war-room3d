# War-Room3D M4 — Interação Assistida Implementation Plan

> **Prioridade revisada em 08/11/2026:** a [sala completa de referência (#28)](https://github.com/RodReis/war-room3d/issues/28) concentra o acabamento visual e o fluxo de uso antes da replicação. Consultar [especificação](../../specs/2026-11-08-sala-referencia-design.md) e [plano atual](2026-11-08-sala-referencia-player.md). Este plano permanece referência do subsistema; seu fechamento não comprova a nova experiência no Player.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir mensagens e respostas a pedidos de ferramenta somente quando o provedor e a sessão expõem a capacidade, com prazo, alvo, confirmação e auditoria verificáveis.

**Architecture:** Um CommandGateway no serviço valida modo, ator local, capacidade, alvo, prazo e idempotência. Adaptadores de comando separados por provedor enviam a intenção e relatam confirmação ou resultado incerto. A Unity apenas apresenta ações disponíveis e seus resultados; nunca executa shell arbitrário.

**Tech Stack:** Serviço M1–M3, SQLite transacional, autenticação local, contratos JSON e Unity. Interfaces de Claude/Codex serão fixadas pela matriz de compatibilidade testada no Windows antes de cada adaptador; ausência de API estável deixa a capacidade indisponível.

---

## Escopo e mapa

PRD RF-31–RF-34, RF-36–RF-38; GDD seção 16 e fronteiras de segurança da seção 18. M4 cobre mensagem, resposta a pergunta e decisão de permissão suportadas. PTY/takeover, iniciar/encerrar processos, administrar Docker, executar SQL e implantação permanecem fora. Não confundir observação M1 com autorização para comandar.

| Arquivo | Responsabilidade |
|---|---|
| `contracts/schemas/capability.v1.schema.json` | Ações suportadas por sessão/provedor |
| `contracts/schemas/command.v1.schema.json` | Intenção, prazo, idempotência e resultado |
| `service/src/commands/gateway.ts` | Autorização e máquina de estados |
| `service/src/commands/audit.ts` | Registro antes/depois do envio |
| `service/src/commands/providers/{claude,codex}.ts` | Integrações específicas e verificadas |
| `service/src/http/commands.ts` | Rotas de consulta/envio; sem shell arbitrário |
| `unity/Assets/WarRoom3D/Runtime/Commands/` | Pedidos, decisões e resultado legíveis |
| `service/test/commands/` | Duplicação, timeout, crash e revogação |

## Task 1: Provar capacidade por provedor e versão

**Files:** Create capability schema, `service/src/commands/capability-registry.ts`, tests e `docs/validation/m4/provider-matrix.md`.

- [ ] **Step 1: Testar sessão com `message=true`, `permission=false`, outra com ambas indisponíveis e capacidade revogada durante uma tentativa.** UI não mostra ação que o backend negará por falta de capacidade.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Modelar capacidades por `(provider, version, sessionKey, action)` com fonte da prova e horário.** Sem `version`/prova compatível, o estado é `indisponivel`; nunca inferir paridade Claude/Codex.
- [ ] **Step 4: Executar ensaio de laboratório em Windows para cada ação que será habilitada.** Registrar versão, mecanismo, resposta, timeout e modo de falha. Desabilitar ações sem prova; commit seletivo.

## Task 2: Persistir intenção e máquina de estados antes do envio

**Files:** Create command schema, migration `commands`, `gateway.ts`, tests.

- [ ] **Step 1: Testar clique duplo com mesma chave, prazo expirado, alvo trocado, modo demo/replay e auditoria indisponível.** Esperado: nenhuma emissão duplicada e erro específico.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Definir estados `requested`, `validated`, `sending`, `confirmed`, `rejected`, `expired`, `unknown`.** Exemplo de contrato:

```ts
type CommandIntent = {
  commandId: string;
  idempotencyKey: string;
  sessionKey: string;
  capability: 'send_message' | 'answer_question' | 'decide_permission';
  requestId: string | null;
  deadlineAt: string | null;
  payloadRef: string;
};
```

- [ ] **Step 4: Na transação, validar modo `live`, sessão atual, escopo e prazo; persistir intenção e resultado de validação antes de chamar o adaptador.** `UNIQUE(idempotency_key)` impede duplicação local. Sem gravação, bloquear comando. Rodar testes e commit seletivo.

## Task 3: Tratar entrega e resultado incerto

**Files:** Create `audit.ts`, adaptadores e `service/test/commands/delivery.test.ts`.

- [ ] **Step 1: Testar resposta positiva, negação, timeout antes/depois de enviar, processo encerrado após envio e resultado tardio.** Timeout pós-envio vira `unknown`, sem reenvio automático.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Adaptador recebe alvo resolvido e `CommandIntent` já persistido, nunca comando shell arbitrário.** Associar resposta por `requestId`/`commandId` quando o provedor suporta; registrar evidência redigida e versão do adaptador. Resultado sem correlação não vira sucesso.
- [ ] **Step 4: Recuperar após reinício:** `sending` sem confirmação vira `unknown`; operador pode inspecionar e decidir novo envio com nova intenção e aviso explícito de possível duplicação. Rodar testes e commit seletivo.

## Task 4: Expor API local protegida e interface de decisão

**Files:** Create `service/src/http/commands.ts`, Unity `CommandPresenter`, `PermissionPanel`; tests.

- [ ] **Step 1: Testar chamada sem autenticação, origem inesperada, sessão de outro projeto, prazo expirado e replay.** Esperado: `401/403/409` conforme causa; nenhum pedido chega ao adaptador.
- [ ] **Step 2: Rodar testes; esperar falha.**
- [ ] **Step 3: Implementar `GET /v1/capabilities`, `GET /v1/commands/{id}` e `POST /v1/commands` com corpo validado.** Nunca expor endpoint genérico para executar shell. A UI mostra agente/sessão, ação, alvo, origem, prazo e consequência antes de confirmar; resultado `unknown` é distinto de falha/sucesso.
- [ ] **Step 4: Validar em build Windows com provider habilitado no laboratório, sem credenciais no repo.** Registrar gravação de auditoria, dois cliques, prazo, queda e revogação em `docs/validation/m4/resultado.md`; commit seletivo.

## Saída de M4

Uma mensagem ou permissão só é oferecida quando a capacidade foi provada; confirmação, rejeição e incerteza são rastreáveis. Não alegar suporte uniforme entre Claude e Codex. Se nenhuma interface de comando estável passar no ensaio, M4 documenta a limitação e mantém o produto em modo observador para esse provedor.
