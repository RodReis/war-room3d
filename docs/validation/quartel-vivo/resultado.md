# Issue #48 — salas por projetos observados

Estado: **pass técnico local** para serviço, contratos, Unity e Player com fixture sintética. A integração da PR e a CI da `main` devem ser registradas separadamente após o merge. Aceite funcional do PI não foi executado.

## Escopo comprovado

- O cadastro autoriza um projeto, mas não cria sala operacional. A primeira abertura de workspace ou atividade de sessão cria a posição; projeto homônimo mantém identidade por `projectId`.
- Duas fontes vinculadas ao mesmo projeto compartilham a sala. Encerrar somente uma mantém a sala; encerrar o último vínculo explícito remove a sala do snapshot. Perda de fonte mantém estado incerto até recuperação ou encerramento explícito.
- Posição persistida é reutilizada após reinício. A alocação usa até seis salas dinâmicas por setor; busca global encontra projeto em outro setor. Espaços fixos não entram na contagem.
- Eventos de workspace exigem vínculo autorizado; eventos de sessão de fonte não vinculada são rejeitados após a ativação da configuração de fontes. Projeto, versão e provedor divergentes são colocados em quarentena antes da projeção.

## Provas

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos, Node 24 | **pass**, 17/17 | `npm test` em `contracts/` |
| Serviço, Node 24 | **pass**, 182/182 | `npm test` em `service/` |
| Tipagem | **pass** | `npm run typecheck` em `service/` |
| Unity EditMode, 6000.3.27f1 | **pass**, 15/15 | `Logs/issue-48-editmode-final.xml` |
| Unity PlayMode, 6000.3.27f1 | **pass**, 26/26 | `Logs/issue-48-playmode-sector-r2.xml` |
| Build Windows | **pass**, 175.694.936 bytes | `Logs/issue-48-build-final.log`; SHA-256 do EXE `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D` e de `WarRoom3D.Runtime.dll` `7775180C870B7AD8912D1BD1E16DD8B47AEF8A3B3346B0F323BD9CA7AB43D4AB` |
| Player 1280×720, dois projetos fictícios homônimos `API` | **pass**, duas salas `atlas` e `orion` no setor 01, HTTP conectado, processo exit 0 | [Captura sintética](issue-48-two-rooms.png); recibo local `Logs/issue-48-player-final/issue-48-two-rooms.json` |

O ensaio do Player usa `service/scripts/issue-48-player-proof.mjs`, SQLite em memória, origem `fixture-48` e token efêmero. Não acessa checkout, sessão ou log de projeto real. A captura mostra as duas salas com IDs distintos; o teste PlayMode verifica a busca por um sétimo projeto e a troca para o setor 02. O recibo mede apenas 120 frames de captura, portanto não comprova RNF-02.

A [regressão de isolamento por fonte](seguranca-issue-48.md) registra a rejeição de projeto, versão e provedor divergentes, além da revisão do diff em `AgentPresenter.cs`.

A revisão da PR #58 identificou duas falhas corrigidas no serviço: replay de sala sustentada apenas por workspace e ordenação de perda de fonte com timestamps de precisões diferentes. Ambas tiveram reprodução falhando antes da correção e passaram depois; o conjunto focado de histórico e salas passou 45/45.

## Limites e continuidade

- Conexão contínua de workspaces reais: **not_run**. Exige fonte, escopo e autorização específicos; a implementação dos adaptadores permanece em #49/#54. O caminho de um checkout em desenvolvimento, isoladamente, não é autorização de coleta.
- O ensaio visual é sintético. Não comprova detecção automática de workspace em um provedor real nem aceite humano do PI.
- Posicionamentos gravados por versões anteriores são preservados pela migração; posições legadas inativas não aparecem no snapshot operacional, mas continuam reservando o slot histórico.

Ambiente: Windows desktop, Unity 6000.3.27f1, Node.js 24, branch `codex/issue-48-dynamic-rooms` originada de `da446c327acc72a6b3bbbf9cfec6da8883d39b88`. Os comandos de teste usam o Node 24 porque a instalação local de `better-sqlite3` falhou sob o Node 26 padrão.
