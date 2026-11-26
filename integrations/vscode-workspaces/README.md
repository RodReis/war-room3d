# Workspaces locais do VS Code — #54

Extensão desktop opt-in, sem dependências de execução. A API observa apenas as pastas locais do workspace; não lê arquivos do projeto, prompts, chats, terminais, contas ou eventos de agentes. Abrir uma pasta significa presença de workspace, sem inferir trabalho.

## Configuração explícita

`authorization.example.json` ilustra o formato; seus caminhos e IDs são fictícios. Uma autorização real identifica **projetos, caminhos/aliases canônicos, versão do VS Code e diretórios privados de spool**. Copiar/adaptar o exemplo só depois de autorizar esse escopo. Arquivos `*.workspaces.local.json` ficam ignorados pelo Git.

Na configuração **do usuário** do perfil autorizado, `warRoom3D.workspace.configPath` aponta ao arquivo absoluto. O padrão vazio mantém a captura desligada. Valores em configurações de pasta ou workspace não autorizam coleta. Workspaces não confiáveis, remotos/virtuais e versões diferentes da autorizada não publicam presença. Não há concessão automática de trust.

O mesmo arquivo é indicado por `WR3D_WORKSPACES_CONFIG_PATH` ao iniciar `service/src/http/main.ts` com os parâmetros já existentes de banco, token e porta. A configuração de sessões permanece separada: `WR3D_SESSIONS_CONFIG_PATH` só configura Claude/Codex. Uma fonte workspace não pode reutilizar o sourceId de uma fonte de sessão nem publicar eventos de agentes, recursos ou cobertura operacional.

## Publicação e limites

Cada janela tem chave opaca derivada de `vscode.env.sessionId` e um identificador de host. Cada projeto tem um arquivo JSON próprio por janela no diretório autorizado. A gravação usa arquivo temporário e rename; o registro contém somente versões, hashes de identidade, estado, sequência e timestamp. O caminho canônico e o nome do projeto ficam na configuração autorizada, fora do spool. Não usar pastas de código ou diretórios compartilhados entre fontes como spool.

Ativação e mudança das pastas reconciliam o conjunto inteiro. Remoção de pasta e desativação normal publicam fechamento apenas da própria janela. Uma desativação atrasada de host antigo não fecha o registro já republicado por host novo. Heartbeat a cada 5 s; validade padrão 15 s, configurável até 300 s. A perda de uma janela deixa só seu vínculo incerto; outro workspace ou sessão ativa mantém a sala. Reinício do coletor preserva deduplicação e posições pelo SQLite.

O coletor aceita até 256 arquivos de janela por fonte, cada um até 4 KiB; autorização até 64 KiB, 128 projetos/fontes e 16 aliases por projeto. Arquivos fechados permanecem no spool, não são apagados automaticamente. Ao atingir o limite, a fonte fica indisponível com `read_error`; a política de retenção/limpeza desse spool é uma limitação explícita desta versão. Ausência de arquivo, formato/escopo inválido e validade vencida não viram fechamento presumido.

O status na barra inferior mostra contagem de publicações e motivo genérico quando desligada ou parcial. Os comandos `warRoom3D.workspace.status` e `warRoom3D.workspace.refresh` consultam estado e reconciliam a captura. Erros não expõem conteúdo nem caminhos no status.

## Desativação e remoção reversível

Esvaziar a configuração de usuário encerra os vínculos da própria janela e para a publicação. Desativar/remover a extensão encerra a captura; se o host cair sem encerrar, o prazo de validade deixa o vínculo incerto. Remover uma fonte da autorização do serviço e reiniciar revoga sua leitura, preservando cadastro/histórico. Nenhuma dessas operações encerra sessões Claude/Codex ou apaga arquivos do projeto. A limpeza manual de spool fica separada dessa revogação.

Esta entrega foi validada por `--extensionDevelopmentPath` em perfis descartáveis. Não houve instalação no perfil habitual, publicação no Marketplace ou geração de instalador permanente. Uso em projetos pessoais exige autorização específica.

## Reprodução do laboratório

Com Node 24, definir `WR3D_VSCODE_EXE` com o caminho absoluto do VS Code instalado e executar:

```powershell
npx --yes node@24 service/scripts/issue54-vscode-lab.mjs D:/laboratorio-novo lifecycle
npx --yes node@24 service/scripts/issue54-vscode-lab.mjs D:/laboratorio-fechamento shutdown
npx --yes node@24 service/scripts/issue54-vscode-lab.mjs D:/laboratorio-sem-trust untrusted
```

Cada destino precisa ser novo. O script cria pastas sintéticas homônimas, autorização, banco e perfil exclusivos. `WR3D_PLAYER_PATH` opcional acrescenta captura do Player no checkpoint inicial, antes de inserir uma sessão **sintética** para testar coexistência de fontes. Token e logs brutos ficam somente no laboratório; não publicar `service.local.json` nem o perfil.

Conforme o roteiro oficial de testes de extensões, os cenários trusted usam `--disable-workspace-trust` **somente no perfil descartável do teste**. Isso cria um ambiente trusted determinístico, não comprova concessão humana de trust. O cenário `untrusted` mantém o mecanismo habilitado e exige `workspace.isTrusted === false`, sem publicação. A extensão do produto sempre respeita `isTrusted`.

Fontes: [API workspace](https://code.visualstudio.com/api/references/vscode-api), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust), [localização do Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host), [testes de extensões](https://code.visualstudio.com/api/working-with-extensions/testing-extension).
