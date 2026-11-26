# Plano da #55 — origem e captura do Codex Desktop

**Objetivo:** preparar captura mínima por projeto, impedir confusão entre hooks e App Server e produzir prova independente do aplicativo Windows.

**Arquitetura:** a origem declarada na configuração identifica superfície, versão e transporte. Ela restringe os formatos aceitos, mas não autentica o aplicativo. Atribuição Desktop exige ensaio controlado no aplicativo com versão/hash e sessão autorizados; nenhuma inferência pela existência de arquivos pessoais.

**Tecnologias:** serviço TypeScript/Node 24, hooks locais Codex, SQLite existente; sem alteração Unity nesta preparação.

## Execução

- [x] Consultar issue, spec, instalação local e documentação oficial. Registrar pacote 26.1117.4957.0 e runtime 0.171.0-alpha.13 sem ler histórico.
- [x] Escrever testes negativos para configuração/origem incompatível e para perda/retomada/reinício, com dados sintéticos identificados.
- [x] Implementar `service/src/sessions/source-origin.ts`: contrato de configuração e restrição de transporte; usar em parser, adaptadores e coletor. Fontes legadas permanecem sem origem declarada.
- [x] Implementar captura exclusiva de metadados em `service/src/sessions/capture-codex-desktop.ts`, selecionando uma fonte e seu projeto na configuração; limitar entrada a 64 KiB e verificar hash do cwd antes de gravar.
- [x] Mapear `Interrupt` para espera explícita da sessão/agente, preservando presença. Não inventar evento de tarefa ou skill.
- [ ] Rodar `npx --yes node@24 --test` e tipos em `service`, revisar diff e publicar PR. Sem prova real, manter draft e #55 em doing.
- [ ] Após autorização específica, preparar hook local revisável, obter trust pelo aplicativo para o hash exato, observar sessão, interrupção, retomada e reinício e verificar Player. Remover somente os artefatos próprios e conferir restauração.
- [ ] Com critérios atendidos: CI verde no HEAD, merge, CI main, comentário de encerramento e done. Sem acesso autorizado/suporte comprovado, registrar impedimento real e preservar PR/branch.

## Limite atual

Autorização específica de projeto/sessão foi solicitada. Nenhum hook foi instalado e nenhum comando foi enviado a agentes. Testes de adaptador não provam funcionamento no Desktop. A escolha de laboratório descartável permite preparar o ensaio sem acessar sessões pessoais; o envio de turnos de teste exige autorização correspondente.
