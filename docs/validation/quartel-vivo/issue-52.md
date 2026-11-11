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
| Serviço com Node `24.22.2` | **pass**, 186/186 após a correção de deduplicação |
| `npm run typecheck` no serviço | **pass** |
| Capturador Codex com `SessionStart` e `UserPromptSubmit` sintéticos | **pass**, dois registros; sentinela no prompt ausente do spool. O segundo registro contém somente `hook_event_name`, `session_id`, `cwdHash` e `capturedAt`. Não prova disparo pelo plugin. |

A configuração candidata do hook Codex ficou em `Logs/issue-52-live/codex-hooks-preview.json` (local, ignorado pelo Git), SHA-256 `2844BFE9FEB0831E16C702C0083E775E719DB44FFF9C9A9184084DA4F6698D15`. A revisão automática recusou a primeira instalação por considerar a autorização de captura persistente insuficientemente específica. O PI então autorizou **esse hash e esse projeto** expressamente; a cópia idêntica foi instalada em `rrb-forjaOS/.codex/hooks.json`, com SHA-256 conferido no destino. Após o PI confirmar a interação nos dois chats novos, os dois spools receberam `SessionStart` e eventos posteriores. O payload não identifica o aplicativo hospedeiro; a atribuição ao VS Code depende da interação controlada relatada pelo PI. Ao encerrar a coleta, o hash no destino foi conferido novamente e o arquivo foi removido; não havia arquivo prévio nesse caminho.

O laboratório `service/scripts/issue52-live-lab.ts` lê só spools já sanitizados. Ele confere o prefixo SHA-256 do spool ArenaHub, ignora os registros anteriores a 81.776 bytes e exige `SessionStart` novo no caminho canônico autorizado antes de aceitar eventos posteriores da sessão. Aplica o mesmo filtro de caminho e abertura de sessão ao spool Codex. O ensaio inicial diagnosticou registros com hash de caminho diferente e atividade de sessões anteriores sem `SessionStart` novo; esses registros não contam para a #52. O teste sintético do laboratório produziu duas salas, duas sessões, dois agentes e duas séries na API; após reiniciar o laboratório com o mesmo banco, a revisão permaneceu `12` e a cópia ArenaHub permaneceu com duas linhas. Uma perda simulada da cópia ArenaHub marcou somente essa fonte como `file_missing` e manteve as duas posições; a outra fonte já estava obsoleta no momento, então esse ensaio não prova a continuidade de uma fonte Codex atual.

## Janela real com dois projetos

Após a confirmação do PI, o laboratório local aceitou 12 `SessionStart` novos do ArenaHub e um do rrb-forjaOS. O snapshot consultado tinha duas salas, 13 sessões, 14 agentes e duas fontes atuais. Os eventos Codex de outros diretórios foram excluídos pelo hash do caminho. Em sete intervalos de cinco minutos com contagem positiva, a soma de `/v1/activity/events` coincidiu com `/v1/activity` em todos os sete; não houve evento atribuído ao outro projeto ou à outra fonte. A cobertura permaneceu `partial` ou `gap` onde a observação não foi contínua; isso não representa atividade zero.

Uma captura inicial do Player Windows conectou ao laboratório, renderizou os cartões ArenaHub e ForjaOS na mesma vista, apresentou 13 sessões e 14 agentes no relatório e encerrou com código 0 após 15 segundos. A imagem local `Logs/issue-52-real-player/two-projects-1080.png`, SHA-256 `1F80FA3370C79FE0788247592D5E1E9A6F8ED033063C486C41A106A9FDC69444`, tem 1920×1080. O gráfico nela ainda mostra “Aguardando série do serviço local”. Uma segunda captura em 1280×720 confirmou conexão; a auditoria do serviço registrou quatro `GET /v1/activity` do Player com HTTP 200. O capturador salvava a imagem antes da janela de medição, portanto aquela imagem não demonstrava falha no gráfico. O ensaio passou a esperar até dez segundos pela série em modo live, com falha explícita se ela não chegar; o build da jornada live abaixo executou essa verificação. Os logs e spools são locais e ignorados pelo Git.

O build da jornada live do mesmo worktree, Unity `6000.3.27f1`, concluiu com `Build Finished, Result: Success` e saída 0 em `Logs/issue-52-real-build-final.log`. O manifesto local `Logs/issue-52-final-build-manifest.json` registra 302 arquivos, 175.755.616 bytes e SHA-256 da árvore `42AF974DB1FE72D120918FCD27DB4D42CE458476895F5D94AED6A23C7C63AD3D`. O EXE tem SHA-256 `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D`; a DLL Runtime, que contém o capturador ajustado, tem `09D787C5E7E1A29C1D6B8793646B62F937B5C165DBE579DA0D08BDD36440895E`.

