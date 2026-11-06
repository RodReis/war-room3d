# M2 — fronteira Docker de escopo mínimo

O proxy é um processo Node separado do coletor. Ele acessa o socket local do Docker Engine e expõe **somente** `GET /v1/snapshot` em `127.0.0.1`, com token Bearer de pelo menos 32 bytes. Todos os demais métodos, caminhos, parâmetros e requisições sem token são recusados. O coletor recebe nome, estado e healthcheck de contêineres; não recebe socket, IDs, labels, comandos, portas, mounts, ambiente, logs ou objeto bruto do Engine.

O proxy consulta apenas `GET /containers/json?all=1&filters=…`, com dois labels exatos: `com.docker.compose.project` e `com.docker.compose.project.working_dir`. Valida novamente esses dois campos após a resposta, limita a 32 contêineres e 1 MiB de JSON e falha fechado se houver item fora do escopo. O mesmo nome de projeto Compose foi observado em outros checkouts do laboratório; por isso o diretório é obrigatório. O Docker Engine 29 adicionou `Health` à listagem; em versões sem esse campo, o proxy devolve `none`, sem deduzir saúde de texto como `Up`.

O processo standalone usa `WR3D_DOCKER_COMPOSE_PROJECT`, `WR3D_DOCKER_COMPOSE_WORKDIR`, `WR3D_DOCKER_PROXY_PORT` e `WR3D_DOCKER_PROXY_TOKEN`, e inicia com `node src/infra/connectors/docker-proxy-main.ts` dentro de `service`. A porta aceita 1024–65535 e escuta apenas no loopback. O token deve ser aleatório, injetado fora do Git e renovado a cada início; o ensaio usou 32 bytes aleatórios em memória. O conector `dockerContainerProbe` exige essa URL de loopback, o token e um nome de contêiner explicitamente configurado. Se o proxy falha ou o contêiner não aparece uma única vez, a coleta perde cobertura. `running + healthy` vira `saudavel`; `running + unhealthy` vira `degradado`; sem healthcheck vira `sem_dados`; `exited/dead` vira `indisponivel` como estado técnico observado, sem inferir a causa da parada.

## Prova local em 06/11/2026

- Node 24: typecheck e 34/34 testes do serviço. Testes negativos cobrem falta de token (`401`), método de escrita (`405`), rota bruta do Engine (`404`), query extra (`404`), contêiner de outro checkout e endpoint externo.
- Proxy iniciado em processo separado, sem porta persistente: sem token `401`, rota bruta `404`. Uma sonda do checkout autorizado registrou `indisponivel`, cobertura atual e evidência de contêiner parado no SQLite temporário; o banco temporário e o processo foram removidos ao fim.
- Não houve `docker inspect`, leitura de variáveis de ambiente, SQL ou mudança em contêineres/volumes. O ensaio não mede p95, carga contínua ou revogação de identidade do sistema operacional.

**Limite de segurança:** o socket do daemon continua privilegiado para o processo proxy. A interface do coletor é restrita, mas o usuário Windows que iniciou ambos os processos também possui acesso direto ao daemon. Para operação contínua, executar o proxy sob identidade isolada e impedir que o serviço/Unity acessem o socket; proteger e rotacionar o token. Até essa separação ser comprovada, não anunciar o conector como acesso ao daemon intrinsecamente somente leitura.

Referências: [segurança do daemon](https://docs.docker.com/engine/security/protect-access/), [autorização por plugins e suas limitações](https://docs.docker.com/engine/extend/plugins_authorization/) e [Docker Engine 29: `Health` na listagem](https://docs.docker.com/engine/release-notes/29/).
