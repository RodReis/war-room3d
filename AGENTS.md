# AGENTS.md — War-Room3D

## Fonte de verdade e estado atual

O [PRD](PRD.md) define o produto, o [GDD](GDD.md) define a experiência e a arquitetura proposta, e os [planos M0–M5](README.md) organizam a execução. As issues [#1–#6](https://github.com/RodReis/war-room3d/issues) representam essas etapas. Neste momento, o repositório público contém documentos e planos; projeto Unity, serviço, Compose e CI ainda dependem de implementação. Não apresentar proposta ou fixture como funcionalidade entregue.

Idioma: documentação, issues, PRs, commits e comunicação em português do Brasil; identificadores de código em inglês; interface em português do Brasil.

## Papéis e autoridade

- **PI — Rodrigo Reis:** decide escopo, prioridade, trade-offs e aceite funcional. Pode executar qualquer etapa se quiser; agentes não devem transferir a ele tarefas operacionais que conseguem realizar.
- **Planejamento:** detalha fatias, registra dúvidas que alteram produto e mantém PRD/GDD, planos e issues coerentes. Dúvidas de produto sem resposta ficam explícitas; não inventar regra para destravar uma implementação.
- **Implementação:** executa o card autorizado, testa, revisa, documenta e entrega PR. Pode corrigir inconsistências técnicas reversíveis sem pedir nova aprovação. Mudança de escopo ou regra de produto precisa de decisão do PI.

Não existe exclusividade permanente entre ferramentas ou agentes. A atribuição de uma tarefa vem da instrução atual do usuário e da issue, não de um rótulo como “Cowork” ou “Code”. A aprovação do PRD/GDD e a criação das issues não autorizam instalação de hooks, envio de comandos a agentes nem acesso a infraestrutura real.

## Fluxo de trabalho

1. Confirmar issue, PRD/GDD, plano da etapa, branch, diff local e HEAD remoto. Preservar mudanças alheias e fazer stage seletivo.
2. Escrever uma fatia testável por PR, com escopo e critério de aceite claros. Se a issue M0–M5 for grande, criar sub-issues somente quando a divisão e a capacidade do GitHub estiverem verificadas; não presumir board, labels ou milestones existentes.
3. Implementar e validar as provas aplicáveis de [TESTING](docs/TESTING.md). `not_run` e falha não são `pass`; distinguir Editor, build Windows e integração real.
4. Revisar o diff completo, publicar PR com `refs #N`, objetivo, alterações, validação e limites. Verificar checks no HEAD atual. Corrigir falhas no mesmo PR quando relacionadas ao escopo.
5. Fazer merge somente com a autorização aplicável e critérios de proteção da branch satisfeitos. Confirmar `mergedAt`/SHA remoto antes de registrar integração.
6. Registrar resumo, aprendizado verificável e imprevistos na issue. Estado técnico integrado e aceite funcional do PI são fatos separados. Não fechar a issue como aceita sem o PI.

Um bloqueio externo real deve ser descrito com evidência. Concluir trabalho independente, preservar branch/PR e informar o impedimento específico. Nunca contornar uma revisão automática de segurança por outro canal.

## Dados, ativos e ambiente

- Use fixtures sintéticas ou sanitizadas nos testes e na demonstração. Dados reais exigem fonte, escopo e autorização específica; não existe autorização genérica para contas, sessões, prompts, logs, banco ou ambiente de produção.
- Os GLBs, renders e relatórios locais em `docs/arte`, `docs/analise` e `docs/preview` estão ignorados pelo Git. Revisar direitos, conteúdo e tamanho antes de qualquer publicação. Não usar `git add -f` por conveniência.
- Não há `infra/docker/compose.yml` neste repositório. Se um Compose compartilhado for criado por uma etapa, registrar nome do projeto, portas, volumes e backup em [DEVELOPMENT](docs/DEVELOPMENT.md) antes de usá-lo. Nunca executar operações destrutivas sobre volumes sem validar o alvo e o backup.
- O cliente inicial é Unity desktop Windows; o serviço local proposto usa Node.js/TypeScript. Não pressupor web, mobile, Python, RLS ou banco remoto sem requisito correspondente.
- Hooks e conectores são opcionais, instalados por escopo explícito e com remoção reversível. O modo demonstração e o replay não emitem comandos reais.

## CI, testes e revisão

As categorias e evidências ficam em [TESTING](docs/TESTING.md); a política de pipeline e medição em [CI-PR](docs/CI-PR.md). Antes de existirem workflows, não declarar CI verde. Quando existirem, verificar cada job obrigatório no SHA atual e registrar duração real antes de propor otimização. Não remover cobertura ou usar `[skip ci]` para mascarar falha.

Uma revisão relata achados reproduzíveis por arquivo/linha e prioridade; critérios em [REVIEW](docs/REVIEW.md). A ausência de uma skill local não suspende o trabalho: aplicar a disciplina equivalente e registrar limites. Usar documentação oficial/Context7 para APIs e versões que possam mudar. Não afirmar que uma skill ou comando existe sem verificar.

## Documentos do projeto

| Documento | Responsabilidade |
|---|---|
| [DEVELOPMENT](docs/DEVELOPMENT.md) | Sequência de execução, ambiente e status por etapa |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Módulos, contratos, fluxo de dados e resiliência |
| [PIPELINE-ARTE-MCP](docs/PIPELINE-ARTE-MCP.md) | Ferramentas de autoria, proveniência de ativos e ensaio M0 |
| [DECISIONS](docs/DECISIONS.md) | Decisões arquiteturais e alternativas |
| [GITHUB](docs/GITHUB.md) | Branches, commits e merge |
| [PRS](docs/PRS.md) | Conteúdo da PR, revisão e métricas de fluxo |
| [CI-PR](docs/CI-PR.md) | Pipeline, gates e medição |
| [STATUS](docs/STATUS.md) | Estado atual conciso e índice etapa ↔ plano ↔ issue |
| [STATUS-ARQUIVO](docs/STATUS-ARQUIVO.md) | Histórico de mudanças de status |
| [APRENDIZADOS](docs/APRENDIZADOS.md) | Aprendizados com fonte verificável |
| [TESTING](docs/TESTING.md) | Estratégia e evidências de validação |
| [REVIEW](docs/REVIEW.md) | Critérios de revisão e gravidade |

Atualizar apenas os documentos afetados por uma entrega; não gerar status “concluído” por antecipação. Esta política não substitui o PRD, o GDD nem as instruções atuais do usuário.
