# M2 — sonda PostgreSQL preparada

A sonda `postgresProbe` aceita somente `127.0.0.1`, porta explícita, banco, usuário e timeout limitado. A senha é obtida no momento da coleta por um `PasswordProvider` injetado; nenhum valor ou referência de credencial é versionado. A implementação usa `pg` 8.23.1, com timeouts de conexão, consulta e comando, e abre uma conexão curta por coleta.

Após conectar, executa apenas `BEGIN READ ONLY`, `SELECT 1 AS ok` e `ROLLBACK`. Só uma linha com `ok = 1` produz saúde `saudavel`, com horário, latência e evidência `postgres-select-1`. A conexão é encerrada também em falha. Uma coleta anterior ainda em execução impede nova consulta sobreposta. O `CollectorRunner` converte erro ou timeout em cobertura perdida, sem criar incidente a partir da falha de observação.

## Validação sintética em 06/11/2026

- `npm run typecheck`: `pass`.
- `npm test`: `pass` 41/41 no serviço, incluindo três testes da sonda: sequência SQL fixa e fechamento, recusa de alvo remoto/credencial vazia/cancelamento, e perda de cobertura sem incidente quando a consulta falha.
- `npm install` relatou zero vulnerabilidades conhecidas para a árvore instalada.

**Limites:** nenhum banco real foi consultado. O papel de monitoração, a consulta autorizada, a referência de segredo e seu acesso pelo armazenamento local ainda precisam ser associados ao alvo informado pelo PI. A callback de senha é uma interface de integração, não um leitor de credenciais do sistema operacional já instalado. O teste sintético não comprova permissões efetivas do papel, TLS, latência real ou recuperação após falha no PostgreSQL do laboratório. A sonda não foi adicionada a uma coleta contínua.

API de referência: [node-postgres Client](https://node-postgres.com/apis/client).