Nesse build, o capturador aguardou a série live e o fim do quadro. A imagem `Logs/issue-52-real-player/activity-final-1080.png`, SHA-256 `519EFED1CD5BAD2BA343466681F40EA6042CCD07989204F12BE0CB1A866E697E`, mostra as duas salas, os cartões ArenaHub e ForjaOS, três avatares visíveis na sala ArenaHub e duas linhas de atividade, uma por projeto. O relatório registrou 13 sessões, 14 agentes, conexão contínua e saída 0 após 15 segundos. A sala ForjaOS estava sem avatar trabalhando nessa janela; o cartão mostrava sessão em atividade, de modo que a imagem não demonstra uma ação de agente ForjaOS.

| Resolução | Imagem local do build live | Inspeção visual |
|---|---|---|
| 1920×1080 | `activity-final-1080.png` | Cartões, duas salas e série legíveis, sem corte aparente. |
| 1440×900 | `activity-final-900.png` | Cartões e 12 intervalos por linha visíveis; SHA-256 `0478D3BC8E1E563CF7302AC03412D3FABBF0FBF14FC3A5E7DB6759585E5EEC06`. |
| 1366×768 | `activity-final-768.png` | Cartões e 12 intervalos por linha visíveis; SHA-256 `A3CE7AC4E321F40E8B5DC04679A7DC57D0731F2EC95926FEBE2FB023FC44FE49`. |

As três inspeções são imagens do Player, sem verificação de escala física do monitor. As contagens do gráfico têm `*` para cobertura parcial e `—` para lacuna; não equivalem a uma medição completa da atividade.

O laboratório foi interrompido e reiniciado com o mesmo SQLite e os mesmos cursores. Após o reinício, o snapshot tinha duas salas, 13 chaves de sessão distintas e 14 chaves de agente distintas; o Player do build da jornada live conectou ao novo endereço local, mostrou as duas séries e saiu com código 0 (`after-restart-768.png`, SHA-256 `7266BA676C31ED27804A352CFBF528787DCDAEAA6233C568A0905D72B30CF06C`).

Na perda controlada, **somente a cópia sanitizada Codex do laboratório** foi movida temporariamente dentro de `Logs/issue-52-real-lab`; o spool nativo autorizado não foi movido. A fonte Codex passou a `indisponivel`, a Claude permaneceu `atual`, e o snapshot reteve duas salas, 13 sessões e 14 agentes. O Player mostrou “Dados desatualizados” e “Verificar fonte” no cartão ForjaOS (`codex-missing-768.png`, SHA-256 `B713A473F566873821EC4C39829559BBD40612D7D62902D8DCD7172802BCF4B8`). A cópia foi restaurada; a API voltou a marcar ambas as fontes `atual`, sem sessões ou agentes duplicados. O cartão continuou desatualizado até novo sinal da sessão.

O primeiro sinal novo expôs uma falha de deduplicação: o plugin reutilizou `turn_id` em dois `UserPromptSubmit`, e o adaptador tratava esse valor como identidade do evento. A linha de ferramentas ForjaOS avançava, mas a presença da sessão não. A correção identifica eventos do hook pelo identificador nativo específico quando disponível ou por `turn_id` junto de `capturedAt`; a releitura do mesmo registro mantém a identidade. Para o hook Codex, `UserPromptSubmit` e `Stop` agora projetam também a presença do agente principal. O teste integrado cobre prompts repetidos no mesmo turno antes e depois da perda da fonte; o serviço passou 186/186 testes e typecheck.

Após a correção, o PI fez outra interação no mesmo chat Codex. O sinal nativo das 19:31 UTC renovou a sessão ForjaOS para `trabalhando`, com fonte `atual`; o Player do build da jornada live mostrou “Sessão em atividade” no cartão e atualizou só a linha ForjaOS (`codex-fixed-recovered-768.png`, SHA-256 `97258D0055727AA7491414C088788BC52A07C14AF96AD8AE3FC34A0FB8498136`). Em uma releitura separada dos **mesmos metadados nativos**, já com o adaptador corrigido, o snapshot teve um agente ForjaOS `trabalhando`; a captura da sala ForjaOS mostrou esse avatar e o recibo contou um avatar visível (`forja-room-replay-768.png`, SHA-256 `FF13F64899E2CED99E406F95A4BA42F54A8A022132810E7BEFF2FCC64F6083C4`). Essa última imagem é replay, não movimento observado durante a ação ao vivo. Este ensaio cobre a perda da cópia do laboratório, não uma falha do plugin nem do VS Code.

### Revisão visual do build mais recente

O conceito local ignorado pelo Git em `docs/preview/content/01-quartel.png` mostra seis salas ilustrativas, cartões sobre a cena, núcleo central e paleta azul/ciano. `02-interior.png` mostra quatro agentes ilustrativos, mesa central e painel à direita. O Player mantém a estrutura de salas, núcleo, mesa, paleta e painel lateral; apresenta as salas e os agentes observados pelas duas fontes. A arte do Player tem menos detalhe e a composição dos cartões e do gráfico difere do conceito. Essa comparação é de estrutura e legibilidade, sem equivalência pixel a pixel nem aceite visual do PI.

