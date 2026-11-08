# Issue #16 — preparação da coleta Docker ContaIA

Data: 08/11/2026. Alvo indicado pelo PI: ContaIA. Escopo autorizado para futuro ensaio: metadados Docker do projeto Compose `contaia` em `C:\Desenv\Projetos\rrb-contaia\infra\docker` por dez minutos. O PI informou que fornecerá a conta Windows isolada. A resposta sobre SQL confirmou autorização, mas não identificou papel PostgreSQL, banco, referência de segredo ou permissões efetivas.

## Descoberta somente leitura no checkout ContaIA

O PI autorizou ler e consultar `C:\Desenv\Projetos\rrb-contaia`, em uso no VS Code. O checkout já continha alterações de outro trabalho e não foi modificado. O Compose foi consultado com `.env` local, projeto `contaia` e arquivo `infra/docker/compose.yml`; o contêiner `contaia-postgres` estava `healthy`. A configuração local indica banco `contaia` em `127.0.0.1:15432`. Foram lidos apenas nomes de variáveis da `.env`, sem imprimir seus valores de senha.

Uma consulta de metadados em `pg_roles`, dentro de `BEGIN READ ONLY`/`ROLLBACK`, confirmou conexão SQL ao PostgreSQL local. Não há papel de login dedicado à monitoração entre os papéis `contaia*`; `pg_monitor` é papel interno `NOLOGIN`. A consulta usou o usuário administrativo local do contêiner para descoberta, sem ler dados de negócio e sem criar papel. Nenhuma referência ContaIA de monitoração apareceu na listagem local do Windows Credential Manager. Essa consulta **não** satisfaz a exigência da issue de executar a sonda com papel somente leitura e segredo referenciado.

## Entrega técnica desta fatia

O serviço M2 agora aceita sonda `docker` em configuração local opt-in. A configuração informa `resourceId`, nome exato do contêiner e URL do proxy em `127.0.0.1/v1/snapshot`; o token é lido de `WR3D_DOCKER_PROXY_TOKEN`, fora do JSON. Falta de token, endpoint externo, campos extras (inclusive token no JSON) e recurso de tipo divergente são recusados antes de persistir o inventário. A sonda usa o proxy de escopo mínimo já existente; não abre socket Docker no serviço nem inicia o proxy.

Com proxy sintético, o teste verificou coleta `saudavel`, mudança periódica para `indisponivel` sem sessões de agentes e cobertura `perdida` quando o proxy sai do ar. `npm run typecheck`, 131/131 testes do serviço e 12/12 testes de contratos passaram em Node 24.15.0. Nenhum contêiner ou banco ContaIA foi consultado nesta fatia.

## Pendente para operação real

- **PostgreSQL:** banco/porta locais identificados, mas não há papel dedicado somente leitura, referência do segredo no armazenamento local nem permissões efetivas desse papel. Consulta da sonda com papel de monitoração: `not_run`. Consulta administrativa de metadados: `pass` pontual, sem satisfazer o critério.
- **Docker:** conta Windows isolada prometida, token protegido e execução do proxy sob essa conta ainda não existem nesta prova. A conta desta sessão possui privilégios administrativos e grupo `docker-users`; não comprova separação do serviço/Unity. Coleta ContaIA de dez minutos: `not_run`.
- **RNF-02:** a prova anterior com VSync 1 registrou p95 interno de 16,725 ms, acima do limite 16,67 ms. FPS apresentado, GPU e modo reduzido seguem `not_run`; nenhuma nova medição do Player foi feita nesta fatia.

Issue #16 e aceite operacional da #3 permanecem abertos. Integração sintética não atesta monitoramento contínuo real.
