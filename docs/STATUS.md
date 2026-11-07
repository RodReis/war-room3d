# Estado do projeto

Atualizado em 06/11/2026. Fonte de produto: [PRD](../PRD.md) e [GDD](../GDD.md). Este resumo descreve o estado verificado do checkout; a issue remota deve ser consultada antes de afirmar seu estado atual.

| Etapa | Issue | Plano | Entrega técnica | Aceite do PI |
|---|---|---|---|---|
| M0 | [#1](https://github.com/RodReis/war-room3d/issues/1) | [Plano](superpowers/plans/2026-11-06-m0-fundacao-visual.md) | [PR #7](https://github.com/RodReis/war-room3d/pull/7) integrada em `e962a532`; [provas](validation/m0/resultado.md) | Pendente |
| M1 | [#2](https://github.com/RodReis/war-room3d/issues/2) | [Plano](superpowers/plans/2026-11-06-m1-quartel-vivo.md) | [PR #8](https://github.com/RodReis/war-room3d/pull/8) de contrato/store integrada em `fd15d106`; adaptadores M1 ainda pendentes | Pendente; issue #2 fechada pelo PI como planejamento, sem aceite operacional registrado |
| M2 | [#3](https://github.com/RodReis/war-room3d/issues/3) | [Plano](superpowers/plans/2026-11-06-m2-infraestrutura.md) | [PR #9](https://github.com/RodReis/war-room3d/pull/9)–[#15](https://github.com/RodReis/war-room3d/pull/15), [#18](https://github.com/RodReis/war-room3d/pull/18), [#20](https://github.com/RodReis/war-room3d/pull/20) e [#21](https://github.com/RodReis/war-room3d/pull/21) integradas; [Player HTTP real pontual](validation/m2/player-operacional.md) e [carga sintética sustentada](validation/m2/performance-operacional.md) documentados; [ensaio com VSync 1](validation/m2/cadencia-vsync.md) teve p95 de frame 16,725 ms, acima de 16,67 ms. FPS físico não medido. [Provas e limites](validation/m2/resultado.md); SQL real e Docker contínuo na [#16](https://github.com/RodReis/war-room3d/issues/16) | #3 aberta; aceite operacional pendente |
| M3 | [#4](https://github.com/RodReis/war-room3d/issues/4) | [Plano](superpowers/plans/2026-11-06-m3-historico-github.md) | [PR #23](https://github.com/RodReis/war-room3d/pull/23) draft com serviço e painel de histórico parciais; [provas](validation/m3/resultado.md); não integrada | Pendente; issue #4 aberta |
| M4 | [#5](https://github.com/RodReis/war-room3d/issues/5) | [Plano](superpowers/plans/2026-11-06-m4-interacao.md) | Não iniciada | Pendente |
| M5 | [#6](https://github.com/RodReis/war-room3d/issues/6) | [Plano](superpowers/plans/2026-11-06-m5-operacao-ampliada.md) | Não iniciada | Pendente |

## Índice fatia ↔ SPEC

Não há SPEC de implementação numerada aprovada. Os planos acima orientam as futuras fatias; criar índice quando a primeira SPEC nascer, sem inventar número retroativo. Histórico em [STATUS-ARQUIVO](STATUS-ARQUIVO.md).
