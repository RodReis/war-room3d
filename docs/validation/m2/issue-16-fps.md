# Issue #16 — FPS apresentado no Player Windows

Data: 08/11/2026. Ensaio local com projeto e recurso **sintéticos**. O PI iniciou manualmente o Player porque a revisão automática havia bloqueado a tentativa anterior de iniciá-lo por ferramenta. O build de desenvolvimento é o mesmo da [prova VSync anterior](cadencia-vsync.md); não houve alteração no código Unity nesta fatia.

## Método

`node service/scripts/m2-performance-proof.mjs 600` iniciou o Player em janela de 1920×1080, com `WR3D_VALIDATION_VSYNC_COUNT=1`, e aceitou 6.000 leituras sintéticas a 10/s. O capturador do Player amostrou `Time.unscaledDeltaTime` por aproximadamente 605 s. Os pares de traços `accepted-600s.jsonl.gz` e `trace-600s.jsonl.gz` foram reavaliados com `node service/scripts/m2-audit-performance.mjs <diretório>`.

O [PresentMon oficial 2.6.0](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0), executável x64 assinado pela Intel (SHA-256 `B2A706BC6AD475749E3B7E3409263AA1E6906D45BDCF993F6DBC0F660188F1AF`), gravou quadros do processo `WarRoom3D.exe`, inclusive intervalos de exibição e tempo de GPU. A versão 1.9 incluída no FrameViewSDK local encerrava com código 1 e sem CSV. Segundo a [definição das colunas do PresentMon](https://github.com/GameTechDev/PresentMon/blob/main/README-ConsoleApplication.md#csv-columns), `MsBetweenDisplayChange` mede por quanto tempo o quadro anterior ficou exibido; `MsGPUTime` mede o trabalho de GPU no quadro. O p95 abaixo usa a posição `ceil(0,95 × N)` após ordenação, exclui `NA` do cálculo numérico e registra sua contagem.

O Windows informou `DISPLAY1` e `DISPLAY2` em 1920×1080. O log do Player identificou renderização em **NVIDIA GeForce RTX 5060**, Direct3D 12. Na execução final, a janela ficou no `DISPLAY2`; o PI informou que trabalharia no `DISPLAY1`, de modo que a carga concorrente faz parte da condição medida. Não foram consultadas fontes reais nem emitidos comandos a agentes.

## Execução com janela coberta

O PI confirmou que alternou ou cobriu a janela. O Player concluiu 6.000/6.000 sequências, com p95 de propagação de **270 ms**, zero desconexões e p95 interno de **16,710 ms**. A captura externa começou após o Player e cobriu somente **593,024 s** de apresentações. Das 34.798 linhas, apenas 11.704 trouxeram `MsBetweenDisplayChange`; o p95 desses intervalos foi **200,011 ms**, com lacuna máxima de **45,785 s**. O PresentMon avisou sobre 71 eventos de apresentação perdidos. Esta execução **não é válida** para aceitar FPS apresentado.

Os [relatórios e traços](issue16/janela-coberta/) e o [CSV compactado](issue16/janela-coberta/presentmon-vsync-600s.csv.gz) preservam a ocorrência. SHA-256 do CSV compactado: `A59344111BF80246FC96B786263F891C2BA9381FB2A00F837BF2AB612D9B0707`.

## Execução com janela visível no segundo monitor

O PresentMon foi iniciado antes do Player, filtrado por nome de processo, com buffer circular solicitado de 8.192 eventos. O Player registrou `ready` em 13:49:56,275 UTC. Para a comparação de dez minutos, foram usadas as linhas de `TimeInMs` entre **53.106,664 ms** e **653.106,664 ms** após o início do comando externo. Esse alinhamento usa o carimbo do arquivo `ready` e o horário de início do capturador; a borda é aproximada porque o início efetivo da sessão ETW não foi cronometrado separadamente. A janela selecionada contém **35.987** linhas e cobre **599.982,705 ms** entre a primeira e a última apresentação observada.

| Medida | Resultado | Critério/estado |
|---|---:|---|
| Duração de amostragem do Player | 605,014 s | `pass` |
| Resolução / VSync | 1920×1080 / 1 | `pass` |
| Sequências cobertas / desconexões | 6.000/6.000 / 0 | `pass` sintético |
| p95 de propagação de sequência | 270 ms | `pass` sintético, ≤ 2 s |
| p95 de intervalo interno (`Time.unscaledDeltaTime`) | **16,745 ms** | **`fail`**, > 16,67 ms |
| Apresentações externas / intervalos de exibição medidos | 35.987 / 35.843; 144 `NA` | Informativo |
| `SyncInterval=1` / `AllowsTearing=0` | 35.987 / 35.987 | Informativo |
| Mediana / p95 de `MsBetweenDisplayChange` | 16,667 / **24,663 ms** | **`fail`**, p95 > 16,67 ms |
| p95 / máximo de `MsGPUTime` | 5,172 / 32,502 ms | Informativo |
| Aviso de perda do PresentMon | 53 eventos | Limite da captura |
| Modo reduzido ≥ 30 FPS | Sem ensaio | `not_run` |

O CSV completo também contém quadros de inicialização antes do `ready`; por isso os números de apresentação acima vêm apenas da janela alinhada. A mediana próxima de 16,67 ms não compensa o p95 de 24,663 ms exigido pelo RNF-02. O aviso de 53 eventos perdidos e os 144 intervalos `NA` são limitações de integridade; não foram convertidos em `pass`. O Player também falhou no próprio p95 interno. **RNF-02 permanece não aceito**, e o modo reduzido ainda requer prova separada.

Os [relatórios e traços](issue16/janela-visivel/) incluem o [CSV compactado](issue16/janela-visivel/presentmon-vsync-600s.csv.gz), o [relatório do Player](issue16/janela-visivel/player-vsync-600s.json) e as [métricas de carga compactadas](issue16/janela-visivel/metrics-600s.json.gz). O auditor dos traços recalculou 6.000 sequências cobertas, p50 **136 ms**, p95 **270 ms**, p99 **283 ms**, máximo **300 ms** e zero acima de 2 s. SHA-256 do CSV compactado: `5C1D2E1F9EDF193FB7BA51A1BEFB83A5AEDE51E3EB161917427EF2703BE896AF`.

Esta é uma medição local em máquina única. Os CSVs brutos e arquivos diagnósticos ficaram não rastreados na worktree; o executável oficial baixado ficou no diretório temporário do usuário. A revisão automática bloqueou a tentativa de removê-los com `blocked by policy`; não houve limpeza por outro canal. Os artefatos compactados publicados contêm apenas métricas do processo sintético `WarRoom3D.exe`. A issue #16 e o aceite funcional da #3 continuam abertos; o resultado não prova operação permanente nem altera os limites dos ensaios SQL e Docker.
