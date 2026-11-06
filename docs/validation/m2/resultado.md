# M2 — primeira fatia: inventário, saúde e data center demonstrativo

Issue [#3](https://github.com/RodReis/war-room3d/issues/3). Branch `feat/m2-infra-core` sobre a PR M1 [#8](https://github.com/RodReis/war-room3d/pull/8), HEAD base `abb61b4`. Data: 06/11/2026. Windows x64; Node.js 24.15.0; Unity 6000.3.27f1.

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | `pass` — 8/8 | `cd contracts; npm ci; npm test` |
| Serviço | `pass` — typecheck e 28/28 | `cd service; npm ci; npm run typecheck; npm test` |
| Unity EditMode | `pass` — 6/6 | `unity test ./unity --mode EditMode --output Logs/m2-editmode.xml` |
| Unity PlayMode | `pass` — 3/3 | `unity test ./unity --mode PlayMode --output Logs/m2-playmode.xml` |
| Build Windows x64 | `pass` — 172.203.490 bytes | `M0ProjectSetup.BuildWindowsM2`, Unity batch; executável local em `Builds/WarRoom3D-M2-Demo/` |
| Ensaio de fonte real e UI live | `not_run` | Transporte M1/Unity live ainda inexistente; autorização não fornece endpoint HTTP nem papel de monitoração do banco; Docker sem proxy mínimo |
| Capturas visuais e frame time do executável | `not_run` | Build e testes não medem legibilidade nem desempenho no Player; dependem de sessão visual separada |
| CI no HEAD | `not_run` | Nenhum workflow versionado para estas provas |

Os testes controlados cobrem recurso homônimo em ambientes distintos, API→banco compartilhado, ciclo, revogação de vínculo, perda de fonte/coleta, timeout, 401, 503, expiração, reinício, leitura tardia, recuperação evidenciada e persistência de incidente sem sessões. A falha de coleta mostra `sem_dados` com cobertura perdida; não resolve o incidente anterior. A sonda de host lê memória local pontualmente no teste com saúde `sem_dados`, evitando classificar uso de RAM como saúde do host. HTTP usa respostas falsas; nenhuma API do laboratório foi sondada.

A cena contém racks lógicos e painel de recurso com ambiente, saúde, frescor, cobertura, fonte, horário, indicador, evidência e projetos dependentes. Todo valor na cena vem de fixture sintética e aparece como exemplo. O selo `CONCEITO · DADOS ILUSTRATIVOS` permanece visível. O estado operacional persistido no SQLite ainda não chega ao Unity; não há HTTP/SSE, `resource.changed`, `dependency.changed`, reconhecimento de incidentes nem coleta contínua instalada. Docker e banco não possuem conectores ativos. A issue #3 permanece aberta e sem aceite funcional.

Levantamento de permissões e fontes: [laboratório](laboratorio.md).
