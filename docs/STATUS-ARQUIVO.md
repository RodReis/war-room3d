# Histórico de estado

Este arquivo guarda fatos datados que saem do resumo curto de [STATUS](STATUS.md). Não converter um plano em entrega técnica. Cada registro futuro deve citar issue, PR, SHA remoto, validação executada e aceite do PI, quando houver.

## 06/11/2026 — Fundação documental

- PRD/GDD e planos M0–M5 aprovados como referência de planejamento e publicados no repositório.
- Issues [#1–#6](https://github.com/RodReis/war-room3d/issues) criadas para as seis etapas.
- Nenhum projeto Unity, serviço de coleta, Compose ou workflow CI entregue neste estado.
- Este conjunto de documentos de governança foi criado para orientar as futuras fatias; a publicação e o aceite dessa alteração ainda devem ser verificados separadamente.

## 06/11/2026 — M0 integrada tecnicamente

- Issue [#1](https://github.com/RodReis/war-room3d/issues/1); [PR #7](https://github.com/RodReis/war-room3d/pull/7) integrada por squash em `e962a532d54281d469a794487609db073fe19718` (`mergedAt` 15:48:47 UTC), a partir do HEAD `d51ce8f8ee5a7165b9e607f924ce3f0901b5791f`.
- Validação local: contrato 4/4; Unity EditMode 3/3; PlayMode 3/3; build Windows x64 de 104.370.751 bytes em 17,18 s, sem erros ou avisos; provas visuais e limites em [resultado M0](validation/m0/resultado.md).
- Nenhum check de CI configurado no HEAD da PR e nenhuma regra de proteção na `main` no momento do merge. Isso não equivale a CI aprovado.
- Limites: GLB v2 e rack de ensaio fora do build; direitos de redistribuição do GLB v2, custo de geração Tripo, frame time/VRAM, mouse físico no executável e teste em outra máquina não validados. Não há conectores reais, infraestrutura operacional nem comandos reais na M0.
- Aceite funcional do PI pendente; a issue continua aberta.

## 06/11/2026 — Primeira fatia M1 em revisão

- Issue [#2](https://github.com/RodReis/war-room3d/issues/2); [PR #8](https://github.com/RodReis/war-room3d/pull/8) aberta no HEAD remoto `abb61b4fb56b79160af131ba3054e2569f5018af`, sem merge.
- Validação local sintética: contratos 7/7; serviço 19/19 e typecheck aprovado no Windows x64 com Node.js 24.15.0. Detalhes e limites em [contrato/store M1](validation/m1/contrato-store.md).
- Adaptadores reais, HTTP/SSE, Unity live, build M1 e p95 serviço→HUD não executados. Nenhuma sessão pessoal ou ativo de `docs/arte` foi publicado.
- Aceite funcional do PI pendente; a issue continua aberta.

## 06/11/2026 — Primeira fatia M2 em revisão

- Issue [#3](https://github.com/RodReis/war-room3d/issues/3); [PR #9](https://github.com/RodReis/war-room3d/pull/9) em revisão com correção de cena em `1ecd8c0673ca6e61411f8c13aea7e9d380b0c9dc`, sobre a PR #8, sem merge.
- Contratos 8/8, serviço 28/28 e typecheck, Unity EditMode 6/6, PlayMode 4/4 e build Windows x64 concluídos após correção do carregador serializado. [Resultado e limites](validation/m2/resultado.md).
- Data center Unity usa fixture ilustrativa; a sonda host leu memória local pontualmente no teste, HTTP usou fake e Docker/banco permanecem desativados. O [levantamento](validation/m2/laboratorio.md) documenta a falta de proxy mínimo e papel de monitoração.
- Aceite funcional do PI pendente; a issue continua aberta.
