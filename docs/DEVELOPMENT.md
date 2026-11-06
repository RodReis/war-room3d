# Desenvolvimento

## Ordem de execução

| Etapa | Issue | Plano | Estado |
|---|---|---|---|
| M0 — contrato e cena modular | [#1](https://github.com/RodReis/war-room3d/issues/1) | [M0](superpowers/plans/2026-11-06-m0-fundacao-visual.md) | [PR #7](https://github.com/RodReis/war-room3d/pull/7) integrada em `e962a532`; aceite funcional pendente |
| M1 — sessões e salas vivas | [#2](https://github.com/RodReis/war-room3d/issues/2) | [M1](superpowers/plans/2026-11-06-m1-quartel-vivo.md) | [PR #8](https://github.com/RodReis/war-room3d/pull/8) de contrato/store em revisão; integração real pendente |
| M2 — data center essencial | [#3](https://github.com/RodReis/war-room3d/issues/3) | [M2](superpowers/plans/2026-11-06-m2-infraestrutura.md) | [PR #9](https://github.com/RodReis/war-room3d/pull/9) em revisão, empilhada sobre #8; integração real pendente |
| M3 — histórico e GitHub | [#4](https://github.com/RodReis/war-room3d/issues/4) | [M3](superpowers/plans/2026-11-06-m3-historico-github.md) | Planejada; depende da persistência M1 |
| M4 — interação assistida | [#5](https://github.com/RodReis/war-room3d/issues/5) | [M4](superpowers/plans/2026-11-06-m4-interacao.md) | Planejada; depende de sessão e auditoria |
| M5 — operação ampliada | [#6](https://github.com/RodReis/war-room3d/issues/6) | [M5](superpowers/plans/2026-11-06-m5-operacao-ampliada.md) | Planejada; depende do grafo M2 |

As dependências não exigem um único PR por etapa. Cada fatia deve produzir comportamento verificável e não misturar subsistemas independentes. A ordem pode mudar por decisão de produto registrada em [DECISIONS](DECISIONS.md).

## Baseline de ambiente

- Repositório público: `RodReis/war-room3d`, branch `main`.
- Cliente M0: Unity 6000.3.27f1, URP 17.3.0, Windows x64; versões e provas em [baseline M0](validation/m0/baseline.md) e [resultado M0](validation/m0/resultado.md).
- Serviço M1 em revisão na PR #8: Node.js 24, TypeScript e SQLite local para estado sintético, ainda sem adaptadores, HTTP/SSE ou Unity live.
- A fatia M2 adiciona grafo, estado de infraestrutura e sondas de host/HTTP testadas sinteticamente; Docker e banco não foram ativados. O [levantamento do laboratório](validation/m2/laboratorio.md) registra os limites sem publicar alvos reais.
- `docs/arte`, `docs/analise` e `docs/preview` são referências locais ignoradas pelo Git.
- Não há Compose, banco compartilhado, pipeline CI ou instalador configurado. O build Windows M0 é local e usa apenas a fixture sintética.

Se Compose for introduzido, registrar aqui nome, comandos, portas, volumes, política de backup/restauração e usuários autorizados antes de ativar fontes reais. Nunca copiar credenciais para este documento.

## Registro por entrega

Ao concluir uma fatia, adicionar data, issue/PR, SHA de merge, prova executada e limitação em [STATUS-ARQUIVO](STATUS-ARQUIVO.md); atualizar o resumo em [STATUS](STATUS.md). Aceite funcional do PI é registrado separadamente do merge técnico.
