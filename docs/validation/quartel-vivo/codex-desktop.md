# #55 — Codex Desktop Windows

Estado em 26/11/2026: **preparação técnica com testes sintéticos; prova real `not_run`**. A #55 permanece em execução. Nenhum hook foi instalado, nenhuma sessão pessoal foi lida e nenhum turno foi enviado a agentes neste ensaio.

## Instalação inspecionada

Metadados obtidos por `Get-AppxPackage -Name OpenAI.Codex`, manifesto e `Get-FileHash -Algorithm SHA256`. Apenas o runtime recebeu `--version`; isso não identifica o runtime de uma sessão já aberta. Registro estruturado em [codex-desktop/installation.json](codex-desktop/installation.json).

| Item | Versão ou SHA-256 |
|---|---|
| Pacote Windows `OpenAI.Codex` | `26.1117.4957.0` |
| Entrada do manifesto | `app/ChatGPT.exe` |
| `app/ChatGPT.exe` | `21C2EAC7703B43611392234738F669A8AF23907585B231EBDE54CA3CB104CC82` |
| Launcher `app/Codex.exe` | `A559F472864005394F59D222AC5B88806AE0EC06286CD851849FDD57E2A214B4` |
| Runtime embarcado `app/resources/codex.exe --version` | `codex-cli 0.171.0-alpha.13` |
| SHA-256 do runtime embarcado | `4069ACDD8D101830F63EA5E2775883BFECF8A152AE87EE1B0EF9F14204F850F9` |

## Suporte documentado e limite da atribuição

