# M4 — Codex Windows: duas tentativas sem envio

Data: 07/11/2026. Issue [#5](https://github.com/RodReis/war-room3d/issues/5), PR [#24](https://github.com/RodReis/war-room3d/pull/24). Foram executadas duas tentativas, cada uma com autorização própria: `3152ccc` e `a837263`. **Ambas falharam no bootstrap, com mensagem `not_sent`. Nenhuma comprova recebimento pelo Codex.**

## Segunda execução autorizada: `a837263`

O PI respondeu **“Autorizar nova execução corrigida”** ao mesmo escopo: CLI 0.166.0, autenticação atual, dois processos próprios, uma thread descartável e uma mensagem sintética, com os limites e ferramentas residuais já explicitados. O roteiro em `a8372638fe88c3f7d560401773915fd04c596853` foi executado uma vez com `--run`.

Resultado: código 1, `not_sent`, `bootstrap_unconfirmed`, `sendsRealMessage=false`; processo de inspeção encerrado, segundo processo não iniciado. Não houve `thread/start`, `turn/start`, auditoria de comando ou retry. O relatório foi gravado às **22:52:35 UTC**; SHA-256 original de `result.json`: `c2314760fffe9bf5abc1f456954c573d229dc09b6c97f9a6f6de219f170fe02d`.

A etapa precisa do RPC e a causa interna não foram registradas por esse código. A fase de inspeção estava limitada a 10 s; não atribuímos a falha a autenticação, rede ou configuração sem evidência. O SQLite de logs criado exclusivamente pelo laboratório foi consultado em modo de leitura e não continha registros na tabela de logs. O roteiro não leu históricos ou logs de outras sessões, nem abriu arquivos de credenciais.

### Contraprova com perfil vazio, sem credenciais

Uma reprodução separada usou um diretório Codex novo e vazio, armazenamento de credenciais exclusivamente em arquivo, ambiente contendo apenas variáveis do sistema operacional e os caminhos temporários do teste. Não copiou autenticação, não iniciou login e não emitiu `thread/start` ou `turn/start`; exerceu somente `initialize`, `initialized` e `config/read` pelo mesmo canal e helpers do laboratório.

Resultado: **`configuration_read`**, zero servidores MCP, processo encerrado. Sequência observada: `initialize:requested → initialize:received → config/read:requested → config/read:received`. Foram recebidos 10.672 bytes no stdout e 279 no stderr; conteúdo bruto não foi gravado. Relatório local redigido `Logs/m4-codex-offline-bootstrap/result.json`, SHA-256 `a150eed233b6cf117edd41e8a7e51cda1cf7c982eeefb98faf1afaedddb75196`.

Isso comprova a inicialização/leitura de configuração com perfil sintético. As diferenças incluem perfil e ambiente; o teste não identifica qual causa o bloqueio no contexto atual, não prova autenticação e não valida envio de mensagem.

### Instrumentação posterior

O roteiro agora registra apenas nomes das etapas RPC, contadores de bytes, se o prazo local venceu e até oito classificações de pedidos inesperados por fase (`auth_refresh`, `attestation` ou `other`). Não responde a esses pedidos nem preserva IDs, parâmetros ou conteúdo dos pipes. Esses tipos são possibilidades previstas pelo diagnóstico, não pedidos observados na tentativa acima. Testes vermelhos reproduziram a falta dessas evidências; depois da alteração, **14/14 testes do laboratório, 128/128 do serviço e typecheck passaram**. Os limites de 10/30 s, checagens de isolamento, encerramento e ausência de retry permanecem. Essa instrumentação não foi executada novamente com o perfil atual. O bloqueio de bootstrap continua aberto, sem nova tentativa automática ou autorização pendente.

## Primeira execução autorizada: `3152ccc`

O PI respondeu **“Autorizar esse ensaio Codex”** ao roteiro publicado: CLI 0.166.0, autenticação atual, dois app-servers próprios (inspeção de configuração por até 10 s e sessão por até 30 s), uma thread nova descartável e uma mensagem sintética, sem retomar conversas ou repetir envio. Recursos externos desativados, sandbox de leitura e aprovações `never`; ferramentas internas residuais, ausência de teto monetário e cota atual foram explicitados.

`node service/scripts/m4-codex-provider-lab.mjs --run` foi executado **uma vez**. O primeiro processo encerrou antes de retornar a configuração. O roteiro retornou código 1 e registrou:

| Evidência | Resultado |
|---|---|
| Estado | `not_sent` |
| Bootstrap | `bootstrapError=true`, classificação histórica `lab_failed` |
| Processo de inspeção | `inspectionProcessTerminated=true` |
| Segundo app-server | Não iniciado (`processTerminated=null`) |
| Thread / mensagem | Nenhum `thread/start` ou `turn/start` emitido pelo roteiro |
| Auditoria de comando | `audit.jsonl` ausente; não chegou a `requested`/`sending` |
| Retry automático | Nenhum |

O relatório local foi gravado às **22:17:15 UTC**. SHA-256 de `result.json`: `a5e9b1c670a2c56ccaf75d73807d1d8c62f00849c56ae74c714866f3ae9f1a53`. O arquivo original permanece nos artefatos locais ignorados; não foi reescrito para refletir o diagnóstico posterior. Não houve medição de custo ou inferência.

## Diagnóstico e correção independente

Consultas de metadados com `app-server --print-startup-config`, que validam configuração sem abrir o servidor ou criar thread, identificaram que `--strict-config` rejeita a chave legada **`features.rmcp_client`** no perfil local. Os comandos retornaram JSON de erro e código 1; foram extraídos apenas o identificador do campo e o resultado, sem publicar configuração, stdout/stderr bruto, credenciais ou caminhos pessoais.

O roteiro foi corrigido para usar o tratamento normal do CLI para chaves legadas, mantendo a versão fixa e **todas as verificações explícitas de isolamento por `features list`/`config/read` e da resposta `thread/start`**. Nenhuma configuração global foi editada. Uma nova consulta **somente de metadados**, sem `--strict-config`, retornou código 0, JSON válido e nenhum envelope de erro. Esse resultado valida a leitura da configuração corrigida; não é uma segunda execução do ensaio nem prova de isolamento ou entrega real.

O encerramento do canal durante o bootstrap agora recebe a classificação redigida `bootstrap_unconfirmed`, em vez de cair no erro genérico. Testes reproduziram as duas falhas antes da correção; depois, **12/12 testes do laboratório, 126/126 do serviço e typecheck passaram**. Contratos permanecem na validação anterior **12/12**; não foram alterados. A recusa de MCP ativo, recursos divergentes, auditoria indisponível e sandbox/diretório/instruções divergentes permanece coberta pelos testes.

A correção `a837263` foi executada uma vez após uma segunda autorização específica, com o resultado descrito acima. As capacidades reais do produto continuam vazias; perguntas/permissões, vínculo operacional M1 e aceite funcional permanecem pendentes.

## Referências

- [Roteiro e limites do laboratório](codex-laboratorio.md).
- Ajuda do CLI instalado: `app-server --print-startup-config` valida e imprime requisitos sem iniciar o app-server; `--strict-config` recusa campos não reconhecidos pela versão.
