# War-Room3D

Quartel-general virtual desktop para acompanhar projetos, agentes de IA e infraestrutura relacionada. A M0 contém uma demonstração Unity com dados sintéticos. Conectores operacionais de Claude, Codex e infraestrutura pertencem às etapas seguintes.

- [PRD — requisitos do produto](PRD.md)
- [GDD — experiência e arquitetura](GDD.md)
- [ChatGPT Canvas, ferramentas MCP e produção de arte](docs/PIPELINE-ARTE-MCP.md)
- [M0 — fundação visual e contrato](docs/superpowers/plans/2026-11-06-m0-fundacao-visual.md)
- [M1 — quartel vivo](docs/superpowers/plans/2026-11-06-m1-quartel-vivo.md)
- [M2 — infraestrutura essencial](docs/superpowers/plans/2026-11-06-m2-infraestrutura.md)
- [M3 — histórico e GitHub](docs/superpowers/plans/2026-11-06-m3-historico-github.md)
- [M4 — interação assistida](docs/superpowers/plans/2026-11-06-m4-interacao.md)
- [M5 — operação ampliada](docs/superpowers/plans/2026-11-06-m5-operacao-ampliada.md)

## Executar a demonstração M0

1. Abrir `unity/` com Unity **6000.3.27f1**. A cena inicial é `Assets/WarRoom3D/Scenes/QuartelM0.unity`.
2. Entrar em Play no Editor ou usar **War-Room3D → Build Windows M0** para gerar `unity/Builds/WarRoom3D-M0/WarRoom3D.exe` (Windows x64).
3. Em `contracts/`, executar `npm ci` e `npm test` com Node 24 para validar schema e fixture.

O HUD exibe **CONCEITO · DADOS ILUSTRATIVOS**. A lista seleciona uma das seis salas; **Entrar na sala**, **Voltar ao quartel**, **Outro ângulo** e **Restaurar câmera** controlam a mesma cena. Mouse direito gira a câmera e a roda controla o zoom.

[Resultados e limites da M0](docs/validation/m0/resultado.md). O GLB v2 foi ensaiado apenas localmente e não integra o build ou o repositório. A observação real de Claude e Codex começa em M1. Os relatórios de pesquisa e os GLBs permanecem no workspace local até revisão de direitos e conteúdo.
