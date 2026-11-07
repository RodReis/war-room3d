# M4 — Codex Windows: pré-teste interrompido sem envio

Data: 07/11/2026. Issue [#5](https://github.com/RodReis/war-room3d/issues/5), PR [#24](https://github.com/RodReis/war-room3d/pull/24). Código executado: `3152cccf2f58419665d7c0afd1e1735fcdd6e1dd`. **Resultado do roteiro: `fail` no bootstrap; mensagem: `not_sent`. Não é prova de recebimento pelo Codex.**

## Autorização e execução

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
| Reexecução / retry | Nenhum |

O relatório local foi gravado às **22:17:15 UTC**. SHA-256 de `result.json`: `a5e9b1c670a2c56ccaf75d73807d1d8c62f00849c56ae74c714866f3ae9f1a53`. O arquivo original permanece nos artefatos locais ignorados; não foi reescrito para refletir o diagnóstico posterior. Não houve medição de custo ou inferência.

## Diagnóstico e correção independente

Consultas de metadados com `app-server --print-startup-config`, que validam configuração sem abrir o servidor ou criar thread, identificaram que `--strict-config` rejeita a chave legada **`features.rmcp_client`** no perfil local. Os comandos retornaram JSON de erro e código 1; foram extraídos apenas o identificador do campo e o resultado, sem publicar configuração, stdout/stderr bruto, credenciais ou caminhos pessoais.

O roteiro foi corrigido para usar o tratamento normal do CLI para chaves legadas, mantendo a versão fixa e **todas as verificações explícitas de isolamento por `features list`/`config/read` e da resposta `thread/start`**. Nenhuma configuração global foi editada. Uma nova consulta **somente de metadados**, sem `--strict-config`, retornou código 0, JSON válido e nenhum envelope de erro. Esse resultado valida a leitura da configuração corrigida; não é uma segunda execução do ensaio nem prova de isolamento ou entrega real.

O encerramento do canal durante o bootstrap agora recebe a classificação redigida `bootstrap_unconfirmed`, em vez de cair no erro genérico. Testes reproduziram as duas falhas antes da correção; depois, **12/12 testes do laboratório, 126/126 do serviço e typecheck passaram**. Contratos permanecem na validação anterior **12/12**; não foram alterados. A recusa de MCP ativo, recursos divergentes, auditoria indisponível e sandbox/diretório/instruções divergentes permanece coberta pelos testes.

O roteiro corrigido **não foi executado com `--run`**. A autorização recebida especificava uma execução do roteiro em `3152ccc`; uma nova execução será submetida ao PI. As capacidades reais do produto continuam vazias; perguntas/permissões, vínculo operacional M1 e aceite funcional permanecem pendentes.

## Referências

- [Roteiro e limites do laboratório](codex-laboratorio.md).
- Ajuda do CLI instalado: `app-server --print-startup-config` valida e imprime requisitos sem iniciar o app-server; `--strict-config` recusa campos não reconhecidos pela versão.
