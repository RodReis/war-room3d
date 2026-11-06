# Política de CI para pull requests

## Estado atual

Não há workflow de CI versionado neste checkout documental. Portanto, ainda não existe job obrigatório nem medição de duração de PR. A criação do pipeline faz parte da implementação das etapas, começando pelo contrato e projeto Unity de M0.

## Desenho proposto

Separar verificações independentes quando existirem: qualidade/typecheck do serviço, contratos, testes do serviço, testes Unity EditMode e build Windows/PlayMode quando aplicável. Um gate agregado só resume resultados dos jobs obrigatórios; não reexecuta a suíte. Não criar job de banco ou E2E fictício enquanto o respectivo subsistema não existir.

Cada job registra comando, versão, duração e artefatos necessários para reproduzir falhas. Só marcar PASS após sucesso real no SHA da PR. Falha de runner/infra é falha ou indisponibilidade, não aprovação. Ausência de alvo externo é `not_run` com justificativa. A verificação de PR deve considerar regras de branch atuais e checks exigidos pelo GitHub.

## Desempenho e mudanças

Medir baseline antes de impor orçamento de tempo; investigar PRs lentos por job e causa. Paralelização e cache só são aceitos se preservarem a prova. Não usar `[skip ci]`, excluir teste ou reaproveitar PASS de outro SHA para acelerar merge. Mudanças em workflow exigem self-check e evidência de que o gate continua observando os jobs pretendidos.
