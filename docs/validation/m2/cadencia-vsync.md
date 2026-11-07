# M2 — cadência do Player com VSync no laboratório local

Data: 06/11/2026. Continuação das issues [#3](https://github.com/RodReis/war-room3d/issues/3) e [#16](https://github.com/RodReis/war-room3d/issues/16), sobre a base `7179dd6`. Windows x64, Unity 6000.3.27f1, Node.js 24.15.0; CPU AMD Ryzen 7 9800X3D (8 núcleos/16 threads), 31,1 GiB de RAM, tela 1920×1080 a 60 Hz. O host lista Radeon integrada e GeForce RTX 5060; a GPU usada pelo Player não foi identificada. O ensaio não consultou fontes reais.

## Método e evidências

O build Windows de desenvolvimento concluiu pelo método `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsM2Live`. O capturador foi iniciado com `WR3D_VALIDATION_VSYNC_COUNT=1` e `WR3D_VALIDATION_DURATION_SECONDS=605`; o override é restrito ao capturador, que restaura o valor anterior ao terminar. `Application.runInBackground=true` também foi usado somente durante a validação. O Player abriu em janela de 1920×1080, com `targetFrameRate=-1` e VSync 1. A [captura](vsync/player-600s.png) mostra o data center com um projeto e um recurso **sintéticos** antes da carga.

`node service/scripts/m2-performance-proof.mjs 600` enviou 6.000 leituras sintéticas a 10/s para o servidor local em memória. O capturador registrou `Time.unscaledDeltaTime` por 605 s e a sequência do snapshot após o fim dos frames em que o HUD foi atualizado. O roteiro saiu com código **1** porque a condição de frame p95 falhou. O limite numérico do gate foi expresso como **16,67 ms**, com a precisão decimal já usada em seu nome e relatório; um ensaio curto confirmou que 16,6678 ms fica dentro desse limite. Não houve ajuste do limite após o resultado longo.

| Evidência | Conteúdo |
|---|---|
| [Métricas](vsync/metrics-600s.json) | Resultado do roteiro, condições de validade e estado do gate |
| [Relatório do Player](vsync/player-600s.json) | Frames, conexão, resolução e parâmetros de execução |
| [Leituras aceitas](vsync/accepted-600s.jsonl.gz) | Sequência e horário após cada commit sintético |
| [Atualizações do HUD](vsync/trace-600s.jsonl.gz) | Sequência e horário após o fim do frame |

`node service/scripts/m2-audit-performance.mjs docs/validation/m2/vsync` recalculou dos dois traços compactados a cobertura de 6.000/6.000, p50 **144 ms**, p95 **283 ms**, p99 **585 ms**, máximo **1.025 ms** e zero leituras acima de 2 s. O Player registrou zero desconexões; a maior lacuna entre atualizações de snapshot no HUD foi 1.068 ms. Cada leitura é considerada coberta pelo primeiro snapshot com sequência igual ou superior; estados transitórios podem ser agrupados e não necessariamente aparecem individualmente.

| Critério | Resultado | Estado |
|---|---:|---|
| Duração de amostragem | 605,007 s | `pass` |
| Resolução | 1920×1080 | `pass` |
| Intervalos internos amostrados | 36.292 | `pass` |
| Média de `Time.unscaledDeltaTime` | 16,671 ms | Informativo |
| p95 de `Time.unscaledDeltaTime` ≤ 16,67 ms | **16,725 ms** | **`fail`** |
| Maior intervalo | 133,336 ms | Informativo |
| Intervalos > 33,33 ms / > 100 ms | 2 / 1 | Informativo |
| p95 de propagação de sequência ≤ 2 s | 283 ms | `pass` sintético |
| FPS fisicamente apresentado / tempo de GPU | Sem captura | `not_run` |
| Modo reduzido ≥ 30 FPS | Sem modo e sem captura | `not_run` |

O p95 de frame excedeu o gate em **0,055 ms**. O ensaio, portanto, **não atesta RNF-02**, apesar da média próxima de 16,67 ms e da ausência de perda de conexão. `Time.unscaledDeltaTime` é um intervalo interno do Player; VSync 1 não converte essa amostra em medição de quadros fisicamente apresentados. A captura PNG antecede a janela de carga e não demonstra fluidez durante os dez minutos.

O `PresentMon_x64.exe` assinado, incluído no FrameViewSDK local, foi tentado duas vezes com filtro `WarRoom3D.exe`, inclusive com o Player em execução, sem gerar CSV. A conta desta sessão não integra `Performance Log Users` e tem o grupo Administradores somente como *deny-only*. A [documentação oficial do PresentMon](https://github.com/GameTechDev/PresentMon#user-access-denied) exige privilégio de rastreamento para captura ETW. A falta de CSV impede afirmar a causa exata da saída silenciosa da ferramenta e deixa a apresentação física em `not_run`; não foi alterada a associação a grupos do Windows.

SQL real e Docker contínuo continuam dependentes das referências e da identidade isolada descritas na #16. Esta prova usa apenas o projeto e o recurso sintéticos da carga local.
