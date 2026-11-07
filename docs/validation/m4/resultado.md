# M4 — Interação assistida, issue #5

Data: 07/11/2026. [PR #24](https://github.com/RodReis/war-room3d/pull/24), código em `e1eccbce8190fba1f66f6f7055641988b8e84338`. Base inicial `c059be7`; rebase sobre `64f8985` alterou apenas a projeção documental ProPlan da base. Windows x64, Node.js 24.15.0, Unity 6000.3.27f1 / URP 17.3.0. Escopo autorizado: analisar e implementar a issue #5. Provedores reais permanecem sem habilitação; [matriz de capacidades](provider-matrix.md).

Este relatório preserva as provas da entrega inicial. A [continuação por protocolos](protocolos.md) registra fábricas de mensagens, correção adicional de validade da prévia, serviço 114/114 e o roteiro de ensaio real ainda não autorizado.

## Implementação

- Contratos `capability.v1` e `command.v1`, registro de provas/pedidos e adaptadores reais indisponíveis por padrão.
- Gateway com prévia vinculada ao ator e ao conteúdo exato, prazo, projeto, sessão atual, versão, revogação e prova do adaptador. A prévia expira no menor prazo entre 60 segundos, intenção e prova. Revalidação ocorre após espera SQLite e antes da chamada externa.
- Migração SQLite v16: intenção redigida e estados `requested`, `validated`, `sending`, `confirmed`, `rejected`, `expired`, `unknown`; chave única de idempotência e reserva única por pedido. Auditoria registra ator, alvo, hash do payload, prova e versão do adaptador antes da emissão. Não grava texto, credencial, resposta bruta ou erro do provedor.
- Queda após `sending` vira `unknown` no início do escritor. Abertura de um leitor não recupera tentativas em andamento. Nenhum caminho reenvia automaticamente; confirmação tardia não muda `unknown`.
- API local de consulta, prévia e envio. Credencial de comando distinta da leitura, ator/escopo derivados da configuração do serviço, Host/Origin restritos a loopback e corpo JSON limitado a 32 KiB. Não há rota para cadastrar prova, pedido ou shell.
- Painel Unity contextual com sessão, provedor/versão, ação, pedido original, texto a enviar/decisão, origem, prazo e consequência. Prévia perde validade ao trocar projeto/sessão/ação/conteúdo, entrar em replay, perder conexão ou expirar. A consulta periódica de capacidade continua durante a prévia. `unknown` tem mensagem própria e opção de consultar o comando existente.

## Validação

| Prova | Estado | Evidência |
|---|---|---|
| Contratos | `pass` | `cd contracts; npm test`: 12/12; casos negativos recusam shell, ator fornecido pelo cliente, permissão sem decisão e resultado com conteúdo bruto |
| Serviço | `pass` | `cd service; npm test`: 101/101; `npm run typecheck` aprovado |
| Idempotência e recuperação | `pass` sintético | Duas submissões concorrentes, reinício SQLite, estado `sending` recuperado e pedido já reservado não provocam reenvio |
| Autorização e capacidade | `pass` sintético | Modo do servidor prevalece sobre corpo `live`; demo/replay, escopo errado, prova ausente/expirada, versão trocada, revogação, alteração da prévia/pedido e ausência de auditoria bloqueiam emissão |
| Resultado incerto | `pass` sintético | Timeout, erro pós-envio e resposta sem correlação viram `unknown`; resposta tardia não promove sucesso |
| Prazo após espera SQLite | `pass` sintético | Regressão deliberadamente vermelha antes da correção: expiração/revogação após gravação de `sending` impedia rejeição. Após corrigir, não chama adaptador e grava `expired`/`rejected` |
| Unity EditMode | `pass` | `unity test ./unity --mode EditMode --output Logs/m4-editmode-reviewed.xml --timeout 600`: 15/15 |
| Unity PlayMode | `pass` | `unity test ./unity --mode PlayMode --output Logs/m4-playmode-reviewed.xml --timeout 600`: 12/12; demo oculta comandos e live sem configuração bloqueia revisão/confirmar/replay |
| Build Windows | `pass` | `M2LiveProjectSetup.BuildWindowsM4Commands`, `Logs/m4-build-reviewed.log`: 172.334.593 bytes; `BuildPipeline` concluiu com sucesso e exit 0. O CLI também reportou aviso de validação do cliente de licença ignorado pelo Editor; esse aviso não impediu o build |
| Player com laboratório sintético | `pass` | `Logs/m4-player-reviewed/{player-result,backend-result}.json`: confirmação da mensagem, prévia da permissão, bloqueio de replay/troca de projeto e ausência de confusão com o resultado anterior; duas chamadas `Confirm` emitiram uma vez no fake. Quatro PNGs 1280×720 no mesmo diretório, revisados localmente |
| Gate negativo do Player | `pass` | `WR3D_M4_LAB_REJECT=1`, `Logs/m4-player-reviewed-negative/`: `receipt_missing`, Player exit 21 e script exit 1; o fake recebeu uma tentativa. O gate não trata recusa como sucesso |
| Interação nativa com mouse/teclado | `not_run` | Computer Use retornou `Computer Use native pipe is unavailable` nas duas interfaces disponíveis |
| Claude/Codex reais | `not_run` | Sem autorização de laboratório específico e sem adaptação M1 real; indisponíveis no produto normal |
| CI do código `e1eccbc` | `pass` | [Run 42387444297](https://github.com/RodReis/war-room3d/actions/runs/42387444297): Contratos 6 s e Serviço 12 s, ambos `SUCCESS`. Commits documentais posteriores exigem conferir novamente o HEAD na PR |

## Operação e limites

`GET /v1/capabilities` conserva a lista M1/M2 e adiciona sessões com ações/provas/pedidos. `POST /v1/commands/preview` devolve uma confirmação vinculada à intenção; `POST /v1/commands` exige essa confirmação. `GET /v1/commands/{id}` consulta resultado e trilha, dentro do escopo do ator.

O serviço usa `WR3D_SERVICE_TOKEN` para observar. `WR3D_COMMAND_TOKEN` é opcional, tem no mínimo 32 bytes e precisa ser diferente; `WR3D_COMMAND_PROJECT_IDS` lista IDs separados por vírgula, sem wildcard. Ator atual: `operador-local`. Na Unity, a credencial de comando também entra pelo ambiente, sem serialização de cena/argumentos/URL. Nenhuma dessas variáveis habilita Claude/Codex por si só: os adaptadores continuam sem ações e a descoberta de versão real está ausente.

Provas/pedidos ativos são somente memória de integração confiável e precisam ser redescobertos após reinício. Auditoria de metadados não tem exclusão automática nesta fatia; a retenção M3 não a apaga. Exportação/exclusão de trilha e distribuição de credenciais por ACL ainda precisam de entrega própria. Idempotência local não garante exactly-once no provedor.

O script `service/scripts/m4-synthetic-lab.mjs` só inicia com `WR3D_M4_LAB_PLAYER` apontando para o build M4. Cria estado e credenciais efêmeros, anuncia projeto `LABORATÓRIO SINTÉTICO M4` e usa adaptador falso. `WR3D_M4_SYNTHETIC_PROOF=1` e `WR3D_M4_PROOF_DIR` ativam o harness apenas no Development Player; ele exige projeto/sessão sintéticos antes de tocar o fluxo de teste. `WR3D_M4_LAB_REJECT=1` força recusa no fake para verificar o gate negativo.

Imprevistos: primeira compilação encontrou método inexistente `CreateReadRequest`, corrigido por `CreateCommandRequest` com rotas restritas. Um teste de reinício tentou remover diretório antes de fechar o segundo SQLite; teardown corrigido. O teste de permissão tinha deadline maior que o pedido original e foi ajustado ao contrato. Uma chamada PlayMode concorrente com build recebeu aviso de projeto ocupado; esse comando não conta como prova. A captura inicial do Player oculto não gerou textura; repetir com janela visível permitiu as capturas. Limpeza manual de um temporário sintético de ensaio interrompido foi rejeitada pela revisão automática de segurança; o alvo foi preservado, sem tentativa por outro canal.

Revisão visual sintética: as imagens mostraram o resultado da mensagem anterior enquanto uma nova permissão era revisada. O painel agora identifica o resultado como `Último comando` e mantém o estado da intenção atual separado. Campos de pedido/decisão/mensagem aparecem apenas na ação correspondente. A prévia usa rótulo da ação em português e evita repetir o mesmo conteúdo.

Arquivos de cenas/configurações reserializados pelo Editor foram restaurados após os ensaios; a cena live existente instala o painel pelo código de inicialização. Builds, XMLs, imagens e bancos permanecem fora do Git. Não houve alteração dos checkouts anteriores nem merge desta entrega.

As provas não equivalem a suporte operacional Claude/Codex nem aceite funcional do PI. Issue #5 permanece aberta até os critérios e o aceite aplicáveis.
