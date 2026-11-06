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
