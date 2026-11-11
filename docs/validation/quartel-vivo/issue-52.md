# #52 — validação integrada no Player Windows

Estado em 11/11/2026: **em execução, sem aceite funcional**. Esta página registra resultados observados; os critérios do gate que ainda não foram executados permanecem `not_run`.

## Escopo da fonte real

Projetos indicados pelo PI: ArenaHub no plugin Claude Code do VS Code e rrb-forjaOS no plugin Codex do VS Code. A captura pretendida é local, por projeto e somente de metadados operacionais sanitizados. Nenhum conteúdo de prompt, resposta ou comando integra o escopo. A identidade do aplicativo hospedeiro depende da interação controlada no VS Code; o payload de hook sozinho não a informa.

Em 11/11, o VS Code instalado é `1.146.0`, a extensão Claude Code é `2.1.322` e a extensão Codex é `26.51106.51428`, com runtime `codex-cli 0.167.0-alpha.4.1`. O plugin Codex da prova anterior (`26.51021.22027`) não produziu eventos nativos em três chats, embora o comando isolado tenha funcionado. A versão atual requer nova prova; não se transporta o resultado anterior como sucesso ou falha causal desta versão.

## Preparação e validação independente

Base de código: `b54f834b56e8f40cfd161c121da8ee7eeb933c7e` na `main`. A branch `codex/issue-52-player-gate` foi criada a partir desse commit, isolada de alterações locais do checkout principal. O hook Claude já existente no ArenaHub foi preservado. Seu spool sanitizado tinha 255 registros e 81.776 bytes antes da nova janela; somente eventos posteriores a essa posição poderão contar para a prova #52.

| Prova | Resultado |
|---|---|
| Contratos com Node `24.22.2` | **pass**, 19/19 |
| Serviço com Node `24.22.2` | **pass**, 185/185 |
| `npm run typecheck` no serviço | **pass** |
| Capturador Codex com `SessionStart` e `UserPromptSubmit` sintéticos | **pass**, dois registros; sentinela no prompt ausente do spool. O segundo registro contém somente `hook_event_name`, `session_id`, `cwdHash` e `capturedAt`. Não prova disparo pelo plugin. |

A configuração candidata do hook Codex ficou em `Logs/issue-52-live/codex-hooks-preview.json` (local, ignorado pelo Git), SHA-256 `2844BFE9FEB0831E16C702C0083E775E719DB44FFF9C9A9184084DA4F6698D15`. A revisão automática recusou a primeira instalação por considerar a autorização de captura persistente insuficientemente específica. O PI então autorizou **esse hash e esse projeto** expressamente; a cópia idêntica foi instalada em `rrb-forjaOS/.codex/hooks.json`, com SHA-256 conferido no destino. A confiança na definição pelo plugin e o disparo nativo continuam pendentes. A revogação será a remoção desse único arquivo, após verificar o mesmo hash; não havia arquivo prévio nesse caminho.

O laboratório `service/scripts/issue52-live-lab.ts` lê só spools já sanitizados. Ele confere o prefixo SHA-256 do spool ArenaHub, ignora os registros anteriores a 81.776 bytes e exige `SessionStart` novo no caminho canônico autorizado antes de aceitar eventos posteriores da sessão. O ensaio inicial diagnosticou oito registros com hash de caminho diferente e atividade de sessões anteriores sem `SessionStart` novo; esses registros não contam para a #52. O teste sintético do laboratório produziu duas salas, duas sessões, dois agentes e duas séries na API; após reiniciar o laboratório com o mesmo banco, a revisão permaneceu `12` e a cópia ArenaHub permaneceu com duas linhas. Uma perda simulada da cópia ArenaHub marcou somente essa fonte como `file_missing` e manteve as duas posições; a outra fonte já estava obsoleta no momento, então esse ensaio não prova a continuidade de uma fonte Codex atual. Isso verifica o coletor, sem provar fonte real. O laboratório real iniciado depois continua sem sessões novas aceitas e sem spool nativo Codex no momento deste registro.

O build Windows anterior da #51 veio da mesma árvore de código que o merge `b54f834` (diff vazio). O manifesto local dele está em `Logs/issue-52-live/build-manifest.json`. Após a correção visual abaixo, o Unity `6000.3.27f1` compilou **outro build** no worktree da #52: `Logs/issue-52-live/build-worktree.log` registra 175.754.930 bytes, conclusão e saída 0. O manifesto `Logs/issue-52-live/build-fixed-manifest.json` contém 302 arquivos, SHA-256 da árvore `684a852e845fd354f4b9bfd9f737d6afad356edaf9b62f5a1df755473a64e7a0`, EXE `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D` e DLL Runtime `1BCECBC271072F1BA489FAEDDF54DA94AD1AB802687BB63A8057F0683FCE607C`. O hash do EXE isolado é igual entre os dois builds; a DLL e o manifesto distinguem o código testado. Ainda falta provar a jornada real nesse build novo.

O pré voo do build anterior, em 1280×720 e sem sessões, conectou ao serviço, capturou imagem e saiu com código 0. A imagem local `Logs/issue-52-live/player-preflight/preflight-empty.png` expôs sobreposição entre a legenda do gráfico e a mensagem de setor vazio. A #52 oculta o carrossel quando não há cartões. O novo build conectou ao mesmo serviço e saiu com código 0; a imagem `Logs/issue-52-live/player-preflight-fixed/preflight-fixed.png`, SHA-256 `CF4D4AB52C56C8F936CC759BB17FD8BAE1921B209EE35BEE4162BB106B338852`, mostra a mensagem abaixo do painel sem sobreposição. Ambas as capturas vazias são apenas pré voo, não prova de dois projetos.

## Gate do Player

| Critério | Estado atual |
|---|---|
| Build Windows único, hash do executável e versão de fontes | **pass** para build e manifesto novos; uso integrado na #52 `not_run` |
| ArenaHub e rrb-forjaOS simultâneos no Player, ação real isolada por cartão, avatar e gráfico | `not_run` |
| Capturas comparadas ao protótipo, vídeo de movimento e matriz de legibilidade | `not_run` |
| Perda, recuperação e reinício sem duplicação no mesmo build | `not_run` |
| RNF-01/02 no build da prova | `not_run` |
| Revisão e aceite funcional explícito do PI | `not_run` |

As provas sintéticas das [#50](issue-50.md) e [#51](issue-51.md) e a prova anterior de dois projetos Claude Code da [#49](claude-dual-arenahub-forja.md) são antecedentes. Elas não substituem a jornada com as duas fontes escolhidas para esta issue.
