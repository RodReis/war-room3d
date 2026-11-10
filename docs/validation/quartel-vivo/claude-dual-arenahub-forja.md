# #49 — ensaio conjunto Claude local: ArenaHub e rrb-forja

Data: 10/11/2026. Estado: **ArenaHub confirmado até o Player; segundo projeto não confirmado**. O PI selecionou `arenahub` no Claude Code do VS Code e `rrb-forja` no Claude do terminal. São duas superfícies distintas do mesmo protocolo de hooks; o payload nativo não declara qual aplicativo hospedou a sessão. A atribuição de cada superfície depende da interação controlada pelo PI e do processo local observado.

## Preparação

- Hooks opt-in temporários em `.claude/settings.local.json` dos dois projetos autorizados, com backup byte a byte dos arquivos originais. Hashes originais: ArenaHub `2775CB1496D074C037F5572DBF4C90291602C7A621927AEE2933C20017A0FAD2`; forja `8B284272DC60A3E7FAE62D394ECDAF96D64E2195433B74A9FC79BFB4C1836448`. Hash temporário ArenaHub `221EC70A092A0F0D92DA4BF806D7E85F665EDAE887CAAFC67763BBCCF58E6E45`; forja inicialmente `162003AC330C5C99683AEAEF850B1501B034200A20733D36D3D036C8068A2922`, depois `B77A684AE1A01E3E948FE799DF66E03367C74D68B1D89DD7D7DA975B4D0882DE` com execução direta por `node.exe` e `args`.
- A configuração compartilhada `.claude/settings.json` de cada projeto não foi alterada. O `rrb-forja` já tinha hooks compartilhados e alterações alheias no checkout; todos foram preservados. O serviço lê dois spools independentes, com captura de conteúdo desligada e prazo de 600 s para sinal obsoleto.
- O comando exato de captura de cada projeto foi executado sob Git Bash com entrada **sintética separada** e saiu com código 0. O campo de prompt do ensaio não apareceu no spool; esses arquivos sintéticos foram removidos. Isso valida o comando e a sanitização, sem substituir a prova nativa.
- Após uma sessão de terminal sem evento, o hook local do `rrb-forja` foi mudado para `args`, sem shell, para eliminar a interpretação do comando como variável. A definição nova também saiu com código 0 em ensaio sintético separado e não persistiu o campo de prompt. Essa mudança ainda não comprova que o terminal a executa nativamente.

## Resultado real até o momento

| Etapa | ArenaHub, Claude VS Code | rrb-forja, Claude terminal |
|---|---|---|
| Sessão nova, após carregar hook | Um `SessionStart`, um `UserPromptSubmit` e um `Stop` da mesma sessão | O PI informou interações em processos novos e hook ativo; nenhum evento chegou ao spool. A execução nativa do comando não foi comprovada. |
| Store/API | Uma sessão, um agente, uma sala ativa no projeto correto; fonte `atual` | Fonte `indisponivel`, zero sessões e zero sala |
| Player Windows | **pass parcial**: serviço conectado, uma sessão e um agente; cartão “ArenaHub” visível em 1280×720 | `not_run` sem evento nativo |

O Player foi construído neste worktree com Unity `6000.3.27f1`, `BuildWindowsQuartel`, 175.694.938 bytes. O primeiro comando batch com `-nographics` falhou antes de compilar por licença; a segunda tentativa, em contexto com licença Unity Personal, concluiu. SHA-256 do executável: `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D`; `WarRoom3D.Runtime.dll`: `10A6E4A39736DDDF2545FF7C2982FD85CAAD793F6D3DA421EDA3074D8B0D4477`. Os seis arquivos Unity tocados pelo build foram restaurados ao estado limpo; o executável ignorado permanece local.

A captura de um projeto saiu do Player com código 0, `connected=true`, `sessionCount=1`, `agentCount=1`, vista `project`, 1280×720. SHA-256 da imagem local: `02A354D859E24B00B5F9EA41D962A856AD91DE89A0261B4E610D375AF40D936C`. A imagem mostra uma sala ArenaHub e o aviso “origem não verificada”; não foi publicada por conter metadados de um projeto real. Não foram lidos prompts, transcrições, comandos, respostas ou credenciais. O spool do ArenaHub contém apenas campos operacionais sanitizados.

O serviço foi reiniciado com o mesmo banco, configuração e spool reais. Antes e depois, revisão `9`, sequência `9`, uma sessão, sete entradas no feed e uma sala ativa; não houve duplicação no replay.

## Pendências e revogação

Faltam evento nativo do `rrb-forja`, duas salas simultâneas no mesmo Player, perda/reconexão das fontes e aceite funcional do PI. Após o segundo ensaio sem spool no terminal, não foi recebido um estado verificável da última execução em `/hooks`; a causa segue indeterminada. Não se atribui a falha ao Claude nem ao shell sem evidência. A configuração temporária dos dois projetos foi restaurada byte a byte aos hashes originais, o serviço foi parado e spools, banco, token, backups e configuração temporária foram removidos. Permanecem locais apenas o relatório e a imagem do Player de um projeto para revisão; nenhum conteúdo de conversa foi publicado.

### Diagnóstico posterior do terminal

Uma captura de `/hooks` enviada pelo PI mostrou `SessionStart` de fontes User, Project e Plugin, sem o capturador. O arquivo de imagem foi criado às 18:57, **depois** da restauração do `settings.local.json` às 17:40, quando o hash original já não tinha `hooks`; portanto essa imagem comprova o estado revogado, não o estado durante o ensaio sem eventos. O rótulo visual da fonte local não foi assumido como critério: o identificador esperado seria `capture-source.ts` ou `probe-start.mjs`, e `/status` deveria listar `Project local settings`.

Foi feito um terceiro ensaio estritamente local no `rrb-forja`: `SessionStart` com matcher `startup`, capturador por execução direta e segundo handler que gravava somente `SessionStart` e horário, sem ler `stdin`. O arquivo temporário tinha SHA-256 `D77523C1C0FC5C140CE4223361B8DC97B86A5069126EA929897C65257E09E5C6`; o script de marcador tinha SHA-256 `9676788F06D3BB3434DDCEF2D2293DC010769316767AF602BAB81B5CE99DC83B`. Ambos passaram isoladamente com entrada sintética sanitizada. Processos Claude novos foram observados após a instalação, mas **nem marcador nem spool reais apareceram**. Não houve confirmação de `/status` ou `/hooks` enquanto o hook estava instalado, nem leitura do diretório efetivo dos processos; assim não se sabe se o hook foi carregado, confiado ou disparado nesses processos. O arquivo foi restaurado byte a byte ao hash original `8B284272DC60A3E7FAE62D394ECDAF96D64E2195433B74A9FC79BFB4C1836448`, e os arquivos do diagnóstico foram removidos. Nenhuma nova sessão do forja foi contabilizada.
