# M4 — aceite funcional com limites

**Estado: aceito pelo PI em 07/11/2026, com os limites descritos neste registro e autorização explícita para encerrar a issue #5.**

Data: 07/11/2026, horário de São Paulo. Entrega técnica integrada pela PR #24 em `75ad486`; documentação e CI da `main` em `32461e1`. Este registro não amplia as capacidades operacionais documentadas na [matriz](provider-matrix.md).

## Ambiente apresentado

- Player Windows M4 preexistente, em modo Development, com backend local sintético e adaptador falso. As primeiras rodadas usaram `LABORATÓRIO SINTÉTICO M4` / `session-m4-synthetic`; as rodadas 3 e 4 usaram identificadores exclusivos, descritos abaixo.
- Código C# sem diferenças entre `e1eccbc` e `32461e1`; serviço/contratos de `510274f` sem diferenças em relação à `main` `32461e1`. O build não foi recompilado para este aceite.
- Harness automático desativado: o PI navega no Player. O backend registra tentativas apenas no fake. Nenhum CLI de provedor, conta real ou histórico pessoal é acionado.
- Computer Use indisponível nas duas interfaces: `Computer Use native pipe is unavailable`, erro de conexão ao pipe nativo. A navegação manual do PI não é substituída por automação ou por CI verde.
- As capturas anteriores foram apresentadas somente como referência; não representam a janela desta avaliação.

## Observações do PI

| Etapa | Resultado esperado | Resultado observado |
|---|---|---|
| 1. Prévia da mensagem | Confirmar desabilitado antes de revisar; projeto, sessão, texto, origem, prazo e consequência legíveis; confirmar habilitado após revisão | **Aprovado pelo PI:** “Prévia correta; ainda não enviei” |
| 2. Confirmação e clique duplo | Uma intenção, segundo clique bloqueado e recebimento confirmado; backend recebe uma tentativa no fake | **Correlacionado na rodada 3:** três comandos distintos com o hash do texto solicitado, uma emissão por comando. PI confirmou que revisou e confirmou mais de uma vez. Tentativa de clique duplo solicitada; nenhum comando teve mais de uma emissão. Rodadas anteriores sem correlação ficam registradas abaixo |
| 3. Contexto da permissão e invalidação | Contexto fictício, origem e consequência legíveis; alterar decisão invalida a prévia sem envio | **Verificado na rodada 4:** duas imagens fornecidas pelo PI mostram prévia com “Recusar” e confirmação habilitada; depois “Permitir”, contexto de pedido preservado e confirmação desabilitada. Backend: duas prévias HTTP 200, zero submissões, comandos, auditoria e envios. A separação do resultado anterior tem prova automatizada própria, pois esta rodada iniciou com nova sessão |
| 4. Decisão sobre o escopo entregue | PI aceita, pede ajustes ou exige operação real além do laboratório | **Aceito com limites:** “Aceito com esses limites; pode encerrar a #5” |

## Limites aceitos

O laboratório valida apresentação e controles com dados sintéticos. Os recibos CLI anteriores comprovam uma mensagem por provedor em alvos descartáveis já encerrados; não comprovam operação contínua no M1 nem conclusão de inferência/custo. Perguntas/permissões reais e ações sem canal/prova atual continuam indisponíveis. Timeout/restart, bloqueio de demo/replay e segregação por credencial têm provas automatizadas próprias em [resultado](resultado.md), sem atribuir ao PI observações que ele não realizou.

O PI aceitou explicitamente esse escopo. A decisão não altera a matriz de capacidades nem habilita ações sem prova e canal atuais.

## Operação da rodada

A primeira rodada usou o limite padrão de 5 minutos e registrou zero comandos. Ao encerrar, a limpeza automática encontrou `EPERM`; não houve nova tentativa de excluir esse alvo por outro canal.

Para a rodada manual, o script tem modo `WR3D_M4_LAB_INTERACTIVE=1`: 30 minutos por padrão, artefatos retidos para conferência e observações periódicas exclusivamente sintéticas para manter a fixture atual. A duração pode ser definida por `WR3D_M4_LAB_DURATION_MS`, entre 1 e 60 minutos. O modo automático continua com 5 minutos por padrão. O limite de 60 s da prévia continua aplicado pelo gateway. O comportamento do produto e o build Windows não foram alterados.

Rodada 2 iniciada com sucesso no modo interativo; conferência inicial mostrou observações sintéticas periódicas e zero comandos antes do teste do PI. Identificador solicitado: `ACEITE-M4-RODADA2-0811`. A conferência buscava um único comando confirmado com hash correspondente ao payload desse teste; nenhuma inferência real foi executada.

