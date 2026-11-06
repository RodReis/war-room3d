# M3 — resultado parcial

Data: 06/11/2026. Issue #4. Implementação na branch `feat/m3-historico-github`, derivada de `dfbead358bc67d8daacbb03d1bb00f41f5929fac`.

## Evidência executada

| Prova | Estado | Evidência |
|---|---|---|
| TypeScript estrito do serviço | `pass` | `cd service; npm run typecheck` |
| Testes do serviço | `pass` | `cd service; npm test`; 63/63, Node 24.15.0 |
| Contratos compartilhados | `pass` | `cd contracts; npm test`; 8/8 |
| Repositório explicitamente vinculado | `pass` | Teste sintético usa ID opaco do GitHub; nome igual não cria associação |
| Deduplicação de marco importado | `pass` | Chave por repositório/entidade/transição; desvincular preserva marco histórico |
| Repositório compartilhado | `pass` | Dois projetos vinculados ao mesmo ID recebem marcos e efeitos próprios no teste sintético |
| Paginação e proteção de credencial | `pass` | HTTP fake cobre páginas, `ETag`/`304` por página, token recusado, bloqueio de link para outra origem, nova associação de projeto e invalidação de cache após falha parcial |
| Cadastro GitHub sem sonda M2 | `pass` | Configuração local ignorada pelo Git; SQLite em memória retornou um projeto `contaia` e repositório `1371493574` |
| Meu dia | `partial` | União temporal de sessões sobrepostas e fuso IANA; sessão aberta sem encerramento retorna duração indisponível e perda da fonte encerra o intervalo observado. Tempo de agente derivado de eventos; cobertura fica `unknown` enquanto janelas esperadas não forem persistidas |
| Replay HTTP | `partial` | Endpoint autenticado pagina eventos M1 e marcos/efeitos GitHub por cursor, rotula `viewMode=replay`; `POST /v1/commands` retorna `405` |
| Metadados GitHub públicos do ContaIA | `pass` pontual | [Repositório](https://api.github.com/repos/RodReis/rrb-contaia) confirmou ID `1371493574`; [lista de PRs](https://api.github.com/repos/RodReis/rrb-contaia/pulls?state=closed&sort=updated&direction=desc&per_page=1) trouxe `merged_at`, e [runs](https://api.github.com/repos/RodReis/rrb-contaia/actions/runs?status=completed&per_page=1) trouxeram envelope `workflow_runs`. Leitura por conector, sem ingestão pelo produto |
| Polling do produto na API GitHub real | `pass` pontual | Cliente do produto, sem token, consultou o repositório público configurado; SQLite temporário retornou 542 marcos de primeiro carregamento, 6 no dia local, 0 incidentes abertos/resolvidos no dia e 0 erros. Primeiro replay rotulado `backfill`. Sem processo contínuo nem acesso a dados privados |
| Unity EditMode | `pass` | `unity test ./unity --mode EditMode --output Logs/m3-issue4-editmode.xml --timeout 240`; 13/13 no XML local |
| Unity PlayMode | `pass` | `unity test ./unity --mode PlayMode --output Logs/m3-issue4-playmode.xml --timeout 240`; 10/10 no XML local. Inclui HTTP sintético de Meu dia/replay, selo persistente, máscara, retorno ao vivo, banner de merge e prioridade do alarme CI vindo de efeitos persistidos |
| Build Windows x64 | `pass` | `M2LiveProjectSetup.BuildWindowsM3History`; 172.283.277 bytes no log `Logs/m3-issue4-build.log`; executável local em `unity/Builds/WarRoom3D-M3-History/` |
| Execução e captura visual do Player | `not_run` | Revisão automática bloqueou comando de iniciar serviço local em background (`blocked by policy`); sem inspeção visual do executável |

## Limites conhecidos

- O PR adiciona serviço e painel Unity de consulta, não conclui o aceite da issue #4. O painel mostra marcos do dia e navega eventos do histórico completo; a reprodução oculta a cena live, mas ainda não reconstrói a cena 3D no instante histórico nem oferece velocidade/busca temporal.
- GitHub grava marcos de PR e tentativas concluídas de workflow. Deduplicação cruzada com eventos de transcript ainda não existe. Falha abre incidente por repositório/projeto/workflow/ref; sucesso posterior da mesma trilha resolve. Falhas históricas não viram incidentes do dia atual. O dia lista aberturas e resoluções do período, não todos os incidentes ainda abertos.
- Celebração de merge (8s) e alarme CI (5s) ficam persistidos com causa. `EffectDirector` apresenta banner breve no live, com redução de duração, prioridade de alarme e sem disparar backfill/replay; Unity também exibe texto equivalente no replay. Efeitos 3D, retenção persistida, snapshots temporais e lacunas explícitas do replay ainda faltam.
- Meu dia não afirma cobertura completa, custos ou produção de tokens. O store atual não persiste janelas esperadas de coleta.
- Limite da API GitHub usa `Retry-After` em segundos e pausa a rodada seguinte; o agendador mantém o prazo em memória durante o processo. Entrada HTTP de dia com data/fuso inválidos recebe `400`.
- `ETag` de páginas fica em memória durante o processo. Reinício relê a API e deduplica pelo SQLite; cursor remoto persistido por entidade ainda falta.
- Não houve polling com token, captura visual nem aceite funcional do PI. O checkout ContaIA foi apenas inspecionado por metadados Git e permanece com mudanças locais próprias preservadas.

Primeira tentativa EditMode encontrou `ref` reservado em C#; corrigida, a repetição passou. Primeiro PlayMode encontrou máscara visível no início por estilo inline UXML; corrigido por USS/estado explícito, a repetição passou. Um teste PlayMode posterior encontrou `Object` ambíguo após import de `System`; corrigido e repetido com 10/10. Recriação das cenas durante build gerou IDs e reserialização sem mudança de escopo; arquivos gerados foram restaurados antes do stage seletivo.

Fixtures de eventos e testes são sintéticos; metadados públicos pontuais têm fonte identificada. Nenhum segredo foi salvo no repositório.
