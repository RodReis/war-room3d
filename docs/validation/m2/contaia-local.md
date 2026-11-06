# M2 — consulta pontual ao laboratório ContaIA

Data: 06/11/2026. O PI corrigiu o alvo de laboratório para o checkout local do ContaIA e autorizou leitura e consultas. Este registro contém somente estado de saúde e origem técnica; não publica credenciais, dados de negócio nem respostas completas de serviços.

| Fonte | Consulta somente de leitura | Resultado pontual | Limite |
|---|---|---|---|
| Checkout | `AGENTS.md`, Compose versionado e rota `GET /health` da API | O Compose declara o projeto `contaia` e a rota da API retorna `service: api`, `status: ok` | Declaração e código não provam que todos os serviços estão em execução |
| Docker | Listagem por `com.docker.compose.project=contaia` e labels de origem de `contaia-workers` | O diretório e o arquivo Compose apontam para o checkout autorizado; workers e dois dublês estão `healthy`; PostgreSQL, Redis, Keycloak, MinIO e Mailpit estão `healthy` | Healthcheck do contêiner não comprova leitura SQL nem saúde das funções de negócio |
| API local | `GET /health` em loopback | HTTP `200`; o processo Node que atende a porta tem linha de execução vinculada ao checkout e à API | O contêiner `contaia-api` está `exited (127)`: a resposta veio de processo local, não desse contêiner |
| Web local | `GET /` em loopback | HTTP `200` | Liveness da página não comprova fluxo autenticado |
| Cofre local | `GET /health` em loopback | Conexão falhou | Não houve diagnóstico ou tentativa de correção do Cofre |
| Vault local | `GET /v1/sys/health` em loopback | HTTP `503`; `initialized: true`, `sealed: true` | Não houve unseal, reset, leitura de segredo ou alteração de volume |
| Sonda HTTP M2 | Chamadas pontuais de `httpProbe.collect`, sem persistência | API: `saudavel`, `http-status-200`; Vault: `degradado`, `http-status-503` | Classificação isolada; não valida agendamento, incidentes ou Player com essas fontes reais |
| Coletor e snapshot M2 | Uma coleta da API do ContaIA em `EventStore(':memory:')`, seguida de `GET /v1/snapshot` autenticado no servidor local do War-Room3D | Uma leitura coletada, nenhuma falha; snapshot HTTP `200` com zero sessões e recurso `saudavel`, cobertura `atual`, frescor `atual` | O processo encerrou ao fim; não prova coleta periódica, SSE, cena Unity nem latência sustentada |
| Impacto compartilhado M2 | Uma leitura do Vault selado com três **projetos sintéticos** em memória: dois vinculados ao recurso e um sem vínculo | Recurso `degradado`; um incidente afetou exatamente os dois projetos vinculados, com zero sessões | O grafo foi criado para o ensaio; não representa dependências reais do ContaIA |

O contêiner `contaia-signer` estava `Created` e o bootstrap do Vault, reiniciando. A porta de saúde dos workers é interna ao Docker; a listagem `healthy` não equivale a uma chamada HTTP do host. O override temporário dos workers apareceu apenas como segundo arquivo no label `config_files` do contêiner. Seu conteúdo não foi lido.

Esta consulta confirmou alvos HTTP locais autorizados em chamadas **pontuais** da sonda M2 e confirmou o caminho API real → coletor → estado em memória → snapshot autenticado, mesmo sem sessões. O 503 real do Vault gerou impacto limitado aos vínculos sintéticos do ensaio. Não houve configuração de coleta recorrente, conexão SQL, leitura de `.env`, acesso a logs/variáveis de contêiner ou execução do Player. A sonda PostgreSQL continua aguardando papel de monitoração e referência de credencial; o proxy Docker contínuo continua aguardando identidade de execução isolada. Nenhum arquivo, processo, contêiner, banco ou volume do ContaIA foi alterado.
