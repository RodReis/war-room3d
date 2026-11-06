# M2 — snapshot HTTP e avisos SSE

Esta fatia expõe o estado persistido do serviço em `127.0.0.1`. `GET /v1/snapshot` entrega o contrato `snapshot.v1` validado; `/v1/health`, `/v1/capabilities` e `/v1/events` também exigem Bearer token. O processo standalone recebe `WR3D_DATABASE_PATH`, `WR3D_SERVICE_PORT` e `WR3D_SERVICE_TOKEN`; não inicia sem configuração explícita. O token tem pelo menos 32 bytes, deve ser gerado aleatoriamente e protegido fora do Git. O banco ativo fica fora do repositório.

O stream SSE usa `Last-Event-ID` como cursor de `streamSequence`. Mudanças de inventário, recurso, projeto e evento de sessão recebem sequência persistida na mesma transação que altera o estado. Cada aviso contém somente tipo, sequência e, quando aplicável, `resourceId` ou `projectId`; o consumidor **busca novo snapshot** ao receber o aviso. Assim, o stream funciona como invalidação versionada, ainda não como delta com payload de estado. O heartbeat de 15 s não muda presença ou saúde. O registro de avisos de estado retém os últimos 1.000 itens; um cursor ausente, futuro, anterior à migração ou fora da janela recebe `409 resync_required`, e uma conexão ativa que perde a janela recebe `resync.required` e encerra. O cliente então deve obter novo snapshot. O serviço limita a 16 conexões SSE e encerra clientes cuja fila ultrapasse 8 MiB.

A migração SQLite 0003 preserva os estados M1/M2 e cria registro de avisos. Para bancos existentes, avança a sequência e marca o cursor anterior como incompatível, obrigando snapshot novo. Os endpoints HTTP não alteram o estado, mas a abertura do store pode aplicar a migração. A coleta continua independente de sessões e conexões Unity.

## Prova sintética em 06/11/2026

- Node 24: typecheck e 38/38 testes do serviço; contratos 8/8 nesta branch.
- Teste HTTP/SSE: token ausente `401`, método de escrita `405`, query extra `404`, snapshot `mode=live` válido, aviso `resource.changed` após leitura persistida, `project.changed` após cadastro e replay pelo cursor.
- Cursores futuro e fora da janela retornaram `409`; migração simulada de banco M2 forçou novo snapshot, e o cursor novo abriu o stream.

**Limites:** o teste usa SQLite temporário e inventário sintético. Nenhuma Unity live ou fonte de sessão real foi conectada; não há medição de p95, burst de 100 eventos, cliente lento em ambiente real ou coleta Docker contínua. O stream transporta avisos de invalidação; o cliente deve buscar snapshot para obter o novo estado. Aceite funcional da issue #3 permanece pendente.
