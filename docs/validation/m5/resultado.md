# Resultado M5 — Issue #6

Estado: implementação técnica em revisão na PR #26; a issue #6 foi fechada pelo PI em `proplan:finalizado`. Esta ampliação não possui prova visual do Player nem aceite próprio.

Entrega revisável: [PR #26](https://github.com/RodReis/war-room3d/pull/26). Conferir checks `Contratos` e `Serviço` no HEAD remoto da PR antes da integração.

## Escopo desta fatia

- Contrato versionado de observação com ambiente, recurso, IDs de correlação, cobertura e evidência.
- Catálogo por fonte/ambiente/categoria, retenção explícita, redação antes de persistir e consulta paginada.
- Correlação exata por trace/span/request ID e filtros por projeto, ambiente, recurso e período.
- Regras versionadas, incidentes com trilha de abertura/atualização/reconhecimento/resolução/reabertura e autorização por projeto vinculado.
- Sinal de latência HTTP opt-in derivado de sondas API M2 existentes; esse sinal não adiciona alvo de coleta.
- Leitura Docker opt-in dos logs do serviço `api` do ContaIA, limitada por projeto e diretório Compose exatos, com redação antes da persistência.
- Painel Unity para cobertura, logs, rastros, rede, detecção, relatórios e incidentes, bloqueado durante replay.

## Provas

| Prova | Resultado | Limite |
|---|---|---|
| Contrato M5 | `pass` — 14/14 testes após integração com as PRs #27 e #39 | Sem conteúdo de serviço real |
| Serviço, migração SQLite e HTTP | `pass` — typecheck e 158/158 testes, incluindo migração 17→18 | Testes de contrato local e conectores; integração real descrita abaixo |
| Unity EditMode | `pass` — 15/15 testes após integração | Projeto da worktree; sem prova visual do Player |
| Unity PlayMode | `pass` — 18/18 testes após integração | Inclui demo sem botão operacional, escopo obrigatório, replay e sala de referência; transporte exercitado em loopback |
| Build Windows | `pass` — Editor 6000.3.27f1, exit 0, 174.985.688 bytes após integração | `M2LiveProjectSetup.BuildWindowsM5Operations`, `Logs/m5-merge-build.log`; capturador M5 exige conteúdo sintético esperado; Player não ensaiado visualmente |
| CI do HEAD anterior `42a78537b6a0d477081f883cadc458a1f119fabf` | `pass` — jobs `Contratos` e `Serviço` | Conferir checks no HEAD desta revisão; CI não inclui build Unity |
| ContaIA API local | `pass` — Docker `running (healthy)`, `GET /health` HTTP 200 | Verificação pontual; não prova disponibilidade contínua |
| Logs Docker da API ContaIA | `pass` — 330 linhas reais em SQLite temporário, 0 duplicatas na segunda rodada, cobertura `covered` no instante | Janela inicial 10 min; 0 request IDs reconhecidos; limite 1 MiB/1.000 linhas por leitura; detalhes em `laboratorio.md` |
| Traces distribuídos e fonte de segurança reais | `not_run` | Backend e detector não presentes no escopo autorizado |
| Aceite visual do PI | `not_run` | Player não capturado: pipe nativo indisponível e lançamento rejeitado por revisão automática; [preparação e limite](aceite-visual.md) |

## Lacunas para concluir M5

A fonte local de logs Docker da API ContaIA foi autorizada e ensaiada. Backend de traces distribuídos e detector não foram definidos; assim, falsos positivos de detector real e cobertura de segurança operacional continuam sem prova. O ensaio Docker é pontual; perda/recuperação contínua ainda não foi medida. A rede limitada a healthcheck HTTP não é coleta de pacotes. O painel tem paginação por cursor e oculta consulta operacional na demo. A [prova visual do Player](aceite-visual.md) foi preparada, mas a captura não foi executada; a issue #6 já está `proplan:finalizado` por decisão do PI, sem estender esse aceite à ampliação da PR #26.
