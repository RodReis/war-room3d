# M2 — Player Windows ligado a fontes locais

Data: 06/11/2026. Branch `feat/m2-player-proof` sobre `3933382`. Unity 6000.3.27f1, Windows x64, build de desenvolvimento com 172.240.533 bytes. Resolução de captura: 1280×720. O ensaio foi pontual e somente de leitura no laboratório local do ContaIA autorizado pelo PI.

## Caminho exercitado

`GET /health` da API local, `GET /v1/sys/health` do Vault local e tentativa de `GET /health` do Cofre local → sonda HTTP M2 → `EventStore(':memory:')` → servidor M2 autenticado em loopback → `GET /v1/snapshot` e `GET /v1/events` (SSE) → Player Windows → HUD. Cada cenário executou uma coleta e abriu uma conexão de snapshot e uma de SSE. O processo e o armazenamento temporário foram encerrados ao final. Não houve leitura de credenciais, SQL, comandos Docker nem alteração do ContaIA.

O grafo de três projetos, seus nomes e vínculos são **sintéticos**. O estado HTTP 200 da API e 503 do Vault vieram das fontes locais reais; a fonte sem dados foi a porta local do Cofre, sem resposta. As capturas usam apenas nomes genéricos, estado e horário da observação. Não contêm URL, token ou conteúdo de negócio.

| Cenário | Fonte e estado no Player | Prova visual | Relatório | p95 dos 120 frames | Primeira requisição de snapshot até HUD |
|---|---|---|---|---:|---:|
| Saudável, data center | API 200; `saudavel`, cobertura/frescor `atual`; 0 sessões | [PNG](player/healthy-center-versioned.png) | [JSON](player/healthy-center-versioned.json) | 0,874 ms | 433,231 ms |
| Incidente, data center | Vault 503; `degradado`; um incidente afeta só dois projetos vinculados | [PNG](player/incident-center-versioned.png) | [JSON](player/incident-center-versioned.json) | 0,782 ms | 420,901 ms |
| Incidente, projeto sem agentes | Mesmo 503; painel mostra 0 agentes e 1 incidente de infraestrutura | [PNG](player/incident-project-bottom-versioned.png) | [JSON](player/incident-project-bottom-versioned.json) | 0,919 ms | 417,700 ms |
| Fonte sem dados | Cofre local sem resposta; `sem_dados`, cobertura `perdida` | [PNG](player/no-data-center-versioned.png) | [JSON](player/no-data-center-versioned.json) | 0,776 ms | 431,411 ms |

O Player registrou `connected: true`, 1 recurso, 0 sessões e 120 frames em cada cenário. As imagens foram inspecionadas: o nome do recurso e as linhas de detalhe quebram dentro do painel; o painel do projeto mostra o incidente mesmo sem agentes. O build e a execução são do Player, não apenas do Editor.

No código desta fatia, `unity test ./unity --mode EditMode` produziu XML `Passed` 9/9 e `unity test ./unity --mode PlayMode` produziu XML `Passed` 7/7, sem falhas nem casos ignorados. O PlayMode cobre a métrica positiva da primeira requisição até a atualização do HUD. O build Windows concluiu; o Unity registrou um aviso de validação da licença que não impediu o build. `node --check service/scripts/m2-player-proof.mjs` passou, e uma execução adicional do roteiro versionado passou após reforçar as verificações de snapshot, SSE, estado, vista e métricas.

## Reprodução

Após construir o Player pelo método `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsM2Live`, definir somente o endereço local do cenário e executar, a partir da raiz do repositório:

```powershell
$env:WR3D_PROOF_HEALTH_URL = 'http://127.0.0.1:<porta-autorizada>/health'
node service/scripts/m2-player-proof.mjs healthy-center
```

Para os cenários `incident-center` e `incident-project-bottom`, usar `WR3D_PROOF_DEGRADED_URL` com o endpoint HTTP local que responde 503. Para `no-data-center`, usar `WR3D_PROOF_UNAVAILABLE_URL` com o endpoint local sem resposta. O script rejeita fonte fora de `127.0.0.1`, URL com credenciais/parâmetros e captura que já exista; um sufixo opcional permite nova execução sem sobrescrever a evidência. O Player só grava PNG/JSON quando `WR3D_VALIDATION_CAPTURE_DIR` está definido em build de desenvolvimento.

## Limites

Os tempos de frame foram coletados por `Time.unscaledDeltaTime` durante 120 frames, após a captura, em uma única máquina, sem carga contínua. Não medem tempo de GPU nem representam o p95 de 10 minutos a 1080p exigido por RNF-02. A latência registrada é uma amostra da primeira requisição HTTP até a atualização síncrona do HUD; não mede p95 sob 10 eventos/s nem o instante de aceitação do evento no serviço exigidos por RNF-01. O SSE abriu, mas nenhum evento novo foi emitido após a conexão. A prova não atesta coleta SQL real, proxy Docker contínuo, dependências reais entre projetos ou aceite funcional do PI. Não há workflow de CI para este ensaio.
