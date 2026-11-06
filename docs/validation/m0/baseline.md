# Baseline M0 — issue #1

Verificado em 06/11/2026 no branch `feat/m0-fundacao-visual`, a partir de `c7f4462333b04781f11ecdc230ed2128adc23e21` (`origin/main`).

| Item | Versão / configuração |
|---|---|
| Cliente | Unity 6000.3.27f1, Windows x64 |
| Render | URP 17.3.0 |
| Entrada e UI | Input System 1.20.1; UI Toolkit incluído no Editor |
| Testes Unity | Test Framework 1.6.0 |
| Importador experimental | glTFast 6.20.0 |
| Automação do Editor | Unity CLI 1.0.0-beta.13; Pipeline 0.10.0-exp.1 |
| Contrato | Node 24.15.0; Ajv 8.20.0 com `package-lock.json` |
| Máquina do ensaio | AMD Ryzen 7 9800X3D; NVIDIA GeForce RTX 5060; Direct3D 12 |

O projeto usa `unity/Assets`, `unity/Packages` e `unity/ProjectSettings`; `Library`, `Builds`, `Logs` e `UserSettings` ficam ignorados pelo Git. O GLB v2 local é copiado apenas para `unity/Assets/LocalArt/`, também ignorado. O build da demonstração não depende desse arquivo.

Os servidores de autoria foram testados separadamente: Unity Pipeline abriu `QuartelM0.unity` e leu sua hierarquia; `node tools/mcp-smoke.mjs blender` recebeu `initialize`, `tools/list` e `get_scene_info` do Blender MCP 1.30.0 após reiniciar o Blender 5.2.2 e conectar o addon; `node tools/mcp-smoke.mjs tripo` recebeu `initialize` e `tools/list` do Tripo CLI 0.8.1. O teste Tripo não gerou modelo nem consumiu créditos. As entradas MCP são locais ao ambiente de autoria, fora do repositório.
