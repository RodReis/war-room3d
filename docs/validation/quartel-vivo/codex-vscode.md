# #49 — prova inicial do Codex no VS Code

Estado: **ensaio real em andamento**, limitado ao projeto autorizado `rrb-forjaOS`. O PI alterou a primeira fonte para o plugin Codex no VS Code e deixou Claude Code Desktop para etapa posterior. A exigência original de dois projetos no mesmo Player permanece **não comprovada** nesta prova de um projeto; a #49 não pode ser encerrada com este resultado isolado.

## Escopo e privacidade

O hook local opt-in foi criado somente em `rrb-forjaOS/.codex/hooks.json`; não havia arquivo anterior nesse caminho. SHA-256 da definição instalada: `964D13B31F1E116883B7EDF13946537D1AC119791C17BA0C34D107324340AB95`. A definição precisa da revisão de confiança do Codex para esse hash. Não se usa confiança global nem opção de bypass. O hook antigo Claude criado para este ensaio em `rrb-forjaOS` foi retirado sem eventos recebidos; o arquivo local de `rrb-forja` foi restaurado byte a byte ao SHA-256 original `8B284272DC60A3E7FAE62D394ECDAF96D64E2195433B74A9FC79BFB4C1836448`.

O capturador aceita `SessionStart` com `source=startup` e passa a admitir apenas esse ID de sessão. Prompt, transcrição, comando, argumentos e resposta de ferramenta são descartados antes da gravação. O spool, banco, token, caminhos absolutos e IDs de sessão ficam locais e não são publicados. A configuração do serviço não habilita `conversationContent`.

## Versões e mecanismo

| Componente | Versão / prova |
|---|---|
| VS Code Windows | `1.145.2` |
| Extensão Codex | `openai.chatgpt` `26.51021.22027` |
| Runtime empacotado pela extensão | `codex-cli 0.164.0-alpha.11.1`; SHA-256 `4FD2F057BAD603BF53DC202457FFD0C3591DE62E867A8B01E73816E3FBCE5A73` |
| Hooks Codex | Runtime indica `hooks: stable, true`; [documentação oficial](https://learn.chatgpt.com/docs/hooks) descreve `.codex/hooks.json` por projeto, revisão de confiança e payloads com `session_id`, `cwd`, `hook_event_name` e IDs operacionais. |

O `capture-source.ts` agora sanitiza o payload dos hooks Codex; `adapters.ts` transforma os eventos em sessão, atividade e resultado de ferramenta; `file-source.ts` valida o hash do caminho canônico e exige contexto de sessão anterior para os eventos seguintes. O caminho antigo de notificações do app-server continua com suas próprias regras. A identificação da fonte como **plugin do VS Code** requer a correspondência da nova sessão vista nessa interface com os eventos recebidos; o hook sozinho não distingue IDE e CLI.

## Provas até aqui

| Etapa | Resultado |
|---|---|
| Captura sintética de hook Codex novo → spool sanitizado → store | **pass**; sessão anterior descartada, prompt/comando/transcrição ausentes do spool, presença e ferramenta projetadas |
| Suíte focada `session-sources.test.ts`, Node `24.22.2` | **pass**, 18/18 |
| Serviço completo, Node `24.22.2` | **pass**, 184/184 |
| `npm run typecheck` | **pass** |
| Serviço HTTP local antes da interação real | Um projeto cadastrado, fonte `file_missing`, zero sessões; estado correto sem evento |
| Novo chat Codex em `rrb-forjaOS`, confiança no hook e evento nativo | **not_run**, aguarda interação do PI no plugin; a skill de controle do Windows proíbe automatizar a extensão Codex |
| Evento real → store/API → Player, perda/reinício/retomada/deduplicação/revogação | **not_run** |

Nenhum resultado sintético ou presença visual do plugin é apresentado como evento real. Subagente, término, tarefa e skill só serão afirmados se seus sinais surgirem e puderem ser vinculados à sessão autorizada.
