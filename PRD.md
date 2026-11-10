# War-Room3D — Documento de Requisitos do Produto

Versão: 1.2 · Base: 06/11/2026 · Revisão de entrega: 09/11/2026 · Responsável de produto: Rodrigo.

**Estado:** PRD e [GDD](GDD.md) aprovados em 06/11/2026 como referência de planejamento. Requisitos e metas abaixo descrevem o produto a construir, não funcionalidades entregues. Os relatórios anteriores permanecem como evidência histórica.

## 1. Visão e problema

War-Room3D é um quartel-general virtual desktop, desenvolvido em Unity, para acompanhar projetos de software, sessões de agentes de IA e infraestrutura relacionada em um mesmo ambiente espacial. Cada projeto tem uma sala; um data center permanente conecta os recursos compartilhados às salas que dependem deles.

Hoje, a atividade está dispersa entre IDE, terminais, conversas, GitHub, logs e ferramentas de monitoração. É difícil saber quais projetos estão ativos, qual agente está executando qual tarefa, onde uma intervenção é necessária e quais serviços estão afetados. O produto transforma sinais observados em estados visuais navegáveis, preservando acesso às evidências.

O aspecto de jogo torna o trabalho perceptível e agradável. Não substitui a verdade operacional, não mede produtividade humana por tokens e não apresenta animação como comunicação real entre agentes.

**Perguntas que a interface deve responder:** o que está ativo; quem está trabalhando; em quê; qual ferramenta está sendo usada; qual serviço está degradado; quais projetos dependem dele; o que precisa da minha decisão; o que aconteceu no dia.

## 2. Público e plataforma

| Público | Necessidade principal |
|---|---|
| Desenvolvedor com vários projetos e sessões | Alternar contexto e localizar espera, execução e falhas |
| Líder técnico acompanhando agentes | Entender delegações reais, tarefas, entregas e pedidos de intervenção |
| Desenvolvedor responsável por operação | Relacionar mudanças de software com saúde de APIs, bancos e contêineres |
| Operador individual do quartel | Revisar o dia e investigar incidentes sem abrir todos os terminais |

Plataforma inicial proposta: Windows 11 x64, aplicação desktop local, teclado e mouse, idioma pt-BR. Windows/WSL e Docker são ambientes de integração a validar explicitamente, não plataformas equivalentes por suposição. macOS, Linux desktop, mobile, VR e operação multiusuário remota ficam fora da primeira distribuição.

## 3. Decisões e status

| Tipo | Conteúdo |
|---|---|
| Direção aprovada | Unity 3D, salas por projeto, data center integrado, visual sci-fi sóbrio, atividade real, avatares, Meu dia, timelapse, celebrações e alarmes |
| Direção técnica consolidada | Apresentação Unity separada da coleta; adaptação híbrida do GLB; múltiplas sessões principais; infraestrutura com telemetria própria |
| Evidência existente | Conceitos visuais e arquivos GLB fornecidos para avaliação local; sua publicação exige revisão de direitos |
| Padrões propostos nesta versão | Plataforma inicial, retenção, limites de carga, cadências, metas de desempenho e etapas; sujeitos à revisão e medição |
| Estado no planejamento original (06/11/2026) | Unity, serviço e conectores ainda seriam construídos; consultar [STATUS](docs/STATUS.md) para entregas e limites atuais |

O arquivo v2 tem quatro salas periféricas. O requisito do produto continua sendo até seis posições de projeto por setor, com expansão para outros setores. Isso requer adaptação artística; não é capacidade pronta do GLB.

## 4. Princípios obrigatórios

1. Todo estado operacional deriva de evidência ou inferência identificada.
2. Ausência de informação é “Sem dados”, nunca zero, saudável ou concluído por conveniência.
3. Sessão, projeto, tarefa, serviço e ambiente têm identidades distintas.
4. Abrir workspace, detectar sessão e iniciar execução são acontecimentos diferentes.
5. Um projeto pode ter vários agentes principais; subordinação exige vínculo real.
6. Fechar a última sessão não encerra infraestrutura nem apaga incidentes.
7. Simulação visual não altera o estado operacional.
8. Observar, enviar mensagem, aprovar ferramenta e administrar infraestrutura são capacidades diferentes.
9. Replay e demonstração nunca emitem comandos reais.
10. O ambiente domina a tela; o detalhe crítico permanece legível em UI contextual.

