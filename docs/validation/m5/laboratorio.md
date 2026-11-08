# M5 — Laboratório local

Estado: provas de domínio e API local, mais leitura autorizada dos logs Docker do serviço API do ContaIA em execução. Não há backend de rastros distribuídos nem detector/SIEM conectado.

## Escopo reproduzível

- Serviço: `cd service; npm ci; npm test; npm run typecheck`.
- Contrato: `cd contracts; npm ci; npm test`.
- Fixtures em `service/test/operations.test.ts` usam somente valores sintéticos. Os exemplos de credenciais aparecem deliberadamente no teste para provar redação antes da persistência.
- A coleta M5 de rede é opt-in: `m5NetworkSignals: true` só deriva latência, saúde HTTP e referência de status de sondas API já cadastradas em `monitoring.local.json`. Exige `m5NetworkRetentionDays` explícito. Não coleta corpo da resposta, tráfego bruto, DNS, pacotes ou geolocalização.
- Não iniciar sonda contra ambiente externo sem autorização específica. A configuração de exemplo mantém `m5NetworkSignals: false`.
- A fonte `m5DockerLogs` é opt-in e fixa `service: "api"`. O proxy Docker permanece desligado; habilite-o só no processo local do proxy com `WR3D_DOCKER_LOGS_ENABLED=1`, `WR3D_DOCKER_COMPOSE_PROJECT`, `WR3D_DOCKER_COMPOSE_WORKDIR` e token forte em `WR3D_DOCKER_PROXY_TOKEN`. O processo de serviço usa `WR3D_DOCKER_LOGS_PROXY_URL=http://127.0.0.1:<porta>/v1/logs` e `WR3D_DOCKER_LOGS_PROXY_TOKEN` com o mesmo token. `m5DockerLogs.enabled` precisa ser `true`, com projeto Compose e diretório de trabalho exatos, ambiente/recurso presentes no inventário, retenção explícita e janela inicial de até 7 dias.
- O proxy consulta o Docker Engine por socket/named pipe, exige correspondência exata de projeto, diretório Compose e label `service=api`, e usa leitura sem `follow` e sem corte por `tail`. Cada resposta é limitada a 1 MiB, 1.000 linhas e 4.096 caracteres por mensagem; exceder limite falha sem persistir lote parcial e deixa a fonte indisponível. O endpoint `/v1/logs` exige Bearer, é GET e não aceita filtro de outro serviço. Não executa comandos dentro do contêiner nem altera seu estado. TTY/framing inválido e respostas fora do escopo falham fechados.
- O coletor redige segredos, CPF, CNPJ, e-mail, identificadores de tenant/empresa/usuário e query de URL antes de persistir. Request ID só é associado se estiver explícito na própria linha. Contêiner parado deixa cobertura `unavailable`, mesmo que linhas históricas tenham sido lidas. Logs preservam horário de origem e retenção configurada.

## Cobertura e evidência

`GET /v1/operations/sources?environmentId=...` lista fonte, permissões e cobertura por categoria. Estados separados: `covered`, `disabled`, `no_permission`, `unavailable`, `stale`, `no_data` e `absent`. Ambiente sem fonte retorna cobertura `absent`; detector desligado não representa ausência de alertas.

Logs, rastros, rede, detecções e relatórios usam páginas de até 100 itens. Trace, span e request só se correlacionam por ID igual. Janela temporal serve para filtrar, não cria vínculo. Segredos conhecidos são redigidos nos campos de texto e query/fragmento são removidos das referências antes da persistência.

Regras são imutáveis por `(ruleId, version)`. Observação de rede pode abrir incidente apenas quando regra explicitamente configurada corresponder. A fonte perdida não resolve incidente; reconhecimento e resolução exigem ator, projeto vinculado e credencial de comando separada. Repetir evidência é idempotente por `sourceId + observationId`.

## Ensaio ContaIA (somente leitura)

- Escopo autorizado: checkout local `C:\Desenv\Projetos\rrb-contaia`, Compose project `contaia`, diretório Compose `C:\Desenv\Projetos\rrb-contaia\infra\docker`, serviço `api`.
- Primeira inspeção: `contaia-api` parado (`Exited (127)`), logs históricos até `2026-11-06T19:41:58Z`; nenhuma linha nas 24h anteriores. O protótipo com `tail=100` leu 100 linhas e marcou cobertura `unavailable`; revelou corte indevido em rajadas.
- Nova inspeção em 08/11/2026: contêiner `running (healthy)` e `GET http://127.0.0.1:15101/health` respondeu HTTP 200. Com limite de 1 MiB/1.000 linhas e janela inicial de 10 minutos, proxy e coletor leram 330 linhas de `2026-11-08T12:11:10.757Z` a `12:11:10.928Z`; 330 foram persistidas após redação, segunda rodada gravou 0 duplicatas, fonte `active` e cobertura `covered` no instante da consulta. Os registros lidos não tinham request ID reconhecido. Consulta ao SQLite temporário não encontrou CPF ou e-mail sem redação nas mensagens persistidas. Banco e proxy temporários foram encerrados/removidos; checkout e contêiner ContaIA não foram alterados por este ensaio.
- Essas provas são pontuais. `covered` se refere à janela e ao instante consultados; não demonstra coleta contínua, trace distribuído ou detecção de segurança. Falha por limite de volume deve permanecer `unavailable` até uma coleta completa.

## Limites

- A conexão Docker acima é um adaptador local de logs. Não há backend de pesquisa de traces, spans OTel, SIEM ou detector de segurança. `OperationsStore.record` fornece contrato para esses adaptadores, mas não existe endpoint de ingestão pública.
- O ensaio do painel Unity usa a API local autorizada; execução visual no Player Windows ainda deve ser registrada em `resultado.md` antes de qualquer aceite visual.
- Dados `security_report` não abrem incidente automaticamente; só `security_detection` e regras de rede explícitas participam do motor.
- Estado M5 do catálogo não transforma fonte sintética ou ausência de integração em operação real.
