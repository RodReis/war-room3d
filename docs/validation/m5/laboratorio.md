# M5 — Laboratório sintético

Estado: provas de domínio e API local; nenhuma fonte externa de logs, rastros ou segurança foi conectada.

## Escopo reproduzível

- Serviço: `cd service; npm ci; npm test; npm run typecheck`.
- Contrato: `cd contracts; npm ci; npm test`.
- Fixtures em `service/test/operations.test.ts` usam somente valores sintéticos. Os exemplos de credenciais aparecem deliberadamente no teste para provar redação antes da persistência.
- A coleta M5 de rede é opt-in: `m5NetworkSignals: true` só deriva latência, saúde HTTP e referência de status de sondas API já cadastradas em `monitoring.local.json`. Exige `m5NetworkRetentionDays` explícito. Não coleta corpo da resposta, tráfego bruto, DNS, pacotes ou geolocalização.
- Não iniciar sonda contra ambiente externo sem autorização específica. A configuração de exemplo mantém `m5NetworkSignals: false`.

## Cobertura e evidência

`GET /v1/operations/sources?environmentId=...` lista fonte, permissões e cobertura por categoria. Estados separados: `covered`, `disabled`, `no_permission`, `unavailable`, `stale`, `no_data` e `absent`. Ambiente sem fonte retorna cobertura `absent`; detector desligado não representa ausência de alertas.

Logs, rastros, rede, detecções e relatórios usam páginas de até 100 itens. Trace, span e request só se correlacionam por ID igual. Janela temporal serve para filtrar, não cria vínculo. Segredos conhecidos são redigidos nos campos de texto e query/fragmento são removidos das referências antes da persistência.

Regras são imutáveis por `(ruleId, version)`. Observação de rede pode abrir incidente apenas quando regra explicitamente configurada corresponder. A fonte perdida não resolve incidente; reconhecimento e resolução exigem ator, projeto vinculado e credencial de comando separada. Repetir evidência é idempotente por `sourceId + observationId`.

## Limites

- Não há adaptador configurado para backend de pesquisa de logs/traces, SIEM ou detector de segurança. `OperationsStore.record` fornece contrato para esses adaptadores, mas não existe endpoint de ingestão pública.
- O ensaio do painel Unity usa a API local autorizada; execução visual no Player Windows ainda deve ser registrada em `resultado.md` antes de qualquer aceite visual.
- Dados `security_report` não abrem incidente automaticamente; só `security_detection` e regras de rede explícitas participam do motor.
- Estado M5 do catálogo não transforma fonte sintética ou ausência de integração em operação real.
