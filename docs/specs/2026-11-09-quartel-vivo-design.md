# Quartel vivo no Player — dois projetos e uma fonte real

Data da decisão: 09/11/2026. Escopo de produto aprovado pelo PI. [Épico #46](https://github.com/RodReis/war-room3d/issues/46) · [Plano de execução](../superpowers/plans/2026-11-09-quartel-vivo-player.md).

## Problema a corrigir

A #28/#35 aprovou uma sala em um Player identificado e com prova operacional pontual. O relato posterior mostra que a vista de entrada ainda exige selecionar uma sala para entender seu estado, o selo do serviço local pode acompanhar dados sintéticos, os agentes não são reconhecíveis de relance e os monitores não comunicam atividade real entre projetos. O [relatório anterior](../validation/sala-referencia/resultado.md) permanece como histórico do build aceito.

## Primeira entrega

O Unity Player Windows abre no quartel com **dois projetos ativos, independentes e autorizados**, observados pela mesma integração real. Por decisão do PI em 10/11/2026, a primeira fonte passou do plugin Codex no VS Code em `rrb-forjaOS`, cujo ensaio não produziu evento, para o **Claude Code no VS Code local Windows** em `arenahub`. Uma sessão real desta fonte chegou ao serviço, ainda sem prova no Player nem segundo projeto. A CLI, o app separado e a fixture não provam origem na extensão. [Claude Code Desktop fica para a #59](https://github.com/RodReis/war-room3d/issues/59).

### Vista geral e referência visual

Usar a prancha conceitual já apresentada ao PI como referência de enquadramento e acabamento. Vista isométrica com leitura das salas e corredores, arquitetura com volumes e recortes, piso e mobiliário reconhecíveis, luz de ambiente e tarefa, materiais grafite, acentos ciano/verde e pontos quentes. Reservar posição para cafeteria e sala de reunião sem exigir interiores desses espaços no primeiro Player.

A tela inicial tem cabeçalho curto com modo, estado do serviço e saúde da fonte, cartões ligados espacialmente às salas, e um gráfico compacto de atividade por projeto. O cartão traz nome, estado, agentes trabalhando, alerta quando houver e último sinal. A leitura dos dois projetos independe de clique, rolagem ou abertura de modal. Detalhes ficam recolhidos por padrão. Clique na sala ou no cartão abre o mesmo projeto. Voltar recupera vista e seleção. Em outros setores a busca continua alcançando todos os projetos ativos.

### Vida das salas

- A presença do projeto nasce de vínculo observado com um workspace aberto ou sessão ativa em uma fonte autorizada. Estar aberto e estar trabalhando são fatos distintos.
- Usar identidade canônica e vínculos explícitos. Dois diretórios homônimos não se fundem. Várias fontes podem apontar para a mesma sala; eventos sem identidade compartilhada não são fundidos só por horário ou texto.
- Encerramento explícito do último vínculo ativo desativa a sala operacional. O cadastro conserva ID, posição e histórico para reentrada. Perda de fonte, timeout e ausência de sinal mostram incerteza, sem declarar encerramento.
- Manter o limite existente de seis posições dinâmicas por setor. A cafeteria, a sala de reunião do PI e o data center têm identificadores e posições fixos, separados das vagas de projeto. No passo de expansão, a cafeteria e a sala de reunião ficam disponíveis com zero ou vários projetos; o lugar do PI fica identificado sem alegar que ele está presente.

### Agentes reconhecíveis

Apresentar personagens humanos estilizados, homens e mulheres, com opções de silhueta, roupa e acessórios que diferenciem indivíduos, inclusive dentro do mesmo conjunto. Atribuição visual é estável e configurável, independente de inferência sobre gênero ou identidade da pessoa. Usar nome exposto pela fonte ou apelido local; mostrar a origem do rótulo no detalhe. Preservar preferência local e vínculo com o mesmo agente após reinício.

Entrada e deslocamento curto até estação, postura e gestos de trabalho/espera devem ser perceptíveis no Player. Presença, trabalho, espera, falha e incerteza obedecem ao sinal normalizado. Modo reduzido conserva rótulos, cores, ícones e estado sem exigir deslocamento. Clique no avatar ou item da lista abre a mesma atividade, ferramenta, skill, chat e logs conforme cobertura. Campo sem evidência tem estado explícito.

### Gráfico de atividade

Padrão inicial: eventos operacionais observados por projeto a cada cinco minutos na última hora. O gráfico mostra unidade, período, última atualização e legenda legível sem depender só da cor. O histórico contém ocorrências deduplicadas de eventos normalizados, com timestamp da fonte; heartbeat, replay e fixtures ficam fora da série real. Uma ação pode gerar mais de um evento, portanto a unidade é **eventos observados**, sem equivalência com tarefas entregues ou produtividade.

Zero significa cobertura confirmada sem eventos naquele intervalo. Quando a cobertura é desconhecida, parcial ou desatualizada, mostrar lacuna ou cobertura parcial identificada. Backfill pode corrigir a série histórica sem renovar frescor. Selecionar intervalo e projeto leva a eventos e proveniência correspondentes.

### Fonte, privacidade e erros

Distinguir serviço acessível, fonte configurada, evento recebido, evento aplicado e dado recente; demo, replay e dados reais têm identificação própria. O indicador de fonte se apoia em evidência recente, além da disponibilidade do transporte. Coleta é local, opt-in por projeto e reversível. Na primeira fonte, trabalhar com metadados mínimos, sem coletar conteúdo de prompts, chats, transcrições, logs ou credenciais por padrão. Ativação de hooks e acesso a sessões/projetos reais exigem autorização específica; este planejamento não concede essa autorização.

## Aceite no Player

1. No mesmo build Windows, identificar sem interação os dois projetos, estado, quem está trabalhando, alertas e último sinal. Comparar vista geral e interiores com o conceito original em 1920×1080, 1440×900 e 1366×768, além da matriz de escala aplicável.
2. Mostrar homens e mulheres com roupas diferentes e nomes legíveis. O vídeo demonstra deslocamento e estados. Uma ação real em apenas um projeto atualiza seu cartão, avatar e gráfico sem recarga. O segundo projeto preserva identidade e contagem.
3. Demonstrar intervalo coberto sem eventos, perda de fonte, incerteza e recuperação após reiniciar Player e serviço. O gráfico mostra a lacuna e a sala recupera posição sem duplicar eventos ou ocupantes. Confirmar origem e versão, hash do build, medições RNF-01/02 e revisão de registros sanitizados.
4. Registrar a decisão do PI sobre o Player e seus limites. Build e testes sustentam o aceite técnico. A revisão no Player é o critério de liberação para replicar o acabamento.

## Expansão após a primeira entrega

Abrir a cafeteria e a sala de reunião do PI. Integrar a **descoberta de workspaces do VS Code**, **Claude Code Desktop** e **Codex Desktop** em provas independentes no Windows e provar que a mesma identidade de projeto reaproveita a sala em várias fontes. A descoberta de workspace no VS Code deve ser separada da sessão do plugin Codex e do agente do Chat. Codex Desktop e Claude Code Desktop devem provar origem no próprio aplicativo e capacidades da versão instalada. Sessão em nuvem, leitura de chat e capacidade de envio requerem evidência e autorização próprias.