A [documentação oficial de hooks](https://learn.chatgpt.com/docs/hooks.md) consultada em 26/11/2026 descreve `.codex/hooks.json` em camadas de projeto confiáveis, revisão do hash exato e revisão pelo compositor ou Settings > Hooks no desktop. Também distingue execução local de orquestração cloud, que tem outro suporte de hooks. A documentação atual não é uma certificação retroativa da versão instalada.

O payload comum contém sessão, cwd e evento; não fornece atestado do aplicativo que o emitiu. Portanto `origin` é **declaração local**, não prova criptográfica. O diagnóstico devolve `attribution: declared` e `desktopProof: not_run`. Trocar uma string de configuração não converte CLI/VS Code em Desktop. A prova exigirá interação controlada no aplicativo, correlação de sessão, versão efetiva e hash, com outros emissores excluídos do ensaio. Não se leem transcrições para tentar reconstruir origem.

As notificações do [App Server](https://learn.chatgpt.com/docs/app-server) pertencem ao runtime/cliente conectado. O adaptador existente de cliente próprio não prova captura de sessões abertas pelo aplicativo. A nova restrição recusa notificações App Server em uma fonte Desktop/hooks e recusa hooks no transporte declarado `app-server`.

## Contrato local e captura preparada

`SessionSource.origin` é opcional para compatibilidade. Quando presente, exige exatamente `surface`, `version` fixa e `transport`. Superfícies `desktop`, `cli` e `vscode` usam `hooks`; `app-server-client` usa `app-server`. Restrição disponível inicialmente para Codex. Fontes legadas não ganham atribuição retroativa. A origem fica na configuração/diagnóstico local; o snapshot/UI não foi ampliado para afirmar origem Desktop.

Exemplo fictício de `desktop.sessions.local.json` (não instalar em projetos pessoais):

```json
{
  "schemaVersion": "1.0",
  "projects": [{"projectId":"p","name":"Laboratório","canonicalPath":"D:/Lab/projeto"}],
  "sources": [{
    "sourceId":"desktop-p","sourceVersion":"0.171.0-alpha.13","provider":"codex",
    "projectId":"p","accountRef":"laboratorio","filePath":"D:/Lab/capture.jsonl",
    "staleAfterMs":15000,
    "origin":{"surface":"desktop","version":"26.1117.4957.0","transport":"hooks"}
  }]
}
```

O serviço carrega essa configuração pelo mecanismo existente `WR3D_SESSIONS_CONFIG_PATH`. A captura dedicada lê uma configuração absoluta e um `sourceId`, exige Desktop/hooks sem consentimento de conteúdo, limita o evento a 64 KiB, confere o hash do cwd autorizado e grava somente o resultado sanitizado. Não lê transcrições. O diretório de saída deve existir. Diagnóstico sem leitura do spool:

```powershell
& 'C:/Ferramentas/node24/node.exe' 'D:/Projeto/service/src/sessions/capture-codex-desktop.ts' 'D:/Lab/desktop.sessions.local.json' desktop-p --diagnostic
```

No hook de projeto, o mesmo comando recebe o evento por stdin, **sem** `--diagnostic`. Preparar a definição exata somente após escolher o projeto/sessão; revisar caminhos, conteúdo e SHA-256 antes da confiança nativa. Eventos previstos para o ensaio: `SessionStart`, `UserPromptSubmit`, `Stop`, `Interrupt`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `SubagentStart`, `SubagentStop`. Interrupção recebida pelo adaptador produz espera explícita de sessão/agente; não afirma encerramento ou conclusão de tarefa.

Nenhum arquivo global de trust/configuração foi alterado. Não há bypass. A remoção deverá preservar hooks anteriores e conferir hashes antes/depois; nova confiança é necessária se a definição mudar.

## Matriz de evidência

| Capacidade | Adaptador/teste sintético | Aplicativo instalado |
|---|---|---|
| Início de sessão no projeto correto | pass | not_run |
| Prompt/Stop sem conteúdo | pass nas regressões | not_run |
| Interrupção | pass; espera explícita, não encerra | not_run |
| Retomada, perda de arquivo e reinício do coletor/store | pass; mesma identidade | not_run |
| Origem incompatível | pass; `invalid_scope`, nenhuma sessão | not_run |
| Chat | somente ocorrência/metadados; captura dedicada recusa conteúdo opt-in | not_run |
| Ferramentas e subagentes | adapta sinais permitidos; parentesco ausente permanece pendente | not_run |
| Tarefas e skills | nenhum sinal nativo dedicado comprovado nesta superfície | not_run |
| Trust/revogação pelo aplicativo | não substituído por fixture ou CLI | not_run |
| Coexistência com outras fontes, gráfico e Player | não comprovada nesta fatia | not_run |

Compartilhar `projectId` preserva a identidade de projeto; sessões só compartilham identidade com provider/accountRef/ID nativo comuns. Não fundir atividade apenas por horário, nome ou texto. A deduplicação entre emissores da mesma ação nativa ainda exige ensaio específico; a prova de reinício acima cobre o mesmo spool/fonte, não duas origens distintas.

## Validação e revisão

Seis testes novos falharam antes da implementação, incluindo App Server indevidamente aceito e `Interrupt` descartado. Após implementação: **serviço 207/207**, contratos **19/19**, tipos sem erros, Node 24.22.3. Log local ignorado: `Logs/issue-55-service.log`. As fixtures existem somente nos diretórios temporários dos testes; não alimentaram o Player nem uma conta real.

Revisão do diff completo: origem declarada não é promovida a prova; a captura mantém metadados e escopo; incompatibilidade falha fechada; nenhum segredo, histórico ou configuração pessoal versionado. O fluxo nativo, Player, nova instalação de hooks e aceite funcional continuam `not_run`. CI da PR deve ser verificada no SHA publicado.

## Impedimento atual e continuação

A autorização específica de projeto/sessão/versão foi solicitada ao PI, conforme a própria #55 e o AGENTS.md. Até a resposta, o trabalho independente foi limitado à preparação acima. Após autorização, ainda é necessário obter trust nativo para a definição exata e observar eventos reais. Ausência de evento deverá ser registrada por versão; não será substituída por execução CLI ou servidor próprio. Preservar PR em draft e #55 em `proplan:doing` enquanto esses critérios estiverem pendentes.
