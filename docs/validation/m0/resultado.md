# Resultado M0 — issue #1

Data: 06/11/2026. [PR #7](https://github.com/RodReis/war-room3d/pull/7), branch `feat/m0-fundacao-visual`, HEAD `d51ce8f8ee5a7165b9e607f924ce3f0901b5791f`, base `c7f4462333b04781f11ecdc230ed2128adc23e21`. Squash merge confirmado em `e962a532d54281d469a794487609db073fe19718` (`mergedAt` 06/11/2026 15:48:47 UTC). Aceite funcional do PI pendente.

## Provas executadas

| Prova | Comando / ambiente | Resultado |
|---|---|---|
| Contrato sintético | `cd contracts; npm ci; npm test` — Node 24.15.0 | `pass`: 4/4; rejeita modo operacional e campos extras; cópia Unity idêntica |
| Unity EditMode | `unity command "test run" --mode editor --project-path unity` — 6000.3.27f1 | `pass`: 3/3 |
| Unity PlayMode | `unity command "test run" --mode playmode --async-tests --project-path unity`; consultar `unity command "test status"` | `pass`: 3/3, incluindo mouse simulado para órbita, zoom e bloqueio sobre o HUD |
| Build Windows x64 | `unity command "build run" --target StandaloneWindows64 --output-path Builds/WarRoom3D-M0/WarRoom3D.exe --confirm --project-path unity`; consultar `unity command "build status"` | `pass`: build após os novos testes em 17,18 s; 104.370.751 bytes; 0 erros; 0 avisos |
| Executável fora do Editor | `unity/Builds/WarRoom3D-M0/WarRoom3D.exe` | `pass`: cena e HUD abriram, materiais visíveis |
| Prova visual | Windows, RTX 5060, 1920×1080 e 1366×768 | `pass` para seis módulos, núcleo, seleção, entrada, retorno, vista oposta, selo persistente e HUD rolável |
| Órbita de 360° e limites de zoom | Teste EditMode da câmera e PlayMode com Input System isolado | `pass` para matemática e entrada simulada; operação física do mouse no executável não observada diretamente |
| GLB v2 e rack sintético | [Ensaio local](arte-v2.md) | Importação `pass`; rack criado via Blender MCP e testado no Unity; desempenho `not_run`; binários não publicados |

Capturas do executável modular: [quartel 1366×768](01-quartel-1366x768.jpg), [interior API Core](02-interior-api-core-1366x768.jpg), [mesma sala no ângulo oposto](03-sala-angulo-oposto-1366x768.jpg), [quartel 1920×1080](04-quartel-1920x1080.jpg) e [estado de atenção](05-atencao-1920x1080.jpg). A seleção de `Infraestrutura` atualizou o resumo sem trocar a geometria do setor. O botão de retorno manteve `API Core` selecionada. O HUD conservou o selo ilustrativo durante as interações.

## Limites

- Não há ingestão de sessões Claude/Codex, comandos, telemetria de infraestrutura, banco, Compose ou CI. O fixture está limitado ao modo `demo`.
- O GLB v2, o rack sintético e as cenas experimentais não fazem parte do build. Licença de redistribuição do GLB v2, custo de geração Tripo e medições de frame time/VRAM permanecem pendentes. O tamanho das malhas e texturas no Editor foi estimado por asset.
- Os testes PlayMode verificam inicialização/selo e eventos de mouse isolados pelo test framework, inclusive bloqueio sobre o HUD. A navegação por botões foi confirmada no player; arrasto direito e roda com mouse físico no executável ainda exigem prova manual específica.
- Não houve teste do build em outra máquina Windows. O executável e o cache Unity são ignorados pelo Git; a reprodução depende da versão do Editor e das dependências fixadas no projeto.

M1 continua responsável por fontes reais, identidade de sessões, proveniência e reconexão. O aceite funcional da M0 cabe ao PI depois da revisão da PR.
