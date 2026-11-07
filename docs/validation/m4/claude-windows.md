# M4 — recibo Claude Code em laboratório Windows

07/11/2026 · issue [#5](https://github.com/RodReis/war-room3d/issues/5) · [PR #24](https://github.com/RodReis/war-room3d/pull/24). Código executado: `e7694095f3f247f8b59e8fc2806d5ab8a2657ffc`, checkout limpo antes do ensaio. CLI local **Claude Code 2.1.319**, versão conferida pelo próprio roteiro antes de iniciar a sessão.

## Autorização e execução

O PI respondeu **“Autorizar ensaio isolado do Claude”** à solicitação com o escopo: autenticação atual do CLI, sessão nova descartável, uma mensagem sintética, limite de US$ 0,10, timeout de 30 s, sem ferramentas/hooks/MCP e sem retomar conversas existentes. A autorização não abrange Codex, outras sessões ou novas mensagens.

Comando executado uma vez no Windows:

```powershell
node service/scripts/m4-claude-provider-lab.mjs --run
```

O roteiro solicitou `--safe-mode`, `--restricted`, `--tools ""`, MCP vazio/estrito, `--permission-mode dontAsk`, `--permission-prompts none` e `--no-session-persistence`. Usou UUID novo e diretório próprio em `Logs/`; não leu nem copiou credenciais ou carregou conversa pessoal pelo roteiro. A autenticação foi tratada pelo CLI do fornecedor.

## Evidência observada

| Campo | Resultado |
|---|---|
| Estado | **`confirmed`**, recibo do CLI correlacionado |
| Critério | Eco `user` com `isReplay=true`, UUID, sessão, papel e conteúdo exatos da mensagem emitida |
| Mensagens solicitadas ao CLI | **1** |
| Retry automático | **Não** |
| Auditoria | `requested → sending → confirmed`, gravada antes/depois da emissão |
| Início | 07/11/2026 18:24:43.475 America/Sao_Paulo (`21:24:43.475Z`) |
| Confirmação | 07/11/2026 18:24:45.502 America/Sao_Paulo (`21:24:45.502Z`) |
| Intervalo da auditoria | 2,027 s, incluindo inicialização local; não é medição de inferência/API |
| Falha de bootstrap | `false` |
| Código de saída do roteiro | **0**; aguardou término do processo descartável |
| Limite solicitado ao CLI | US$ 0,10 |
| Custo efetivamente consumido | **Não medido**; o limite não é prova do gasto |
| Conclusão de inferência/tarefa | **Não atestada** (`inferenceCompletion=not_asserted`) |

Hash do único payload sintético: `sha256:be233f0ddf940e0693796eb18c1b28006adf18d05d652c3c3309c9df7846cb0c`.

Os arquivos locais `result.json` e `audit.jsonl` permanecem no diretório exclusivo do ensaio, ignorado pelo Git. Identificadores de sessão/conta e caminhos do perfil não foram publicados. Para conferência dos artefatos locais:

- SHA-256 de `result.json`: `276211d83a20f5e166515b87dadd9fceee6fb45c1c367efb356dad2acc4f26d8`.
- SHA-256 de `audit.jsonl`: `65e0696ab72a376accece9ca385297bf7be48adb1e272041d4a00982fb367f32`.

Não foram gravados stdout/stderr brutos, credenciais ou conteúdo de conversas existentes.

## O que este ensaio permite afirmar

O adaptador recebeu um recibo correlacionado de uma sessão nova do **CLI Claude Code 2.1.319** no Windows, usando o canal que pertencia ao roteiro autorizado. O processo foi encerrado após o recibo. Isso não comprova resposta/conclusão do modelo, tratamento de perguntas/permissões, reconexão, comportamento de outra versão nem controle de uma sessão externa observada pela M1.

A prova é histórica e específica da sessão já encerrada. Não foi registrada como capacidade ativa de outra sessão, e os exports padrão do produto continuam indisponíveis. Antes de oferecê-la na Unity, ainda é necessário um canal atual vinculado e prova vigente desse alvo, além dos demais cenários de validação aplicáveis. Não houve novo envio, ensaio Codex, merge ou aceite funcional da issue.
