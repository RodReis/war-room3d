# #47 — vista geral do quartel no Unity Player

[Issue #47](https://github.com/RodReis/war-room3d/issues/47) · [Plano](../../superpowers/plans/2026-11-09-quartel-vivo-player.md). Base integrada da #56: `22cecda`. Implementação do Player: `9b2121a77449a2f4bd233c4638d9197a1186c279`.

## Resultado

A abertura da demonstração mostra Plataforma Atlas e Aplicativo Orion na mesma vista. Cada cartão traz estado, agentes trabalhando, último sinal e alerta, com foco de teclado. Ambos abrem sua sala e Voltar preserva a seleção. Câmera e ações ficam recolhidas. Os dois projetos ocupam salas detalhadas em torno do núcleo. A [vista anterior](../sala-referencia/capturas/issue-35-29-final-g2-return.png) tinha uma sala detalhada e exigia usar o painel lateral para ler o projeto selecionado.

A composição usa o prefab detalhado já existente nos dois espaços, com passarela e núcleo central. A captura comprova uma jornada visual de demonstração, com **dados ilustrativos**. Origem real, gráfico e personalização de agentes seguem nos cards próprios.

- [Quartel em 1920×1080](issue-47-quartel.png)
- [Interior em 1920×1080](issue-47-interior.png)
- [Quartel em 1366×768](issue-47-quartel-1366.png)

## Reprodução

Unity `6000.3.27f1`, build de desenvolvimento Windows x64. Método `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsQuartel`. Abrir `unity/Builds/WarRoom3D-Quartel/WarRoom3D.exe -wr3d-quartel-demo` para usar a fixture local, sem conexão ao serviço.

SHA-256 do executável: `93043e47abfce89ae9d048dbf34108e101edb367150e6203e0bcee27cd5a623d`.
SHA-256 de `WarRoom3D.Runtime.dll`: `9538c64fdb85d824aea8b76dfe574461f31bd752c45f913d3eccaf2dc5a37485`.

| Prova | Resultado |
|---|---|
| Unity PlayMode após correção de navegação e origem | 24/24 |
| Player 1920×1080 | Dois cartões e alerta dentro da área visível. Entrada, volta e segunda sala passaram. |
| Player 1440×900 | Mesmo roteiro passou. |
| Player 1366×768 | Mesmo roteiro passou, com alerta inteiro. |

A captura inicial em janela oculta não gerou textura. O ensaio em janela visível produziu a primeira imagem, que mostrou o alerta parcialmente cortado. O build revisado compactou os cartões e a prova passou a conferir também os limites do rótulo de alerta dentro da área rolável. As imagens acima são desse build revisado.

O selo de conexão ao serviço é separado da origem da atividade. Em sessões sem proveniência confirmada, o Player exibe cobertura desconhecida. A demonstração é selecionada explicitamente e mantém o cliente desconectado. O aceite de fidelidade visual cabe ao PI no Player.
