# Issue #16 — preparação da coleta Docker ContaIA

Data: 08/11/2026. Alvo indicado pelo PI: ContaIA. Escopo autorizado para futuro ensaio: metadados Docker do projeto Compose `contaia` em `C:\Desenv\Projetos\rrb-contaia\infra\docker` por dez minutos. O PI informou que fornecerá a conta Windows isolada. A resposta sobre SQL confirmou autorização, mas não identificou papel PostgreSQL, banco, referência de segredo ou permissões efetivas.

## Entrega técnica desta fatia

O serviço M2 agora aceita sonda `docker` em configuração local opt-in. A configuração informa `resourceId`, nome exato do contêiner e URL do proxy em `127.0.0.1/v1/snapshot`; o token é lido de `WR3D_DOCKER_PROXY_TOKEN`, fora do JSON. Falta de token, endpoint externo, campos extras (inclusive token no JSON) e recurso de tipo divergente são recusados antes de persistir o inventário. A sonda usa o proxy de escopo mínimo já existente; não abre socket Docker no serviço nem inicia o proxy.

Com proxy sintético, o teste verificou coleta `saudavel`, mudança periódica para `indisponivel` sem sessões de agentes e cobertura `perdida` quando o proxy sai do ar. `npm run typecheck`, 131/131 testes do serviço e 12/12 testes de contratos passaram em Node 24.15.0. Nenhum contêiner ou banco ContaIA foi consultado nesta fatia.

## Pendente para operação real

- **PostgreSQL:** papel dedicado somente leitura, banco/porta, referência do segredo no armazenamento local e permissões efetivas não foram informados. Consulta SQL real: `not_run`.
- **Docker:** conta Windows isolada prometida, token protegido e execução do proxy sob essa conta ainda não existem nesta prova. A conta desta sessão possui privilégios administrativos e grupo `docker-users`; não comprova separação do serviço/Unity. Coleta ContaIA de dez minutos: `not_run`.
- **RNF-02:** a prova anterior com VSync 1 registrou p95 interno de 16,725 ms, acima do limite 16,67 ms. FPS apresentado, GPU e modo reduzido seguem `not_run`; nenhuma nova medição do Player foi feita nesta fatia.

Issue #16 e aceite operacional da #3 permanecem abertos. Integração sintética não atesta monitoramento contínuo real.
