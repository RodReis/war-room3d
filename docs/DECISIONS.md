# Decisões arquiteturais

Este registro distingue decisões de produto aprovadas de hipóteses técnicas ainda sujeitas a ensaio. Para mudar uma decisão, acrescentar entrada com contexto, alternativas, consequência, data e responsável; não reescrever silenciosamente o histórico.

## ADR-001 — Unity separada da coleta

- **Estado:** aprovado no PRD/GDD em 06/11/2026.
- **Contexto:** a cena precisa de apresentação responsiva e múltiplas fontes têm formatos e permissões diferentes.
- **Decisão:** Unity consome contrato versionado de um serviço local; não lê transcrições nem credenciais diretamente.
- **Alternativas:** parsing dentro da Unity; cliente web como aplicação principal.
- **Consequência:** dois processos e contrato sincronizado; testes de compatibilidade são obrigatórios.

## ADR-002 — salas modulares e GLB como referência

- **Estado:** aprovado como direção; prova de arte em M0.
- **Decisão:** construir salas selecionáveis e avatares como objetos independentes. O GLB v2 local é ensaiado como referência/derivado, condicionado a direitos e desempenho.
- **Consequência:** há trabalho de modelagem; não tratar a malha monolítica como seis salas prontas.

## ADR-003 — serviço local e persistência

- **Estado:** baseline proposto, sujeito ao ensaio M1.
- **Decisão:** Node.js 24/TypeScript, SQLite local em WAL com escritor único, HTTP/JSON e SSE.
- **Alternativas:** tudo em C#; banco remoto obrigatório; Socket.IO como contrato universal.
- **Consequência:** testar driver nativo Windows, reinício, cursor e empacotamento antes de congelar versões.

## ADR-004 — verdade operacional

- **Estado:** princípio aprovado.
- **Decisão:** separar observado, inferido, declarado pelo usuário e ilustrativo; demo/replay isolados; dados ausentes não viram estado saudável.
- **Consequência:** UI deve mostrar origem, horário, cobertura e limites de cada sinal.

## ADR-005 — retenção inicial M3

- **Estado:** política de produto aprovada pelo PI em 07/11/2026; exclusão física pendente de estado base e prova de reconstrução.
- **Decisão:** replay detalhado disponível por 7 dias; agregados de Meu dia e incidentes resolvidos por 90 dias; incidentes abertos preservados. Evidência expirada recebe aviso explícito.
- **Contexto:** apagar diretamente eventos M1 ou marcos CI antigos quebraria sessões abertas e incidentes que atravessam o corte. A PR #23 aplica os limites de consulta, oculta detalhes antigos de Meu dia e apaga apenas efeitos, incidentes resolvidos e tentativas de poll expirados; a limpeza restante exige compactação verificável.
- **Consequência:** dados antigos continuam no SQLite até a rotina de compactação; não afirmar retenção física de 7/90 dias nem privacidade concluída nesta fatia.

## Pendências técnicas

Versões finais dos pacotes, direitos dos GLBs, driver SQLite, backend de observabilidade real, fonte de segurança e política de empacotamento dependem das provas das respectivas etapas. Registrar cada decisão antes de implementá-la como padrão duradouro.

## ADR-006 — uma sala completa e aceita no Player antes de replicar

- **Estado:** direção de produto autorizada pelo PI em 08/11/2026; implementação planejada na [#28](https://github.com/RodReis/war-room3d/issues/28), sem aceite do resultado.
- **Contexto:** a cena permaneceu em primitivas e a UI acumula detalhes/formulários; avanço técnico e fechamento de issues não aproximaram a experiência do conceito.
- **Decisão:** concluir uma sala Unity com design rico, detalhe de qualidade, luz e cores vivas, HUD contextual e jornada hooks/agentes/skills/chats/logs. Revisar arte cedo no Player e validar o mesmo build final antes de replicar o acabamento.
- **Alternativas:** polir apenas HUD preserva o desvio artístico; reconstruir seis salas de uma vez multiplica retrabalho. A sala de referência reduz essa incerteza sem retirar o escopo do produto.
- **Consequência:** #29–#35 possuem provas próprias e G1–G4; fixtures não substituem observação/chat/logs reais, obrigatório fail/not_run bloqueia o gate salvo decisão explícita do PI. A #16 conserva RNF-02. Não reabrir issues antigas nem alterar seus aceites por esta decisão.
- **Referência:** [especificação](specs/2026-11-08-sala-referencia-design.md) e [plano](superpowers/plans/2026-11-08-sala-referencia-player.md). Nenhuma autorização adicional de hooks, contas ou infraestrutura real decorre da publicação.