O PI relatou “Recebimento confirmado para esse teste”, mas a rodada 2 encerrou após 1.800,061 s, com 180 eventos sintéticos, zero comandos e zero envios no relatório do backend. A etapa 2 permaneceu não comprovada nessa rodada; não se atribuiu o resultado a erro do PI ou do produto sem evidência.

Contraprova automática no mesmo build e backend: uma chamada ao fake, `playerExitCode=0`, script exit 0 e encerramento/limpeza concluídos. Essa execução usa o harness do produto; comprova o fluxo automatizado, não cliques humanos. Artefatos em `Logs/m4-functional-control-0811`.

Para as rodadas seguintes, o laboratório interativo passou a identificar projeto e sessão com um código único e contar somente rotas, status e totais HTTP, sem registrar corpo ou credenciais. Primeiro foi solicitado ao PI copiar o valor da sessão exibida; depois foram correlacionados revisão e envio no backend. O aceite final ainda estava pendente nessa etapa.

Rodada 3: o PI copiou `session-m4-aceite-2E34B5`, correspondente à sessão ativa. Conferência às 22h50 de São Paulo: Player ativo, 11 consultas de capacidades, zero prévias, submissões, comandos e auditoria. Foi solicitado o teste `ACEITE-M4-2E34B5-ENVIO1`, com revisão e tentativa de confirmação dupla na mesma intenção. A rodada encerrou às 22h54; o resultado foi conferido abaixo.

Conferência após o PI responder “foi”: a rodada 3 encerrou com quatro prévias HTTP 200, três submissões HTTP 200 e três emissões `send_message` somente no fake. Todos os comandos têm hash correspondente ao texto solicitado, três IDs e três chaves de idempotência distintos, cada um com uma passagem por `requested → validated → sending → confirmed`. Horários de confirmação (São Paulo): 22h52min47s, 22h53min23s e 22h54min02s. O PI esclareceu: “Sim, revisei e confirmei mais de uma vez”. O resultado corresponde a intenções distintas; não houve repetição de emissão no mesmo comando. A prova de cliques humanos é o relato do PI; os registros corroboram a unicidade por comando. Não se declarou aceite final.

Rodada 4: projeto `LAB M4 SINTÉTICO · 44F93C`, sessão `session-m4-aceite-44F93C`, copiada pelo PI. As duas imagens fornecidas no chat mostram o pedido `synthetic-decide_permission`: ferramenta fictícia solicita acesso a arquivo sintético, origem `synthetic:request`, consequência restrita ao adaptador falso e sem efeito externo. A primeira mostra “Recusar”, prévia completa e confirmação habilitada. A segunda mostra “Permitir”, remoção da prévia de decisão e confirmação desabilitada, mantendo o contexto do pedido. Às 22h59 de São Paulo o backend tinha duas prévias HTTP 200 e zero submissões, comandos e auditoria. O Player próprio foi encerrado e o roteiro concluiu com exit 0, zero emissões e artefatos preservados. As imagens são observações fornecidas pelo PI nesta rodada, não capturas feitas por Computer Use.

## Decisão final do PI

Após revisar as provas de apresentação, envio sintético correlacionado e invalidação da prévia, o PI respondeu: **“Aceito com esses limites; pode encerrar a #5”**. A pergunta de aceite explicitou os recibos pontuais Claude/Codex já documentados, a indisponibilidade de ações reais sem vínculo e prova atuais, e a ausência de comprovação de operação contínua com sessões M1 e perguntas/permissões reais.

O aceite autoriza encerrar a issue nesse escopo. Não declara operação contínua nem suporte uniforme entre provedores. Os laboratórios foram encerrados; nenhum envio adicional a provedor real foi realizado durante o aceite. Os artefatos sintéticos locais foram preservados, sem publicar bancos, logs, credenciais ou capturas brutas.

[Decisão registrada na issue](https://github.com/RodReis/war-room3d/issues/5#issuecomment-6715930879). Encerramento remoto confirmado como `closed/completed` em `2026-11-08T02:01:56Z` (23h01 de 07/11/2026, São Paulo).

## Validação da publicação

Revisão local do diff completo: correção, legibilidade, arquitetura, segurança e desempenho, sem achados bloqueantes. Alterações restritas ao roteiro sintético e à documentação; sem mudanças no C# ou no serviço operacional. `node --check` e `git diff --check` aprovados; seis documentos com links locais conferidos, sem destinos ausentes. Serviço 130/130, contratos 12/12 e typecheck aprovados após o aceite. As rodadas manuais cobrem o modo interativo; não foram criados testes que apenas repetem sua configuração. CI e SHA da publicação devem ser conferidos na PR correspondente.
