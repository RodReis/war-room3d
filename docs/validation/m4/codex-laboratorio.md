# M4 — laboratório Codex reproduzível

Issue [#5](https://github.com/RodReis/war-room3d/issues/5), PR [#24](https://github.com/RodReis/war-room3d/pull/24). Data: 07/11/2026. **Uma mensagem Codex com recibo CLI confirmado**, no código `8587967`, após a continuação autorizada pelo PI. O alvo já foi encerrado; o roteiro continua opt-in e não habilita outras sessões. [Resultado, histórico, hashes e limites](codex-windows.md).

## Roteiro revisável

`node service/scripts/m4-codex-provider-lab.mjs` imprime o plano sem iniciar CLI, ler configuração, autenticação ou sessões. Somente `--run` executa o fluxo abaixo; requer autorização específica do PI conforme [AGENTS.md](../../../AGENTS.md), seções Papéis e autoridade / Dados, ativos e ambiente.

1. Criar diretório de trabalho vazio em `%TEMP%/wr3d-m4-codex-<sufixo>` e relatório em `Logs/m4-codex-real-<uuid>`. Não usar o checkout como diretório da thread. Não remover diretórios anteriores.
2. Conferir `codex-cli 0.166.0`. O executável Windows do pacote npm pode ser especificado por `WR3D_CODEX_CLI_PATH`; a execução não usa shell.
3. Conferir `features list` com os overrides. Bloquear se hooks, apps, plugins, memória, multiagente, shell, browser, imagem ou demais recursos listados no roteiro não estiverem desativados. Direcionar SQLite e logs para o diretório temporário, selecionar armazenamento de threads em memória e desligar exportadores de telemetria. O CLI nativo usa sua própria configuração/autenticação; o roteiro não abre arquivos de credenciais.
4. Abrir um app-server próprio de inspeção via stdio, sem criar thread e sem conectar a daemon existente. Fazer apenas `initialize`, `initialized`, `config/read`; usar somente nomes MCP para gerar uma tabela no valor TOML `mcp_servers={"nome"={enabled=false},...}`. Os IDs literais preservam pontos/aspas; caminhos CLI com nomes citados não são interpretados como TOML. Não gravar configuração bruta. Encerrar esse processo e confirmar seu término antes de continuar. Não usar `mcp list`: sua implementação pode consultar autenticação dos conectores por HTTP.
5. Abrir um segundo app-server próprio via stdio com os overrides por servidor. Fazer `initialize`, `initialized`, `config/read`; recusar MCP ativo, recurso divergente, instruções pessoais configuradas, busca web, notificações por comando, persistência de histórico, SQLite fora do laboratório, exportador de telemetria ou provedor diferente do OpenAI nativo. Nenhuma configuração persistente é alterada.
6. Criar uma thread **nova e efêmera**, com sandbox `read-only`, rede da sandbox sem acesso, aprovações `never` e instrução sintética para não usar ferramentas nem ler arquivos. Conferir diretório, política, sandbox, identidade e fontes de instrução antes do envio. Aceitar somente os caminhos exatos `AGENTS.md`/`AGENTS.override.md` do perfil nativo autorizado; a governança global é preservada, sem leitura/cópia manual do conteúdo, alteração ou remoção dos arquivos. Qualquer outra fonte impede envio. Não listar, ler ou retomar threads existentes.
7. Auditar `requested`/`sending` com identidade opaca e hash do texto. Emitir **uma única mensagem** pelo adaptador M4: `Teste sintético War-Room3D M4. Não use ferramentas. Responda somente WR3D_M4_ACK.` Apenas a resposta RPC correlacionada de `turn/start` confirma recebimento. Sem resposta válida, o resultado é `unknown`, sem retry.
8. Encerrar o processo próprio após o recibo ou falha. Aguardar término por até 5 s e registrar falha se não for confirmado. Não aguardar conclusão do modelo. O roteiro grava relatório redigido e auditoria, sem stdout/stderr bruto ou conteúdo de conversas. O CLI pode produzir logs internos no diretório temporário, que não serão publicados nem considerados redigidos automaticamente.

Cada consulta de metadados e o app-server de inspeção têm timeout de 10 s; o segundo app-server tem prazo total de 30 s a partir da abertura, além das esperas de término. São dois processos próprios e somente uma thread nova. **Não há teto monetário verificado equivalente ao `--max-budget-usd` do Claude.** O ensaio usa a cota/autenticação atual do CLI; custo e conclusão de inferência não serão atestados.

## Limites de isolamento

Este roteiro **não promete ferramentas vazias**. Ferramentas internas como `apply_patch` podem permanecer expostas; a contenção proposta é a sandbox de leitura, `never` e desativação dos recursos externos. A recusa efetiva de escrita pelo sandbox Windows ainda não foi ensaiada neste laboratório. A rede da sandbox difere da conexão do próprio CLI ao provedor, necessária para enviar a mensagem.

Na versão instalada, `features.unified_exec=false` continua aparecendo como ativo em `features list`. O roteiro não usa esse override como prova de bloqueio: verifica `shell_tool=false`. No código oficial da tag `rust-v0.166.0`, `add_shell_tools` retorna antes de registrar execução quando `ShellTool` está desligado, enquanto `apply_patch` é registrado separadamente em `add_core_utility_tools`. Essa diferença motivou um teste explícito e o limite acima; não é uma autorização para shell arbitrário.

O mapa MCP é mesclado por configuração; uma tabela vazia não comprova remoção de entradas herdadas. Por isso cada ID recebe `enabled=false` dentro do valor TOML, seguido de nova conferência de todos os servidores em `config/read`. A contraprova nativa verificou IDs com ponto e preservação dos transportes herdados. Qualquer divergência interrompe o fluxo antes da thread/mensagem; divergência na resposta de criação da thread impede a mensagem. Não se removem guardas para forçar sucesso: a política global do perfil é uma fonte de governança explicitamente identificada, distinta de instruções arbitrárias de outro arquivo.

## Validação e escopo das provas

- Quinze testes do laboratório: modo padrão não inicia CLI; inventário restrito a configuração; um envio sintético bem sucedido; correlação com thread nova; MCP herdado ativo/sem flag, feature ausente/ativa e configuração permissiva bloqueados; sandbox/diretório/instruções divergentes bloqueados; perda de conexão fica `unknown` sem segundo turno; auditoria indisponível impede envio; processo próprio encerrado após erro/timeout; `shell_tool` protege mesmo com `unified_exec` ativo; fechamento no bootstrap e etapa solicitada registrados; contadores/prazo sem conteúdo dos pipes; pedido inesperado classificado sem responder ou gravar parâmetros; política global aceita apenas por caminho exato fornecido pelo host.
- Consulta local somente de `features list`, usando os overrides, retornou código 0 e todos os recursos exigidos desativados. Resultado redigido em `Logs/m4-codex-configuration-check/result.json`. Não executou `mcp list`, app-server, autenticação de laboratório ou inferência.
- `m4-validate-codex-schema.mjs`: sete formatos sintéticos válidos nos schemas emitidos pelo CLI 0.166.0, incluindo `initialize`, `config/read` e `thread/start`; caso sem `expectedTurnId` recusado. Resultado local em `Logs/m4-codex-schema-result.json`.
- Serviço **129/129**, contratos **12/12** e typecheck aprovados. [Contraprovas e ensaio real](codex-windows.md): perfil vazio confirmou somente configuração; fixture MCP confirmou IDs/transportes e desativação; ensaio final confirmou uma mensagem, sem retry, processos encerrados. Unity não foi alterado nesta continuação; provas anteriores do Player continuam com o escopo descrito em [protocolos](protocolos.md).

Os testes sintéticos e schemas não substituem o recibo real; cada prova está identificada separadamente. O ensaio pontual não comprova conclusão da inferência, recusa efetiva de escrita da sandbox Windows ou acesso a outras sessões. As capacidades padrão do produto continuam vazias; a prova do alvo descartável encerrado não pode habilitar outras sessões.

## Fontes

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): inicialização, configuração, thread efêmera e recebimento RPC.
- [Configuração](https://learn.chatgpt.com/docs/config-file/config-reference): recursos, MCP e políticas.
- [Código da versão 0.166.0](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/spec_plan.rs): separação entre shell e utilitários internos.
- [MCP CLI 0.166.0](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/cli/src/mcp_cmd.rs): inventário nativo de servidores configurados.
- [Config/read 0.166.0](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server/src/config_manager_service.rs): leitura das camadas de configuração sem consulta a status MCP.
