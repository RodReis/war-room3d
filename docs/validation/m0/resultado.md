# Resultado M0 — issue #1

Data: 06/11/2026. Branch: `feat/m0-fundacao-visual`. Base: `c7f4462333b04781f11ecdc230ed2128adc23e21`. O SHA da PR e o aceite funcional do PI permanecem pendentes até a publicação e revisão.

## Provas executadas

| Prova | Comando / ambiente | Resultado |
|---|---|---|
| Contrato sintético | `cd contracts; npm ci; npm test` — Node 24.15.0 | `pass`: 4/4; rejeita modo operacional e campos extras; cópia Unity idêntica |
| Unity EditMode | `unity command "test run" --mode editor --project-path unity` — 6000.3.27f1 | `pass`: 3/3 |
| Unity PlayMode | `unity command "test run" --mode playmode --async-tests --project-path unity`; consultar `unity command "test status"` | `pass`: 1/1 |
| Build Windows x64 | `unity command "build run" --target StandaloneWindows64 --output-path Builds/WarRoom3D-M0/WarRoom3D.exe --confirm --project-path unity`; consultar `unity command "build status"` | `pass`: build final incremental em 5,47 s; 104.370.751 bytes; 0 erros; 0 avisos. Build anterior com recompilação: 19,52 s |
| Executável fora do Editor | `unity/Builds/WarRoom3D-M0/WarRoom3D.exe` | `pass`: cena e HUD abriram, materiais visíveis |
| Prova visual | Windows, RTX 5060, 1920×1080 e 1366×768 | `pass` para seis módulos, núcleo, seleção, entrada, retorno, vista oposta, selo persistente e HUD rolável |
| Órbita de 360° e limites de zoom | Teste EditMode da câmera | `pass` matemático; arrasto direito e roda não foram automatizados no player |
| GLB v2 | [Ensaio local](arte-v2.md) | Importação `pass`; desempenho `not_run`; ativo não publicado |

Capturas do executável modular: [quartel 1366×768](01-quartel-1366x768.jpg), [interior API Core](02-interior-api-core-1366x768.jpg), [mesma sala no ângulo oposto](03-sala-angulo-oposto-1366x768.jpg), [quartel 1920×1080](04-quartel-1920x1080.jpg) e [estado de atenção](05-atencao-1920x1080.jpg). A seleção de `Infraestrutura` atualizou o resumo sem trocar a geometria do setor. O botão de retorno manteve `API Core` selecionada. O HUD conservou o selo ilustrativo durante as interações.

## Limites

- Não há ingestão de sessões Claude/Codex, comandos, telemetria de infraestrutura, banco, Compose ou CI. O fixture está limitado ao modo `demo`.
- O GLB v2 e a cena experimental não fazem parte do build. Licença de redistribuição, custo de geração Tripo e medições de frame time/memória permanecem pendentes.
- O teste automatizado PlayMode verifica inicialização da cena e selo; a navegação foi confirmada manualmente no player. Arrasto direito e roda do mouse no player ainda exigem prova manual específica.
- Não houve teste do build em outra máquina Windows. O executável e o cache Unity são ignorados pelo Git; a reprodução depende da versão do Editor e das dependências fixadas no projeto.

M1 continua responsável por fontes reais, identidade de sessões, proveniência e reconexão. O aceite funcional da M0 cabe ao PI depois da revisão da PR.
