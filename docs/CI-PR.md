# Política de CI para pull requests

## Estado atual

A PR #23 introduz `.github/workflows/ci.yml` com jobs de contratos e serviço em Node.js 24 para `pull_request` e `push` em `main`. Conferir resultado e duração no SHA remoto antes de declarar CI verde. Unity EditMode, PlayMode e build Windows continuam provas locais até existir runner/licença apropriados; não são checks de CI. Ainda não há job obrigatório configurado na proteção da branch.

Primeira medição: [run 42328279199](https://github.com/RodReis/war-room3d/actions/runs/42328279199) no SHA `137e415784fa15d4c97a477ead329446b7080e20` — Contratos 5 s e Serviço 11 s, ambos `success`. Esta medição não substitui a checagem do HEAD após novos commits.

## Desenho proposto

Separar verificações independentes quando existirem: qualidade/typecheck do serviço, contratos, testes do serviço, testes Unity EditMode e build Windows/PlayMode quando aplicável. Um gate agregado só resume resultados dos jobs obrigatórios; não reexecuta a suíte. Não criar job de banco ou E2E fictício enquanto o respectivo subsistema não existir.

Cada job registra comando, versão, duração e artefatos necessários para reproduzir falhas. Só marcar PASS após sucesso real no SHA da PR. Falha de runner/infra é falha ou indisponibilidade, não aprovação. Ausência de alvo externo é `not_run` com justificativa. A verificação de PR deve considerar regras de branch atuais e checks exigidos pelo GitHub.

## Desempenho e mudanças

Medir baseline antes de impor orçamento de tempo; investigar PRs lentos por job e causa. Paralelização e cache só são aceitos se preservarem a prova. Não usar `[skip ci]`, excluir teste ou reaproveitar PASS de outro SHA para acelerar merge. Mudanças em workflow exigem self-check e evidência de que o gate continua observando os jobs pretendidos.