## 5. Escopo por entregas

As etapas são unidades de produto com aceite próprio. Não constituem cronograma nem autorização para instalar integrações ou atuar em produção.

<a id="quartel-vivo"></a>

**Prioridade aprovada em 09/11/2026, fonte inicial alterada pelo PI em 10/11/2026:** [quartel vivo no Player (#46)](https://github.com/RodReis/war-room3d/issues/46). Primeiro, vista fiel ao protótipo com dois projetos ativos de uma fonte real, agentes humanos identificáveis com roupas distintas e gráfico de atividade observada. O ensaio do plugin Codex no VS Code em `rrb-forjaOS` não produziu eventos. O PI escolheu em seguida o Claude Code no VS Code local em `arenahub`: uma sessão real chegou ao serviço, mas a prova de um projeto não satisfaz a meta de dois projetos nem comprova o Player. Depois do aceite no Player, expandir a descoberta de workspaces do VS Code e validar [Claude Code Desktop (#59)](https://github.com/RodReis/war-room3d/issues/59) e Codex Desktop em etapas próprias. As salas de projeto são dinâmicas. Cafeteria, sala de reunião do PI e data center têm posição fixa. Ver [especificação](docs/specs/2026-11-09-quartel-vivo-design.md) e [plano](docs/superpowers/plans/2026-11-09-quartel-vivo-player.md).

<a id="sala-referencia"></a>

**Entrega de referência aprovada em 08/11/2026:** entregar [uma sala completa no Unity Player (#28)](https://github.com/RodReis/war-room3d/issues/28), com design rico e fiel ao conceito, detalhes de qualidade, iluminação e cores vivas, layout contextual e fluxo hooks/agentes/skills/chats/logs. [Especificação](docs/specs/2026-11-08-sala-referencia-design.md) e [plano](docs/superpowers/plans/2026-11-08-sala-referencia-player.md) detalham #29–#35. A sala deve ser validada no Player pelo PI antes de replicar acabamento para outras salas/setores. Isso corrige a execução transversal de M0/M1/M4/M5, sem reduzir M0–M5 a uma fase estrutural nem reescrever aceites anteriores. Build/CI e fechamento de issue não equivalem à conclusão dessa experiência.

| Etapa | Entrega | Critério de saída |
|---|---|---|
| M0 — fundação e arte | Contrato, identidades, estado de exemplo separado, ensaio de recuperação do GLB, sala modular, núcleo e câmera | Mesma sala em três vistas, seis posições por setor, dados ilustrativos identificados e arte avaliada de perto |
| M1 — quartel vivo / MVP 1 | Claude e Codex observados, salas dinâmicas, tarefas/ferramentas, fontes e feed, armazenamento básico de marcos | Duas sessões independentes e um subagente real; isolamento de projetos; reconexão sem duplicação |
| M2 — infraestrutura essencial | Data center, vínculo projeto/ambiente/recurso, host, Docker, API e um banco do inventário real | Recurso compartilhado afeta projetos corretos; perda de coleta não vira saudável; serviço continua monitorado sem agentes |
| M3 — histórico e GitHub / MVP 2 | Meu dia, replay, eventos/efeitos persistidos, integração GitHub independente da sessão | Replay recupera incidentes e marcos; CI correlacionado; diferenças entre horas-agente e tempo decorrido claras |
| M4 — interação assistida | Mensagens e permissões por capacidade, respostas a perguntas quando suportadas | Alvo e resultado rastreáveis, expiração e duplicação tratadas; validação por provedor no Windows |
| M5 — operação ampliada | Logs/rastros detalhados, sinais de rede, fontes de segurança, cobertura e incidentes completos | Evidência navegável, classificação de detecção e isolamento entre ambientes; critérios específicos por conector |

O produto completo deste PRD inclui M0–M5. M1 entrega acompanhamento de agentes; não será anunciado como monitoração completa de infraestrutura. M2 não será anunciado como detecção de ataques. Logs de diagnóstico do próprio aplicativo existem desde M1; a pesquisa de logs dos serviços é ampliada em M5.

Evoluções posteriores: passeio com avatar humano, exportação de vídeo, narrativa por IA, cidade online, colaboração remota, personalização extensa e ações administrativas. Não são pré-requisitos para concluir M0–M5.

## 6. Jornadas principais

### 6.1 Começar um projeto

O usuário abre um workspace com integração de IDE configurada ou inicia uma sessão reconhecida. O registro resolve a identidade do projeto. A primeira evidência válida cria ou reativa a sala na posição persistida. O avatar só aparece quando uma sessão/agente existe; workspace aberto sem agente mostra “Aguardando sessão”. Uma segunda sessão ocupa a mesma sala apenas se o vínculo de projeto for inequívoco.

### 6.2 Acompanhar trabalho e intervir

Na visão geral, o usuário identifica uma sala com atenção, seleciona seu resumo e entra. Encontra sessões principais e subagentes reais, tarefa, ferramenta e pedido. Ao selecionar o agente, consulta evidência e capacidades. Na etapa M4, pode enviar mensagem ou decidir uma solicitação vigente, sempre vendo alvo, prazo e resultado disponível.

### 6.3 Investigar um incidente

O data center recebe evidência de falha. Um banco compartilhado destaca as salas dependentes como impacto potencial; falha confirmada de cada API depende de sua própria evidência. O usuário filtra por produção, abre logs/indicadores e acessa as sessões do projeto. Merge/deploy podem compor a linha temporal, mas não provam causa nem recuperação. A telemetria correspondente confirma a recuperação.

### 6.4 Encerrar o trabalho

Após encerramento confirmado da última sessão e tolerância visual, avatares saem e estações apagam. A sala fica inativa, preservando posição, histórico e marcadores de incidente. O data center continua coletando enquanto o serviço local estiver em execução. Fechar a janela Unity não deve interromper silenciosamente uma coleta configurada para continuar.

### 6.5 Revisar o dia

O usuário escolhe data, fuso e projetos em “Meu dia”, consulta marcos e abre o timelapse. O selo “REPLAY” fica persistente; ações de comando são desabilitadas também no backend. Ao voltar ao vivo, o cliente sincroniza com o estado atual, sem aplicar novamente efeitos históricos.

## 7. Requisitos funcionais

### 7.1 Fontes, identidade e sessões

| ID | Requisito | Aceite mínimo | Etapa |
|---|---|---|---|
| RF-01 | Descobrir sessões Claude e Codex por adaptadores versionados | Provedor, conta opaca e sessão identificados; arquivo ilegível não derruba outras fontes | M1 |
| RF-02 | Resolver projeto por ID persistente, caminho e aliases explícitos | Pastas homônimas não se fundem; Windows/WSL/worktrees só se agrupam por regra verificada ou confirmação | M1 |
| RF-03 | Distinguir workspace e sessão | Evento IDE pode preparar sala vazia; sem esse conector, detecção começa pela primeira sessão válida | M1 |
| RF-04 | Representar principais e subagentes | Duas sessões principais permanecem independentes; filho sem pai resolvido fica “Vínculo pendente” | M1 |
| RF-05 | Separar presença, execução e atualidade | Desconexão produz presença incerta/dado desatualizado; não inventa conclusão ou saída | M1 |
| RF-06 | Exibir tarefa, ferramentas, skills e origem quando observadas | Chamadas e resultados separados; skill sem encerramento conhecido não fica indefinidamente “em execução” | M1 |
| RF-07 | Exibir diagnóstico de fontes | Serviço, adaptador, hooks, coleta por arquivo e último evento aplicado têm indicadores distintos | M1 |

### 7.2 Quartel, salas e navegação

| ID | Requisito | Aceite mínimo | Etapa |
|---|---|---|---|
| RF-08 | Montar salas dinamicamente com posição estável | Reabrir projeto recupera posição disponível; sétimo projeto usa outro setor sem encolher todos | M1 |
| RF-09 | Mostrar etiquetas e resumo selecionado | Nome, Codex/Claude/ambos, agentes presentes/trabalhando, estado e atividade; “Entrar na sala” | M1 |
| RF-10 | Mostrar interior da mesma sala | Mesa/holograma, agentes, estações, árvore lateral, tarefa e feed; breadcrumb e retorno | M1 |
| RF-11 | Oferecer órbita, zoom, restauração e outro ângulo | Órbita horizontal completa sem perder acesso ao alvo; gestos sobre UI não movem câmera | M0 |
| RF-12 | Encerrar presença visual sem perder operação | Última sessão apaga estações; histórico/infraestrutura/alertas continuam consultáveis | M1 |
| RF-13 | Buscar e filtrar sem depender de caminhar | Projeto, agente, provedor, estado e ambiente disponíveis em navegação direta | M1/M2 |

### 7.3 Data center e incidentes

| ID | Requisito | Aceite mínimo | Etapa |
|---|---|---|---|
| RF-14 | Manter data center compartilhado permanente | Sem sessões, recursos continuam visíveis e monitorados enquanto coletor está ativo | M2 |
| RF-15 | Vincular recursos e projetos por ambiente | Relação muitos-para-muitos; recursos sem vínculo visíveis; homologação não contamina produção | M2 |
| RF-16 | Monitorar host, Docker e APIs | Estados, atualização e indicadores disponíveis; contêiner rodando não implica aplicação saudável | M2 |
| RF-17 | Monitorar banco com conector específico | Conexões, consultas, bloqueios/capacidade quando suportados; sem executar SQL administrativo | M2 |
| RF-18 | Acompanhar sinais de rede | Destinos configurados e métricas disponíveis; não presumir acesso a todo tráfego da rede | M5 |
| RF-19 | Pesquisar logs e consultar rastros | Filtro por intervalo/projeto/ambiente/recurso, paginação e redação; vínculos externos respeitam acesso | M5 |
| RF-20 | Mostrar detecções de segurança | Fonte, horário, evidência, severidade e classificação; tráfego alto sozinho não é ataque | M5 |
| RF-21 | Correlacionar incidentes e dependências | Um incidente compartilhado tem uma identidade; salas exibem seu impacto e referência | M2 |
| RF-22 | Separar reconhecimento e resolução | Reconhecer não resolve; recuperação exige evidência; alerta visual pode silenciar sem apagar incidente | M2 |
| RF-23 | Navegar sala ↔ recurso ↔ incidente | Contexto do projeto/ambiente preservado, opção explícita para ver todos os dependentes | M2 |

### 7.4 GitHub, histórico e experiência lúdica

| ID | Requisito | Aceite mínimo | Etapa |
|---|---|---|---|
| RF-24 | Reconhecer GitHub com proveniência | Sinais do transcript identificados como tal; conector independente detecta eventos fora dos agentes | M1/M3 |
| RF-25 | Celebrar marcos confirmados | PR mergeado/release confirmada geram efeito breve; push e agendamento de merge não equivalem a entrega | M3 |
| RF-26 | Correlacionar CI | Repositório, workflow, ref, SHA e execução preservados; verde alheio não apaga falha | M3 |
| RF-27 | Produzir Meu dia determinístico | Projetos, marcos, espera, horas-agente, tokens/custo disponíveis, incidentes e cobertura | M3 |
| RF-28 | Reproduzir timelapse | Pausa, busca temporal, 1×/60×/180×/600×, filtro, retorno ao vivo; marcos e efeitos presentes | M3 |
| RF-29 | Separar simulação da operação | Café, caminhada e gestos não entram no feed como ações reais nem alteram tarefas | M1 |
| RF-30 | Permitir reduzir efeitos e som | Nenhum alerta depende só de áudio/cor; festas não bloqueiam leitura/interação | M1/M3 |

### 7.5 Interação, configuração e operação local

| ID | Requisito | Aceite mínimo | Etapa |
|---|---|---|---|
| RF-31 | Descobrir capacidades por sessão | Botões explicam ausência do suporte; backend revalida capacidade e alvo no envio | M4 |
| RF-32 | Enviar mensagens com resultado correlacionado | Distinguir aceita, submetida, confirmação disponível e resultado desconhecido; não reenviar timeout automaticamente | M4 |
| RF-33 | Tratar permissões e perguntas | Pedido original, destino e prazo visíveis; sem autoaprovação; retorno ao fluxo nativo quando integração falha | M4 |
| RF-34 | Configurar fontes e escopos | Ativação explícita, teste de conexão, capacidades, pastas/recursos permitidos e revogação | M1/M2 |
| RF-35 | Preservar estado em reinício | Identidades, posições, marcos, incidentes e cursores persistidos; presença é reconciliada, não presumida | M1 |
| RF-36 | Isolar demonstração e replay | Selo persistente e domínio de dados separado; comandos reais rejeitados nesses modos | M0/M3 |
| RF-37 | Oferecer diagnósticos exportáveis | Versões, saúde e falhas sanitizadas; prompts, tokens de acesso e conteúdo sensível excluídos por padrão | M1 |
| RF-38 | Gerir histórico e privacidade | Retenção visível, exclusão/exportação explícitas, consentimento para conteúdo detalhado e trilha de comandos | M3/M4 |

## 8. Catálogo de informações de infraestrutura

| Domínio | Indicadores possíveis | Fonte e limite |
|---|---|---|
| Rede | Disponibilidade, latência, perda, throughput, DNS e TLS | Sondas/telemetria configuradas; definir unidade, janela e destino; perda exige medição compatível |
| Servidores | CPU, RAM, disco, serviços, uptime/reinícios | Coletor do host ou plataforma; host remoto requer conector próprio |
| Docker | Inventário, estado, healthcheck, reinícios, consumo e eventos | API/coletor do daemon; ausência de healthcheck é “Não verificado” |
| APIs | Disponibilidade, taxa de erros, p50/p95, volume, dependências | Sondas e instrumentação; baixa amostragem identificada; timeout da sonda não prova causa |
| Bancos | Conexões, consultas lentas, bloqueios, tamanho, replicação/backup | Cada banco tem capacidades próprias; backup só aparece saudável com evidência de sua rotina |
| Logs/rastros | Ocorrências, severidade, traceId, erro e contexto permitido | Backend de observabilidade; conteúdo paginado e sujeito a acesso/redação |
| Segurança | Autenticação suspeita, tentativas bloqueadas, alertas WAF/IDS/firewall | Conectores de detecção; não promete prevenção nem investigação forense completa |

Cada indicador apresenta valor, unidade, janela, origem, instante e atualidade. Métricas agregadas não combinam unidades, ambientes ou janelas incompatíveis. Ausência de tráfego não prova disponibilidade; sem cobertura suficiente não exibir “100% saudável”.

## 9. Estados e regras de negócio

### 9.1 Projeto e sala

Presença: `preparado`, `presente`, `incerto`, `inativo`. Trabalho: `trabalhando`, `aguardando`, `ocioso`, `desconhecido`. Atenção é um marcador separado para decisões/falhas; saúde de infraestrutura é outra dimensão.

Se a etiqueta precisar de um único destaque, usar: intervenção pendente → falha relevante → trabalhando → aguardando → inativo. Mostrar indicador de dados desatualizados independentemente dessa ordem. Contagem de “agentes ativos” significa presença confirmada, com contagem de “trabalhando” separada; presença incerta fica indicada à parte.

O desligamento visual usa tolerância proposta de 20 s após todas as sessões serem confirmadas encerradas/ausentes pelo adaptador. Esse prazo não substitui os critérios da fonte. Perder conectividade não inicia automaticamente a desmontagem. Inatividade não libera a posição por surpresa; ocultar/arquivar é ação explícita e incidente aberto permanece na navegação.

### 9.2 Agentes, tarefas e ferramentas

Relações pai/filho usam IDs de origem. Um principal não passa a comandar outro por estar no mesmo projeto. Função/nome só aparecem como fatos se fornecidos; apelido local deve ser identificado como personalização.

Uma tarefa tem estado observado e origem. Chamada de ferramenta não confirma sucesso; lista de tarefas declarada pelo agente não prova entrega aceita. Invocação de skill pode ser exibida como “invocação observada”; sem protocolo de término, não inventar duração. Falha de ferramenta, falha de CI e indisponibilidade de serviço são tipos distintos.

### 9.3 Infraestrutura e incidentes

Saúde: `saudável`, `degradado`, `indisponível`, `desconhecido`. Atualidade: `recente`, `atrasada`, `sem dados`. Incidente: `aberto`, `reconhecido`, `em investigação`, `resolvido`; supressão e silenciamento são flags com prazo e motivo, não resolução.

Regras precisam de limiar, duração, janela de recuperação, escopo e versão. Não incluir limiares universais de CPU/latência/banco sem calibração. No laboratório, usar limiares de teste identificados. Alterar uma regra não reescreve silenciosamente o histórico.

Segurança distingue `tentativa bloqueada`, `detecção suspeita` e `incidente confirmado`. A severidade vem da fonte ou regra identificada. O usuário pode registrar avaliação com autoria; isso não vira conclusão automática do detector.

### 9.4 GitHub

Deduplicar por provedor/repositório/entidade/transição. CI tem estado por execução e tentativa. Uma nova execução verde pode substituir o sinal da falha da mesma linha de trabalho se a regra explícita permitir, mantendo a falha anterior no histórico; uma execução verde de outro workflow/ref não resolve nada.

Festa de merge proposta: 8 s, configurável e sem som por padrão. Eventos antigos no carregamento inicial entram no histórico sem festa retroativa. Falha de CI aciona giroflex breve e marcador persistente. O fim do efeito não encerra o alerta. Um sinal verde de outro serviço não encerra o alerta de CI afetado.

### 9.5 Meu dia e replay

Horas-agente são a soma dos intervalos trabalhados pelos agentes; dois agentes por uma hora resultam em duas horas-agente. Tempo de espera do quartel usa união dos intervalos, não soma cega. Não rotular nenhum dos dois como produtividade humana.

Custos só aparecem quando observados ou estimados por regra explícita, com moeda/fonte. Tokens não equivalem ao preço pago de uma assinatura. Períodos sem coleta são lacunas. Um dia usa o fuso escolhido, inicialmente America/Sao_Paulo; timestamps são armazenados em UTC. Mudança de fuso recalcula limites do relatório, não os eventos.

Replay reconstrói o estado e os marcos registrados. Não promete vídeo original nem animação física idêntica em todo hardware. Deve guardar versão de cena e parâmetros/seed dos efeitos para consistência possível. Exportar MP4 é outra funcionalidade.

## 10. Dados, privacidade e operação

Operação local por padrão. A Unity não lê credenciais, arquivos de sessão ou sockets administrativos diretamente. O serviço local controla coleta, acesso, normalização e histórico. O frontend não escolhe comando arbitrário de shell para executar.

Fontes selecionadas são habilitadas pelo usuário. Não instalar hooks globalmente nem sobrescrever configurações existentes sem fluxo explícito e reversível. Registrar quais integrações foram instaladas pelo produto e permitir removê-las. Uma rotina de observação não recebe automaticamente poder de aprovar ferramentas.

Guardar metadados normalizados, identificadores e referências de evidência. Transcripts completos e logs volumosos não são copiados integralmente por padrão. Segredos, cookies, tokens, strings de conexão e conteúdo sensível devem ser redigidos antes de persistir/exibir/exportar. Referências de evidência devem ser novamente autorizadas ao abrir.

Retenção inicial aprovada pelo PI em 07/11/2026: eventos/snapshots de replay por 7 dias; agregados de Meu dia por 90 dias; trilha de comandos por 90 dias; incidentes abertos preservados e incidentes resolvidos por 90 dias. Conteúdo bruto segue a política da fonte. Permitir diminuir retenção e excluir dados explicitamente. A expiração de evidência deve ficar visível, sem deixar link aparentemente válido. A implementação e as provas de exclusão física permanecem registradas por etapa; a aprovação da política não equivale à conclusão técnica da retenção.

Orçamento local inicial proposto: 2 GB para histórico, excluindo arte. Ao atingir 80%, avisar; a 95%, compactar/remover apenas itens expirados. Sem espaço recuperável, sinalizar gravação interrompida e manter observação em memória limitada; não dizer que o histórico está completo. Comandos que exigem auditoria persistente ficam indisponíveis durante essa falha.

Fechar a janela: coleta pode continuar em processo local gerenciado, com indicador e opção “Encerrar também a coleta”. Sair completamente torna o intervalo uma lacuna. Não instalar serviço elevado ou inicialização automática sem escolha do usuário.

## 11. Requisitos não funcionais e metas propostas

As metas abaixo são critérios de ensaio, não resultados medidos. Registrar hardware e versão do build no aceite. Baseline de ensaio sugerida: Windows 11 x64, CPU de 6 núcleos, 16 GB RAM, GPU com 6 GB VRAM e SSD; isso não é requisito mínimo de produto publicado.

| ID | Área | Meta / condição de verificação |
|---|---|---|
| RNF-01 | Latência local | p95 ≤ 2 s entre evento aceito pelo serviço e HUD atualizado, em 10 eventos/s; atraso da fonte medido separadamente |
| RNF-02 | Renderização | Meta 60 FPS em 1080p; modo reduzido ≥ 30 FPS no baseline, medidos por frame time p95 em ensaio de 10 min |
| RNF-03 | Carga de referência | 30 projetos cadastrados, 6 salas visíveis, 50 agentes presentes, 200 recursos; rajada de 100 eventos/s por 10 s sem perda silenciosa |
| RNF-04 | Recuperação | Reinício/reconexão recupera snapshot e sequência; lacunas exigem ressincronização; nenhuma ação é reenviada por efeito visual |
| RNF-05 | Recursos locais | Metas de ensaio: cliente ≤ 2 GB RAM, serviço ≤ 512 MB RAM e CPU ociosa do serviço ≤ 2% médio no baseline |
| RNF-06 | Legibilidade | Referência 1920×1080; validar 1440×900, escala Windows 100/125/150%, texto essencial ≥ 14 px lógicos e foco visível |
| RNF-07 | Acessibilidade | Ações principais via teclado/lista; texto/ícone junto da cor, reduzir movimento, desligar som, sem flashes de alarme obrigatórios |
| RNF-08 | Isolamento | Evento sem contexto não altera sala arbitrária; demonstração, replay e operação real separados |
| RNF-09 | Compatibilidade | Fixture e teste por versão de adaptador; fonte desconhecida degrada para observação limitada, não interpretação silenciosa |
| RNF-10 | Transparência | Build informa versão do cliente/serviço/contrato, conectores habilitados, cobertura e última observação |

Estouro de fila/memória gera diagnóstico e ressincronização, não travamento prolongado ou descarte invisível de decisões. Logs podem ser paginados/amostrados com indicação; incidentes e decisões não são tratados como animações descartáveis.

## 12. Métricas de sucesso

- Em teste guiado, localizar projeto que pede intervenção e identificar agente/motivo em até 10 s.
- Acessar o recurso afetado a partir da sala em até duas ações após a seleção do projeto.
- Zero ocorrências nos testes de evento atribuído ao projeto/ambiente errado, comando no replay ou “saudável” causado apenas por perda de coleta.
- Reconstruir os marcos de um roteiro de trabalho e incidente após reinício, com lacunas explícitas.
- Medir taxa de conectores válidos, tempo até primeiro evento, atraso por fonte e reconexões; não usar quantidade de tokens como sucesso de produto.

Métricas de uso são locais por padrão. Qualquer telemetria externa do produto é opt-in, documentada e separada dos conectores solicitados pelo usuário.

## 13. Cenários de aceite integrados

| Cenário | Evidência exigida | Requisitos |
|---|---|---|
| Dois projetos com mesmo nome em diretórios distintos | Duas identidades/salas, sem eventos cruzados | RF-02, RF-08 |
| Claude e Codex no mesmo projeto | Dois principais e árvore real de cada um | RF-01, RF-04 |
| Workspace aberto sem agente | Sala preparada sem avatar inventado | RF-03, RF-09 |
| Subagente chega antes do pai | Vínculo pendente e resolução posterior, sem pai fictício | RF-04 |
| Fonte desconecta durante tarefa | Dado desatualizado, sem conclusão ou saída falsa | RF-05, RF-07 |
| Última sessão encerra com API em produção | Estações apagam, API e incidente seguem monitorados | RF-12, RF-14 |
| Banco compartilhado em falha | Um incidente, projetos dependentes corretos e impacto potencial distinguido | RF-15, RF-21 |
| Banco de homologação falha | Produção não herda falha | RF-15 |
| Coletor Docker perde acesso | Recursos sem dados recentes; “running” antigo não é saúde atual | RF-16 |
| CI vermelho A e verde B em outro workflow | Falha A persiste | RF-26 |
| Merge chega via API e transcript | Um marco e uma celebração | RF-24, RF-25 |
| Mensagem expira sem confirmação | Estado desconhecido/expirado; sem reenvio automático | RF-32 |
| Permissão expira durante clique | Backend rejeita decisão tardia e mantém evidência | RF-33 |
| Replay contém pedido histórico | Nenhuma rota de comando aceita o pedido | RF-28, RF-36 |
| Dois agentes trabalham uma hora | Duas horas-agente e uma hora decorrida, sem rótulo de produtividade | RF-27 |
| Disco cheio ou fonte fora por uma hora | Lacuna de histórico/cobertura visível | RF-35, RF-38 |
| Órbita completa com painel central | Alvo visível por tratamento de oclusão; UI bloqueia gestos de câmera | RF-11 |

## 14. Fora do escopo inicial e limites

Não construir um IDE, plataforma de CI, substituto completo de observabilidade/SIEM, motor de execução de LLM, marketplace ou sistema de produtividade de funcionários. Não prometer detecção universal de ataques. Não interpretar pensamento interno de modelos. Não incluir uma cidade online no produto inicial.

PTY/takeover, criar novas sessões, interromper agentes, executar SQL, reiniciar containers, bloquear IP e implantar código exigem escopos próprios posteriores. O fato de uma ferramenta de referência permitir uma ação não a inclui automaticamente na primeira versão.

## 15. Riscos e decisões antes de executar cada etapa

| Risco / lacuna concreta | Tratamento / responsável | Momento |
|---|---|---|
| GLB monolítico e deformado de perto | Ensaio de uma sala, rack e painel; comparar recuperação com remodelagem — arte/engenharia | M0 |
| Mudanças em formatos Claude/Codex | Adaptadores versionados, fixtures e matriz de compatibilidade — engenharia | M1 e atualizações |
| Caminhos Windows/WSL e worktrees | Regras explícitas e teste de colisão; usuário confirma aliases ambíguos | M1 |
| Inventário de infraestrutura desconhecido | Rodrigo indica hosts, bancos, ambientes e fontes existentes; equipe seleciona um laboratório | Antes dos conectores M2 |
| Credenciais de monitoração | Configuração fora do repositório e escopo mínimo; sem coletar segredos na documentação | Ativação de cada conector |
| Mensagens/permissões Codex no Windows | Testes reais controlados por capacidade; não considerar testes ignorados como aprovados | M4 |
| Alto custo visual | LOD, geometria modular, sombras/efeitos ajustáveis, medição no baseline | M0/M1 |
| Logs sensíveis e dados compartilhados | Redação, autorização e retenção; cidade externa separada | M3/M5 |
| Dependência de fonte externa de sessões | Contrato próprio e adaptadores substituíveis; revisar licença e direitos antes de qualquer reaproveitamento | M1 |

Não há orçamento, prazo comercial ou modelo de cobrança definidos nesta versão. Planejamento não deve inventá-los. Hardware mínimo publicado e patches finais das dependências serão fixados a partir dos ensaios, mantendo os padrões de referência do GDD.

## 16. Evidências e documentos relacionados

- [GDD: concepção, tecnologia e experiência](GDD.md).
- [Planos de implementação M0–M5](README.md#war-room3d).
- [Habblaud](https://habblaud.com/) é referência pública de experiência; sua implementação e seus ativos não fazem parte deste repositório.
- Os GLBs, renders e relatórios de inspeção permanecem no workspace local até revisão específica de direitos e conteúdo. Eles não demonstram órbita Unity nem integração ao vivo.

## 17. Revisão e passagem ao planejamento

A direção e esta consolidação foram aprovadas em 06/11/2026. Cada etapa recebe especificação técnica e plano verificável, começando por [M0](docs/superpowers/plans/2026-11-06-m0-fundacao-visual.md). Metas de escala, retenção e desempenho continuam sujeitas a medição e revisão técnica; não iniciar todos os subsistemas em uma única mudança.

O diretório não possui repositório Git na data desta entrega. Os documentos são arquivos locais revisáveis, sem commit, push ou publicação alegados.
