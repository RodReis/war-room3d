# Descoberta autorizada de workspaces VS Code — #54

Execução autorizada pelo PI em 26/11/2026, após #52 e #53. Especificação: quartel vivo de 09/11/2026; issue #54. Usar planejamento e TDD na sessão, sem aprovações intermediárias.

**Objetivo:** observar presença de pastas locais explicitamente vinculadas, mantendo workspace distinto de agente, chat ou atividade.

**Arquitetura:** extensão desktop local opt-in, configuração somente no escopo do usuário, versão VS Code fixada e vínculos canônicos explícitos. Cada janela publica metadados mínimos em arquivo próprio de lease por projeto; não há leitura de conteúdo. O serviço lê somente diretórios configurados, valida versão/identidade/tamanho, deduplica e aplica abertura/fechamento. Lease vencido vira incerteza, nunca fechamento inferido. Autorização da fonte workspace é separada de sessões Claude/Codex. A projeção e as seis vagas existentes são reutilizadas.

**Referências oficiais consultadas:** [workspace API](https://code.visualstudio.com/api/references/vscode-api), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust), [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host), [testes de extensões](https://code.visualstudio.com/api/working-with-extensions/testing-extension). `onDidChangeWorkspaceFolders` não avisa a troca da primeira pasta: o host reinicia. A ativação reconcilia o conjunto inteiro e a desativação só encerra vínculos da própria janela.

## Sequência

- [x] Testes antes do código: configuração vazia/versão/escopo, homônimos e multi-root, duas janelas, preservação de fonte de agente, perda/reconexão, reinício/deduplicação, registros adulterados e revogação. Falha inicial registrada; regressão de restrição de papel também falhou antes da correção.
- [x] Criar publicador em `integrations/vscode-workspaces/`, sem dependências de execução; isolado por janela, gravação atômica, fonte fixada e sem observação de chat/agentes. Estado da extensão é exposto somente com contagens e diagnóstico genérico.
- [x] Criar `service/src/sessions/workspace-source.ts`, bindings próprios e migração 23; acrescentar `workspace.unavailable` ao contrato para perda individual de janela. Ligar o coletor via `WR3D_WORKSPACES_CONFIG_PATH` no serviço de leitura e provar o entrypoint HTTP.
- [x] Rodar contratos 19/19, tipos e serviço 201/201; validar a extensão em VS Code 1.148.0 (commit `661626d0e72f97806550790a98fb87116c9db825`) em perfil descartável com workspaces sintéticos. Perfil habitual e fontes pessoais não foram ativados.
- [x] Provar API/store/Player no laboratório e registrar modo, origem, hash do executável e limites em `docs/validation/quartel-vivo/issue-54.md`. Separar runtime nativo, dados sintéticos e aceite humano.
- [x] Revisar diff completo nos cinco eixos e fazer commit seletivo preservando as alterações locais alheias.

Integração e encerramento seguem o protocolo remoto: PR `refs #54`, CI no HEAD, merge confirmado e CI da main; comentário com Resumo da implementação, Aprendizado e Imprevistos antes de `proplan:done`. A issue permanece aberta para o PI e contém os links e estados atuais. Seguir outro `todo` se existir.

## Limites de escopo

Somente Windows desktop/local e caminhos file explicitamente autorizados. Workspaces remotos/virtuais, VS Code Chat, prompts e eventos de outras extensões não são fontes desta captura. A fonte nova não se apresenta como Claude ou Codex. Instalação permanente e coleta de projetos reais continuam exigindo escopo específico; a prova desta execução usa laboratório sintético isolado.
