# Issue #16 — preparação da coleta Docker ContaIA

Data: 08/11/2026. Alvo indicado pelo PI: ContaIA. Escopo autorizado para o ensaio: metadados Docker do projeto Compose `contaia` em `C:\Desenv\Projetos\rrb-contaia\infra\docker` por dez minutos. O PI depois autorizou criar papel, segredo e contas Windows temporários para o teste, além de ler e consultar o checkout ContaIA.

## Descoberta somente leitura no checkout ContaIA

O PI autorizou ler e consultar `C:\Desenv\Projetos\rrb-contaia`, em uso no VS Code. O checkout já continha alterações de outro trabalho e não foi modificado. O Compose foi consultado com `.env` local, projeto `contaia` e arquivo `infra/docker/compose.yml`; o contêiner `contaia-postgres` estava `healthy`. A configuração local indica banco `contaia` em `127.0.0.1:15432`. Foram lidos apenas nomes de variáveis da `.env`, sem imprimir seus valores de senha.

Uma consulta de metadados em `pg_roles`, dentro de `BEGIN READ ONLY`/`ROLLBACK`, confirmou conexão SQL ao PostgreSQL local. Não há papel de login dedicado à monitoração entre os papéis `contaia*`; `pg_monitor` é papel interno `NOLOGIN`. A consulta usou o usuário administrativo local do contêiner para descoberta, sem ler dados de negócio e sem criar papel. Nenhuma referência ContaIA de monitoração apareceu na listagem local do Windows Credential Manager. Essa consulta **não** satisfaz a exigência da issue de executar a sonda com papel somente leitura e segredo referenciado.

## Consulta SQL real com papel temporário

Após autorização do PI para criar recursos de teste, foi criado `wr3d_monitor_lab_<sufixo>` no PostgreSQL local. O papel recebeu apenas `CONNECT` no banco `contaia`, sem `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS` ou herança de outros papéis; limite de uma conexão, `default_transaction_read_only=on` e timeout de comando de 3 s. Nenhuma permissão sobre tabelas foi concedida. Uma senha aleatória de 32 bytes foi guardada temporariamente em arquivo DPAPI do perfil Windows, fora do Git; a sonda leu a referência ao arquivo, sem incluir senha em argumento de processo, configuração ou relatório.

`postgresProbe` conectou em `127.0.0.1:15432` como esse papel e executou `BEGIN READ ONLY`, `SELECT 1 AS ok`, `ROLLBACK`. Resultado: `saudavel`, evidência `postgres-select-1`, latência 13,89 ms. A conexão independente confirmou `current_user` igual ao papel, leitura por padrão `on` e ausência de permissão `CREATE` no banco. Nenhum dado de negócio foi consultado. Após o ensaio, o papel e o arquivo DPAPI foram removidos; consulta a `pg_roles` e varredura do diretório temporário retornaram zero resíduos.

Limite de privilégio: a ACL atual do banco concede `TEMP` e `CONNECT` a `PUBLIC`; não há concessões `PUBLIC` em tabelas da aplicação. O papel temporário não recebeu privilégios de escrita em tabelas, mas `default_transaction_read_only` pode ser alterado por uma sessão do próprio papel. Portanto, a prova de leitura estrita vem da transação `BEGIN READ ONLY` da sonda e da consulta fixa, não de uma impossibilidade absoluta de escrita temporária pelo login. Nenhuma ACL compartilhada do ContaIA foi alterada.

