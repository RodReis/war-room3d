# Resultado M5 — Issue #6

Estado: implementação local em revisão; issue permanece aberta. Nenhum merge ou aceite funcional registrado.

## Escopo desta fatia

- Contrato versionado de observação com ambiente, recurso, IDs de correlação, cobertura e evidência.
- Catálogo por fonte/ambiente/categoria, retenção explícita, redação antes de persistir e consulta paginada.
- Correlação exata por trace/span/request ID e filtros por projeto, ambiente, recurso e período.
- Regras versionadas, incidentes com trilha de abertura/atualização/reconhecimento/resolução/reabertura e autorização por projeto vinculado.
- Sinal de latência HTTP opt-in derivado de sondas API M2 existentes; nenhum alvo novo foi consultado.
- Painel Unity para cobertura, logs, rastros, rede, detecção, relatórios e incidentes, bloqueado durante replay.

## Provas

| Prova | Resultado | Limite |
|---|---|---|
| Contrato M5 | `pass` — 13/13 testes | Sem conteúdo de serviço real |
| Serviço, migração SQLite e HTTP | `pass` — typecheck e 137/137 testes | Apenas fixtures e loopback |
| Unity EditMode | `pass` — 15/15 testes | Projeto da worktree; sem build |
| Unity PlayMode | `pass` — 12/12 testes | Transporte exercitado em loopback |
| Build Windows | `not_run` | CLI reportou ausência de instância Pipeline para o projeto desta worktree; Unity aberto em outro projeto |
| Logs, traces e fonte de segurança reais | `not_run` | Backend e permissões por ambiente ainda não escolhidos |
| Aceite visual do PI | `not_run` | Integração técnica não equivale a aceite |

## Lacunas para concluir M5

Nenhum backend de logs/rastros ou detector foi escolhido no plano. Sem essa decisão e autorização de fonte, não há como provar paginação contra backend real, falsos positivos de detector real, perda/recuperação contínua ou cobertura de segurança operacional. A rede limitada a healthcheck HTTP não é coleta de pacotes. Issue #6 não deve ser fechada com esta fatia.