A inspeção da sala em 1366×768 revelou texto truncado no botão do agente e rolagem horizontal desnecessária. A lista agora quebra a linha e tanto ela quanto o conteúdo da sala usam rolagem vertical. O build visual mais recente, Unity `6000.3.27f1`, concluiu com saída 0 em `Logs/issue-52-final2-visual-build.log`; o manifesto `Logs/issue-52-final2-visual-build-manifest.json` registra 302 arquivos, 175.755.856 bytes e SHA-256 da árvore `FC786543316AA9C5C1EEFFCDEE6F5F35CA654BFE91B8BD95D3B34AC924469BC0`. No mesmo build, as capturas de overview em 1920×1080 (`final-build-overview-1080.png`, SHA-256 `8463B244461A43D68BA65C267126CBB327EEB172AE88ED60C1E809CA07BE2BCD`), 1440×900 (`final-build-overview-900.png`, SHA-256 `521324D27452D6679B2690C8EAF53393E88C4D82F79155B6BF0FF3FF30AD1088`) e 1366×768 (`final-build-overview-768.png`, SHA-256 `C9F393823D18712453ABB641AEA11C3934CD78D1A2DC9D6CE09CB7C50E59E385`) conectaram e renderizaram os dois projetos sem corte aparente. A sala ForjaOS em 1366×768 (`forja-room-no-scroll-768.png`, SHA-256 `1A404741BA5A150D246B8F54202EEA5264623E5B01056D014B918417A939E57E`) mostrou o agente, texto completo no botão e nenhum scroller horizontal. Essas capturas finais são replay dos metadados nativos já coletados; o hook havia sido removido, portanto a ação live ocorreu no build anterior.

### Builds anteriores e pré voo

O build Windows anterior da #51 veio da mesma árvore de código que o merge `b54f834` (diff vazio). O manifesto local dele está em `Logs/issue-52-live/build-manifest.json`. Após a correção visual abaixo, o Unity `6000.3.27f1` compilou **outro build** no worktree da #52: `Logs/issue-52-live/build-worktree.log` registra 175.754.930 bytes, conclusão e saída 0. O manifesto `Logs/issue-52-live/build-fixed-manifest.json` contém 302 arquivos, SHA-256 da árvore `684a852e845fd354f4b9bfd9f737d6afad356edaf9b62f5a1df755473a64e7a0`, EXE `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D` e DLL Runtime `1BCECBC271072F1BA489FAEDDF54DA94AD1AB802687BB63A8057F0683FCE607C`. O hash do EXE isolado é igual entre os dois builds; a DLL e o manifesto distinguem o código testado. A jornada real foi executada no build da jornada live descrito acima.

O pré voo do build anterior, em 1280×720 e sem sessões, conectou ao serviço, capturou imagem e saiu com código 0. A imagem local `Logs/issue-52-live/player-preflight/preflight-empty.png` expôs sobreposição entre a legenda do gráfico e a mensagem de setor vazio. A #52 oculta o carrossel quando não há cartões. O novo build conectou ao mesmo serviço e saiu com código 0; a imagem `Logs/issue-52-live/player-preflight-fixed/preflight-fixed.png`, SHA-256 `CF4D4AB52C56C8F936CC759BB17FD8BAE1921B209EE35BEE4162BB106B338852`, mostra a mensagem abaixo do painel sem sobreposição. Ambas as capturas vazias são apenas pré voo, não prova de dois projetos.

## Gate do Player

| Critério | Estado atual |
|---|---|
| Build Windows único, hash do executável e versão de fontes | **parcial**: ambos os builds têm manifesto e origem identificados; ação live no primeiro, revisão visual final em replay no segundo. |
| ArenaHub e rrb-forjaOS simultâneos no Player, ação real isolada por cartão, avatar e gráfico | **parcial**: duas salas e séries reais; ação Codex refletida no cartão e na linha ForjaOS sem alterar ArenaHub. Avatar ForjaOS comprovado em replay dos metadados nativos, sem vídeo de movimento ao vivo. |
| Capturas comparadas ao protótipo, vídeo de movimento e matriz de legibilidade | **parcial**: comparação estrutural com conceito local e inspeção em três resoluções; vídeo de movimento e escala física `not_run`. |
| Perda, recuperação e reinício sem duplicação no mesmo build | **parcial**: perda da cópia sanitizada, estado indisponível e recuperação com novo sinal real no Player; reinício sem duplicatas. Perda do plugin real `not_run`. |
| RNF-01/02 no build da prova | `not_run` |
| Revisão e aceite funcional explícito do PI | `not_run` |

As provas sintéticas das [#50](issue-50.md) e [#51](issue-51.md) e a prova anterior de dois projetos Claude Code da [#49](claude-dual-arenahub-forja.md) são antecedentes. Elas não substituem a jornada com as duas fontes escolhidas para esta issue.
