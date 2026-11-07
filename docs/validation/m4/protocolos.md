# M4 — continuação por protocolo

07/11/2026 · issue [#5](https://github.com/RodReis/war-room3d/issues/5) · [PR #24](https://github.com/RodReis/war-room3d/pull/24). Base desta continuação: `346af67`. O [relatório inicial](resultado.md) registra Unity/build e o primeiro gateway; este documento registra o delta de serviço.

## Resultado e fronteira

Fábricas de mensagens preparadas para Codex CLI **0.166.0** e Claude Code **2.1.319**, versões consultadas localmente com `--version`. Os exports usados pelo serviço normal continuam com `actions=[]`. A existência de código/protocolo não habilita uma capacidade e não prova acesso à sessão observada.

O host deve fornecer stdin/stdout já vinculados e a identidade completa de sessão, conta opaca, projeto, versão e conexão. Não há criação/retomada de thread, descoberta de conversas, conexão automática a daemon, alteração de aprovação ou sandbox, nem instalação de hooks. Um canal encerrado ou de outro vínculo recusa emissão. O adaptador só implementa `send_message`; perguntas e permissões continuam indisponíveis.

## Protocolos implementados

| Provedor | Emissão | Confirmação aceita | Limite |
|---|---|---|---|
| Codex 0.166.0 | `turn/start` na thread vinculada ociosa; `turn/steer` com `expectedTurnId` no turno ativo conhecido | Resposta do ID RPC emitido, resultado compatível; no steering, mesmo turno | Sem fallback entre métodos. Erro interno, resposta de outro ID ou formato incompatível ficam incertos; erros RPC de requisição/método/parâmetros recusam |
| Claude 2.1.319 | `user` em stream-json, UUID próprio, `session_id` vinculado e conteúdo tipado | Eco `isReplay=true` com UUID, sessão, papel e conteúdo exatos | Resultado/“OK” do assistente não é recibo. Sem eco correlacionado, permanece incerto |

O canal JSONL limita quadro a 64 KiB, 32 esperas e buffer de escrita a dois quadros. Decodifica UTF-8 completo por linha; formato inválido, perda do pipe, EPIPE, abort e timeout encerram a espera sem retry. Não registra frames, stderr nem mensagens brutas. Fechar o canal não administra o processo pertencente ao host.

Provas de capacidade ainda precisam vir de um ensaio Windows autorizado e ser registradas no `CapabilityRegistry` com versão e validade. O host também precisa resolver o alvo atual no gateway. Uma fábrica isolada não substitui os adaptadores observadores M1 nem torna um processo externo controlável.

## Validação local

- `cd service; npm test`: **114/114**, incluindo cinco testes de canal e sete testes de adaptadores/integração com gateway; `npm run typecheck` aprovado.
- `cd contracts; npm test`: **12/12**; contratos sem alteração nesta continuação.
- `codex app-server generate-json-schema --out Logs/m4-protocol-codex-0.166.0`, seguido de `node service/scripts/m4-validate-codex-schema.mjs`: quatro formatos sintéticos compatíveis com schemas do executável instalado; falta de `expectedTurnId` recusada. Resultado e hashes dos schemas em `Logs/m4-codex-schema-result.json`. Não abre app-server nem executa inferência.
- Player existente, com código C# inalterado e serviço desta continuação: `Logs/m4-player-protocol-continuation/{backend-result,player-result}.json`, ambos `pass`; uma emissão no fake, permissão revisada, replay/troca de projeto bloqueados. Build reutilizado de 172.334.593 bytes; não é ensaio dos CLIs reais.
- Claude Code 2.1.319: **`pass` pontual** após autorização específica, uma mensagem e recibo correlacionado; [prova Windows](claude-windows.md). Codex real: **`not_run`**. A consulta de ajuda/versão e a geração de schema não contam como recebimento de mensagem.

### Achado corrigido

**P2 — `service/src/commands/gateway.ts`, revalidação após `sending`:** a prévia de 60 s podia expirar durante espera SQLite enquanto intenção e prova ainda tinham prazos maiores. O teste `prévia expirada durante espera SQLite não vale mesmo com intenção e prova vigentes` falhou com emissão indevida antes da correção; depois, grava `rejected/confirmation_invalid` e não chama o adaptador. A validade da própria prévia agora é conferida novamente junto de prova e pedido.

Outra regressão de protocolo confirmou que uma resposta Codex sem `items` obrigatórios não pode ser aceita como recibo. Os testes recusam esse formato, erro interno, ID estranho e envelope de request em lugar de response.

## Roteiro de ensaio real preparado

`node service/scripts/m4-claude-provider-lab.mjs` mostra o plano e **não inicia Claude**. Somente `--run` inicia o ensaio, que requer autorização específica do PI:

- Claude Code 2.1.319 já instalado; autenticação atual do próprio CLI, sem leitura/cópia de credenciais pelo roteiro.
- Sessão nova com UUID próprio, diretório `Logs/m4-claude-real-<uuid>`, sem retomar conversas existentes e sem persistência de sessão.
- Uma mensagem fixa: `Teste sintético War-Room3D M4. Não use ferramentas. Responda somente WR3D_M4_ACK.`
- `--safe-mode`, `--restricted`, `--tools ""`, MCP vazio e estrito, permissões `dontAsk`/`none`; limite de US$ 0,10 pelo CLI e timeout local de 30 s. Sem alteração de configurações persistentes.
- Grava intenção/estados redigidos antes/depois do envio. Nunca grava stdout/stderr bruto, token ou conteúdo de conversas. A confirmação significa recebimento correlacionado; não atesta conclusão de inferência. O processo descartável de laboratório é encerrado ao final; esse ciclo não é uma função do produto.

Após o PI autorizar o escopo acima, o roteiro foi executado uma vez com `--run` no código `e769409`: recibo `confirmed`, sem retry e processo descartável encerrado. [Auditoria, hashes e limites](claude-windows.md). Não há autorização para outro envio. O [laboratório Codex](codex-laboratorio.md) agora possui roteiro opt-in e pré-testes sintéticos; o envio real permanece `not_run`, sem reutilizar autorização de Claude. Seus limites de sandbox, ferramentas internas residuais e ausência de teto monetário são explícitos.

## Fontes de protocolo

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): RPC, turn/start, turn/steer, turno esperado e resolução de pedidos. O schema exportado localmente fixa a compatibilidade com 0.166.0.
- [Claude CLI](https://code.claude.com/docs/en/cli-reference): modos stream-json e replay-user-messages, isolamento e limite do ensaio.
- [Referência TypeScript Claude](https://code.claude.com/docs/en/agent-sdk/typescript): `SDKUserMessageReplay`, UUID e sessão; o contrato descreve o formato, sem substituir o ensaio da versão instalada.
