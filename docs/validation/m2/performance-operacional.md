# M2 — carga sintética sustentada no Player Windows

Data: 06/11/2026. Branch `feat/m2-performance-proof` sobre `34386cb`. Windows x64, Node.js 24.15.0, Unity 6000.3.27f1, Player de desenvolvimento em 1920×1080. O ensaio não consultou o ContaIA, SQL, Docker ou produção.

## Método e arquivos

O roteiro `node service/scripts/m2-performance-proof.mjs 600` criou um projeto e um recurso **sintéticos** em `EventStore(':memory:')`, abriu o servidor autenticado em `127.0.0.1` e enviou uma leitura de infraestrutura a cada 100 ms por 600 s. A saúde alternou entre `saudavel` e `degradado`, produzindo 6.000 mudanças aceitas. O Player consumiu snapshot e SSE; o capturador registrou a sequência de cada snapshot após o fim do frame. Para cada leitura, o cálculo busca o primeiro frame cujo snapshot tem sequência igual ou superior à sequência aceita. Mudanças intermediárias podem ser agrupadas pelo snapshot: **cobertura de sequência não significa que cada estado intermediário tenha aparecido individualmente na tela**.

| Artefato | Conteúdo |
|---|---|
| [Captura 1920×1080](performance/player-600s.png) | Data center com projeto/recurso sintéticos; imagem feita antes da carga |
| [Relatório do Player](performance/player-600s.json) | Dimensões, amostras de frame, conexão e configuração de execução |
| [Métricas agregadas](performance/metrics-600s.json) | Percentis, contadores e condições do ensaio |
| [Aceitação no serviço](performance/accepted-600s.jsonl.gz) | JSONL compactado: sequência e horário UTC após cada commit |
| [Atualizações do HUD](performance/trace-600s.jsonl.gz) | JSONL compactado: sequência e horário UTC após o fim do frame |

O p95 foi recalculado independentemente dos dois arquivos JSONL, usando o primeiro registro do HUD com sequência ≥ à leitura aceita: 6.000/6.000 cobertas, p50 **136 ms**, p95 **280 ms**, p99 **757 ms**, máximo **1.234 ms**, zero acima de 2 s. O comando `node service/scripts/m2-audit-performance.mjs docs/validation/m2/performance` reproduz essa conferência a partir dos arquivos compactados. Houve 2.129 atualizações registradas do HUD, 2.130 requisições de snapshot e 2.130 aberturas de SSE. O Player não registrou desconexão; a maior diferença entre o relógio de parede e o relógio monotônico do processo de carga foi 1,051 ms, e o maior atraso de agendamento foi 16,061 ms. A maior lacuna entre registros do HUD foi 1.312 ms.

O capturador amostrou **949.888 frames em 605,000 s**. `Time.unscaledDeltaTime` produziu média de **0,637 ms**, p95 de **0,904 ms** e máximo de **173,153 ms**; oito frames excederam 16,67 ms, um excedeu 33,33 ms e um excedeu 100 ms. O Player estava com `vSyncCount: 0`, `targetFrameRate: -1` e `runInBackground: true` durante a prova. A última opção foi aplicada somente pelo capturador de desenvolvimento, porque o projeto usa `runInBackground: 0` e a [Unity documenta que o Player pausa ao perder foco](https://docs.unity3d.com/cn/current/ScriptReference/Application-runInBackground.html).

## Interpretação e limites

- O valor numérico de RNF-01 (p95 ≤ 2 s sob 10 eventos/s) foi atingido **nesta carga sintética local**, medindo o tempo até um snapshot com sequência igual ou superior estar no HUD. O ensaio não garante que cada estado transitório tenha sido exibido, nem mede atraso da fonte real.
- O p95 de intervalo interno do Player ficou abaixo de 16,67 ms durante mais de dez minutos em 1080p. Como VSync estava desligado e a taxa não era limitada, `Time.unscaledDeltaTime` **não comprova FPS apresentado no monitor ou tempo de GPU**. RNF-02 como experiência visual de 60 FPS ainda requer ensaio de apresentação no equipamento alvo. O único frame de 173 ms permanece registrado, mesmo com p95 baixo.
- O Player foi mantido ativo ao perder foco apenas para tornar a automação reproduzível; a configuração normal do produto não foi alterada. A captura é anterior à carga, enquanto os arquivos de sequência e frame cobrem a janela completa.
- Uma execução anterior de 600 s terminou com p95 de sequência de 248 ms, mas teve uma lacuna de renderização de 7,662 s e 57 leituras acima de 2 s. A tentativa seguinte enviou 6.000 leituras, porém o Player não concluiu o relatório e foi encerrado pelo timeout. Essas duas tentativas **não foram somadas** à medição válida. A perda de foco é a causa provável, coerente com `runInBackground: 0`; não há prova de causa única para cada pausa.
- Não houve CI, medição de GPU, carga de projetos múltiplos nem aceite funcional do PI. SQL real e Docker contínuo seguem dependentes dos acessos descritos na [#16](https://github.com/RodReis/war-room3d/issues/16).

## Verificações da fatia

`npm run typecheck` e 48/48 testes do serviço passaram. Unity EditMode passou 9/9, PlayMode 7/7, e o build Windows concluiu; o log do Editor informou aviso de validação de licença sem impedir o build. Um ensaio curto de 5 s confirmou a gravação dos dois traços e a saída limpa após corrigir o temporizador do roteiro. A repetição longa final terminou com código 0 e todas as condições de validade marcadas como verdadeiras. Após a revisão da PR, o gate foi testado com o resumo válido e com falhas deliberadas separadas nos limites de latência e frame time; só o caso válido foi aceito. O roteiro corrigido também passou em novo ensaio curto.