Referências: [DPAPI em `ConvertFrom-SecureString`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring?view=powershell-5.1), [privilégios `PUBLIC` do PostgreSQL](https://www.postgresql.org/docs/17/ddl-priv.html) e [transação `READ ONLY`](https://www.postgresql.org/docs/17/sql-set-transaction.html).

Imprevisto: a primeira tentativa falhou antes da sonda porque o PowerShell 5 não carregou `Microsoft.PowerShell.Security` ao abrir o segredo. A limpeza automática deixou papel temporário em `NOLOGIN` porque faltava revogar o `CONNECT` antes do `DROP ROLE`. A revogação e remoção foram executadas, confirmadas por contagem zero; a segunda tentativa usou PowerShell 7 e removeu papel e segredo. O resultado acima é prova pontual da sonda e do papel temporário, sem instalar monitoração SQL contínua.

O diretório `WarRoom3D\lab-secrets` no perfil local ficou vazio (zero arquivos). A revisão automática de segurança bloqueou sua remoção com motivo `blocked by policy`; não houve tentativa por outro canal. Nenhuma senha ou papel temporário permaneceu.

## Entrega técnica desta fatia

O serviço M2 agora aceita sonda `docker` em configuração local opt-in. A configuração informa `resourceId`, nome exato do contêiner e URL do proxy em `127.0.0.1/v1/snapshot`; o token é lido de `WR3D_DOCKER_PROXY_TOKEN`, fora do JSON. Falta de token, endpoint externo, campos extras (inclusive token no JSON) e recurso de tipo divergente são recusados antes de persistir o inventário. A sonda usa o proxy de escopo mínimo já existente; não abre socket Docker no serviço nem inicia o proxy.

Com proxy sintético, o teste verificou coleta `saudavel`, mudança periódica para `indisponivel` sem sessões de agentes e cobertura `perdida` quando o proxy sai do ar. `npm run typecheck`, 131/131 testes do serviço e 12/12 testes de contratos passaram em Node 24.15.0. Essa validação de integração foi sintética; o ensaio PostgreSQL real está registrado acima.

## Docker ContaIA por dez minutos com identidades isoladas

Com autorização do PI para criar recursos de teste, duas contas Windows locais temporárias foram geradas: uma para o proxy, adicionada ao grupo `docker-users`, e outra para o leitor, fora desse grupo. O proxy Node executou sob a primeira conta, restrito pelos labels exatos `com.docker.compose.project=contaia` e `com.docker.compose.project.working_dir=C:\Desenv\Projetos\rrb-contaia\infra\docker`. O leitor Node executou sob a segunda conta, com SQLite temporário e sem sessões de agentes. Token aleatório de 32 bytes ficou em arquivo temporário com ACL limitada às duas contas, `Administrators` e `SYSTEM`, fora do Git; nunca foi publicado.

Os PIDs do proxy e leitor foram conferidos com seus respectivos usuários Windows. Requisição direta do leitor ao pipe Docker falhou; o script de laboratório registrou apenas booleano, sem código de erro, portanto a causa exata da recusa não foi identificada. Pela interface do proxy, ausência de token retornou `401`, rota bruta e query de escopo alternativo retornaram `404`, e método `POST` retornou `405`. Um snapshot autorizado listou 12 contêineres do projeto ContaIA e nenhum nome fora dele; o filtro exato de checkout é aplicado pelo proxy antes de responder.

Resultado após **600,003 s** de execução independente do Player: **119 leituras** do contêiner `contaia-postgres`, todas `saudavel`; **zero falhas de coleta**, maior intervalo entre observações **5.071 ms**, cobertura final `atual`, **zero sessões de agentes** no SQLite. O ensaio prova coleta recorrente local sob identidades de processo separadas nesse período. Não prova monitoramento após reinício, serviço instalado ou exclusividade global do socket: a conta administrativa do operador também mantém acesso ao Docker. Ao terminar, processos, contas Windows, grupo temporário, token e SQLite temporário foram removidos. Verificação independente encontrou zero contas, membros, processos, diretório ou papéis SQL temporários; status Git do checkout ContaIA permaneceu idêntico.

Os cinco scripts locais usados no ensaio não contêm credenciais e não entram na PR. A revisão automática de segurança também bloqueou a remoção desses arquivos de laboratório com motivo `blocked by policy`; eles permanecem **não rastreados** em `service/scripts/` desta worktree. Nenhuma limpeza alternativa foi tentada.

## Pendente para operação real

- **PostgreSQL:** consulta real da sonda com papel temporário restrito, transação `READ ONLY` e referência DPAPI: `pass` pontual. Papel e segredo removidos ao fim; monitoração SQL contínua permanece `not_run`.
- **Docker:** coleta ContaIA de dez minutos com proxy e leitor sob contas separadas: `pass` no laboratório temporário. Nenhuma identidade, token ou processo ficou instalado para operação permanente.
- **RNF-02:** o [ensaio complementar de FPS apresentado](issue-16-fps.md) mediu o Player em 1080p com VSync 1 por dez minutos. Com a janela visível, o p95 externo de exibição foi **24,663 ms** e o p95 interno **16,745 ms**, ambos acima de 16,67 ms; o p95 de tempo de GPU foi **5,172 ms**. O modo reduzido segue `not_run`.

Issue #16 e aceite operacional da #3 permanecem abertos. Consulta SQL pontual e coleta Docker de dez minutos não atestam operação permanente nem RNF-02.
