# Sala de referência — experiência completa no Unity Player

Data: 08/11/2026. Direção e planejamento autorizados pelo PI nesta conversa. Entrega [#28](https://github.com/RodReis/war-room3d/issues/28); [plano de execução](../superpowers/plans/2026-11-08-sala-referencia-player.md). **Planejada; não implementada nem aceita por este documento.**

## Problema e decisão

O conceito apresenta mobiliário, pessoas, materiais e iluminação detalhados; as capturas do Player mostram geometria provisória, pouca informação espacial e formulários que dominam a tela. A M0 iniciou com primitivas e os ativos ensaiados ficaram fora do build. Avançar subsistemas não eliminou essa distância.

M0–M5 continuam sendo etapas do produto completo. A próxima entrega concentra lacunas de apresentação e integração em **uma sala acabada**, observável do quartel, interior e ângulo oposto. O PI pediu design rico, detalhe de qualidade, luz e cores vivas, com hooks, agentes, skills, chats e logs funcionais. Replicar o acabamento exige aceite explícito dessa experiência no Player.

Alternativas: polir somente HUD deixaria arte e atividade espacial provisórias; reconstruir seis salas simultaneamente multiplicaria retrabalho; uma sala de referência permite avaliar qualidade e funcionamento cedo. Adotada a terceira opção. As outras posições existentes podem permanecer acessíveis para regressão, identificadas como provisórias, sem anunciar seis salas finalizadas.

## Resultado e fronteiras

- Uma sala modular real em Unity: mesma instância e identidades nas três vistas, prefabs e ativos incluídos no build.
- Jornada de seleção, observação, chat/intervenção e investigação, com sessão, agente e evidência corretos.
- Player Windows reproduzível, matriz de fontes/capacidades, capturas e medidas; demonstração, observação e comandos distinguíveis.
- Sem expansão do acabamento para outras salas/setores nem redesenho completo do data center antes do aceite final.

Esta solicitação autoriza planejamento e criação das issues. Instalação de hooks, acesso a conversas/contas e ensaios reais serão delimitados na execução. Não reutilizar autorizações consumidas dos ensaios M4. Geração paga de ativos e ferramentas de autoria específicas não são dependências obrigatórias.

## Arte rica, luz e cor — #29

Referência: imagens conceituais do quartel e das duas vistas internas apresentadas pelo PI em 08/11/2026. Referências locais ficam fora do Git até revisão de direitos/conteúdo; registrar hash e caminho em inventário local para não depender da memória da conversa. Não incorporar screenshots como fundo de uma cena supostamente 3D.

| Dimensão | Resultado exigido no Player |
|---|---|
| Arquitetura | Paredes recortáveis, volumes e bordas tratados, entrada e piso segmentado; profundidade e mesma sala reconhecível nos dois ângulos |
| Mobiliário | Mesa circular/oval e holograma, cadeiras, estações/monitores, racks e objetos de apoio com proporção coerente |
| Materiais | Metal com variação de rugosidade, vidro controlado e emissivos; sem aparência final de cubos chapados |
| Cor e vida | Ciano/turquesa e verde vivos, acentos quentes e vegetação; grafite não apaga contornos |
| Luz | Ambiente, tarefa e destaque; sombras de contato e separação de planos; bloom/reflexos não estouram silhuetas ou leitura |
| Pessoas | Humanos estilizados com acabamento, roupa, forma, poses e cadeiras coerentes; sem corpos voxel como arte final |
| Composição | Vista geral identificável; interior com foco em mesa/agentes; oposto sem oclusão crítica |

Cada dimensão tem captura comparável e avaliação do PI. Contagem de props, render externo, Editor e build compilado não substituem revisão no Player. Manter o grafite do GDD com cor viva nos pontos de interesse, sem neon uniforme em todas as arestas. Seleção ciano; saúde/atenção/falha com texto e ícone, sem confundir luz decorativa e indicador operacional.

Inventário de ativos: origem, autor/licença, permissão de redistribuição, hash, derivação, fonte editável, exportação, materiais/texturas e custo observado. Preservar originais. Ativo não distribuível exige substituto autorizado, não redução silenciosa do aceite a primitivas. Perfis visual e reduzido preservam silhueta, informação e identidade; alteram custo de sombras/reflexos/efeitos/LOD conforme medição.

## Layout e navegação — #30

Quartel: cabeçalho compacto com modo e saúde das fontes, etiqueta sobre a sala, resumo à direita com projeto/provedores/presentes/trabalhando/atividade. Cena domina a vista padrão. Resumo recolhível e busca/lista permitem navegação direta.

Interior: breadcrumb/retorno, seleção equivalente por avatar e árvore, abas **Atividade**, **Chat**, **Logs** e **Fontes**. Atividade apresenta tarefa, ferramenta/skill, vínculo e último sinal. Chat/log podem ampliar por ação explícita. Detalhe técnico sob demanda, sem despejar IDs e nomes de implementação no fluxo principal.

Modal: título/alvo estáveis, pedido original legível, decisão/prazo/consequência; corpo rolável e ações alcançáveis. Revisar intenção e confirmar envio são etapas distintas. Mudar alvo/conteúdo invalida prévia. Contexto longo não pode ocultar fechamento/confirmar.

Validar 1920×1080 e 1440×900 em 100/125/150%, mais regressão 1366×768. Texto essencial ≥14 px lógicos conforme RNF-06. Esc fecha detalhe antes de voltar; foco visível; mouse/roda/atalhos na UI não controlam câmera. Carregamento, erro, vazio, fonte ausente e desatualização têm estados próprios.

## Fontes, hooks e atividade — #31 e #32

Serviço é dono da coleta/normalização/persistência; Unity consome projeção e deltas. Na base consultada, o contrato event.v1 ainda não representa tarefas, ferramentas, skills ou mensagens. Evoluir contrato/store/projeção com compatibilidade; não acrescentar texto ad hoc ao HUD para simular integração.

Fluxo: fonte permitida → adaptador versionado/hook ou reconciliação → validação/redação → store/cursor → API → representação Unity. Conteúdo recebido é dado, nunca instrução para o coletor executar.

| Informação | Regra |
|---|---|
| Hook/fonte | Instalação/ativação, versão, escopo, último evento, cobertura e erro; transporte conectado não prova hook ativo |
| Principal | Claude/Codex independentes; IDs de projeto/sessão/conta opaca, sem agrupar por nome de pasta |
| Subagente | Pai somente por ID da fonte; pai ausente fica vínculo pendente |
| Tarefa/ferramenta | Distinguir tarefa declarada/observada, chamada, resultado e falha |
| Skill | Nome/instante quando expostos; sem fim confiável, mostrar invocação observada, sem duração/conclusão inventada |
| Fonte perdida | Estado incerto/desatualizado; não concluir tarefa nem presumir saída |

Matriz por provedor/versão declara suporte a presença, trabalho/espera/fim, filhos, tarefas, ferramentas, skills, leitura de chat, envio e pedidos. Não presumir paridade. Obrigatório sem suporte fica bloqueado para decisão do PI. Instalação por projeto/sessão é explícita e reversível, sem hook global por padrão. Hooks de eventos do produto são distintos de MCP/ferramentas de autoria.

Avatares e estações correspondem a agentKey/sessionKey; lista e cena usam a mesma seleção. Presentes e trabalhando são contados separadamente. Até 12 avatares individuais por sala conforme GDD; excedentes agrupados com lista completa. Poses/animações breves de trabalho/espera/ociosidade não criam eventos ou diálogos fictícios. Reduzir movimento mantém estado legível. Sala sem sessão fica mobiliada, sem ocupantes operacionais inventados.

## Chat e intervenção — #33

Chat contém histórico paginado de mensagens e respostas, papel, horário, sessão e proveniência; não é apenas campo para enviar intenção. Separar conteúdo observado, rascunho e trilha de comando. Trocar sessão não mistura mensagens nem transfere alvo/rascunho inadvertidamente.

Reusar gateway M4, capacidade atual, prévia, auditoria, expiração e idempotência. Recibo de CLI indica o nível de confirmação disponível, não resposta do modelo ou tarefa concluída. Timeout após submissão fica desconhecido sem retry automático. Pergunta/permissão mantém pedido original e retorno ao fluxo nativo se indisponível. Demo/replay bloqueiam comando também no servidor.

Prova de ida e volta real por provedor em laboratório especificamente autorizado é obrigatória para declarar chat operacional. Pergunta/permissão tem prova sintética de controle e real quando exposta; impossibilidade real vai à matriz e exige aceite explícito do limite pelo PI.

## Logs e evidências — #34

Separar eventos da sessão/ferramenta, logs de aplicação/infraestrutura e diagnósticos do War-Room3D. Filtrar projeto, agente/sessão quando existente, ambiente, recurso, intervalo e severidade. Log sem sessão não ganha agente responsável inventado.

Páginas limitadas, linha longa expansível, pausa de atualização e posição de leitura preservada. Origem, horário, cobertura e truncamento visíveis. Correlação por IDs explícitos; coincidência temporal é inferência. Agente → evento → evidência → retorno preserva contexto.

Redação antes de persistir/exibir; canários sintéticos comprovam remoção de segredos. Evidência externa tem acesso/localização revalidados. Fonte ausente significa sem cobertura, não ausência de erros. Ao menos uma fonte real de laboratório chega ao Player com escopo/permissão documentados. PR #26 está draft na consulta: revisar/integrar dependência, sem declarar código presente na main ou duplicá-lo no cliente.

## Jornada obrigatória e gates — #35

1. Abrir Player, identificar modo/fontes e selecionar projeto por etiqueta/lista.
2. Entrar na mesma sala, selecionar principal/subagente e focar a estação correspondente.
3. Ler tarefa/ferramenta/skill, origem/atualidade e abrir evento/evidência.
4. Abrir chat da sessão, consultar histórico/resposta, revisar/enviar intenção suportada e acompanhar resultado correlacionado.
5. Revisar pergunta/permissão com pedido e capacidade; suporte ausente é explicado.
6. Consultar logs, filtrar/paginar, abrir evidência e retornar sem perder seleção.
7. Perder/recuperar fonte e reconectar sem duplicação; demo/replay não habilitam comando; voltar ao quartel.

| Gate | Prova | Condição de avanço |
|---|---|---|
| G1 — arte | Primeiro Player com sala acabada, três vistas e comparação ao conceito | Revisão artística pelo PI; corrigir desvios antes de expandir ativos |
| G2 — uso controlado | Jornada com fixture marcada e negativos | Fluxo legível/rastreável no Player, sem declarar integração real |
| G3 — operação | Duas principais Claude/Codex, subagente real, atividade/skills expostas, chat real ida/volta por provedor e fonte real de logs | Fonte → serviço → Player correlacionados; matriz de versões/limites |
| G4 — aceite da sala | Mesmo build final, arte/jornada/integração/escalas/desempenho | PI aceita explicitamente build e limites; só então propor replicação |

G1 revisa arquitetura, mobiliário, materiais e iluminação; o acabamento/rig dos avatares entra na #32 e no G4, sem criar dependência circular com #29. G1 pode usar dados ilustrativos marcados. Em G3, skill sem suporte ou capacidade obrigatória ausente não passa por estar bem explicada: manter bloqueio ou registrar dispensa explícita do PI. Não exigir paridade fictícia: a matriz mostra onde cada requisito foi demonstrado.

RNF-01: p95 ≤2 s entre evento aceito e HUD em 10 eventos/s, atraso da fonte separado. RNF-02: 1080p/10 minutos, p95 apresentado ≤16,67 ms no perfil visual e ≤33,33 ms no reduzido. Registrar CPU/GPU/memória, janela visível, método e perdas. A #16 contém reprovação anterior; não mudar meta nem chamar FPS interno/média de aprovação. Usar carga de referência do PRD, indicando dados sintéticos; a sala acabada não dispensa regressão do setor existente.

Manifesto: SHA/hash do executável, Unity/pacotes, configuração, hardware, resolução/escala e origem dos dados; capturas comparáveis e resultado pass/fail/not_run por critério. Publicar só conteúdo sanitizado. Mudança relevante de arte/UI/integração exige revalidar o afetado, sem misturar capturas de builds diferentes como entrega única.

## Rastreabilidade e conclusão

| Issue | Resultado | Origem |
|---|---|---|
| [#29](https://github.com/RodReis/war-room3d/issues/29) | Arte/materiais/luz | M0; GDD §§3/6/9; RF-10/11 |
| [#30](https://github.com/RodReis/war-room3d/issues/30) | HUD/navegação | RF-09/10/11/13; RNF-06 |
| [#31](https://github.com/RodReis/war-room3d/issues/31) | Hooks/fontes/skills | M1; RF-01–07/34/35 |
| [#32](https://github.com/RodReis/war-room3d/issues/32) | Avatares/atividade | RF-04/05/06/10/12/29/30 |
| [#33](https://github.com/RodReis/war-room3d/issues/33) | Chat/decisões | M4; RF-31–33/36/38 |
| [#34](https://github.com/RodReis/war-room3d/issues/34) | Logs/evidência | M5; RF-19/23/37/38 |
| [#35](https://github.com/RodReis/war-room3d/issues/35) | Player/aceite | RNF-01/02/06; GDD §20 |

Cada fatia pode integrar sem fechar #28. Obrigatório fail/not_run mantém gate pendente; dispensa/mudança de produto exige PI. A revisão não reabre issues antigas nem reescreve seus aceites. Fechamento de M0–M5 não prova aceite desta nova sala.
