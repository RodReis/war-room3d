# M2 — inventário, saúde, data center demonstrativo e proxy Docker

Issue [#3](https://github.com/RodReis/war-room3d/issues/3), [PR #9](https://github.com/RodReis/war-room3d/pull/9) em revisão no HEAD `459a13c7987a54d5c4b1b9930fd433f13af636ed`, empilhada sobre a PR M1 [#8](https://github.com/RodReis/war-room3d/pull/8), HEAD base `abb61b4`. A fatia Docker usa branch separada sobre #9. Data: 06/11/2026. Windows x64; Node.js 24.15.0; Unity 6000.3.27f1.

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | `pass` — 8/8 | `cd contracts; npm ci; npm test` |
| Serviço | `pass` — typecheck e 34/34 na fatia Docker | `cd service; npm ci; npm run typecheck; npm test` |
| Unity EditMode | `pass` — 6/6 | `unity test ./unity --mode EditMode --output Logs/m2-editmode.xml` |
| Unity PlayMode | `pass` — 4/4 | `unity test ./unity --mode PlayMode --output Logs/m2-playmode.xml`; inclui seleção de recurso e impacto em sala sem agentes |
| Build Windows x64 | `pass` — 172.203.486 bytes | `M0ProjectSetup.BuildWindowsM2`, Unity batch; executável local em `Builds/WarRoom3D-M2-Demo/` |
| Ensaio Docker real | `pass` pontual | Proxy separado e sonda em loopback, 401/404 de recusa, um contêiner do checkout autorizado, leitura persistida no SQLite temporário; [evidência e limites](docker-proxy.md) |
| Ensaio de API/banco real e UI live | `not_run` | Transporte M1/Unity live ainda inexistente; autorização não fornece endpoint HTTP nem papel de monitoração do banco |
| Capturas visuais e frame time do executável | `not_run` | Build e testes não medem legibilidade nem desempenho no Player; dependem de sessão visual separada |
| CI no HEAD | `not_run` | Nenhum workflow versionado para estas provas |

Os testes controlados cobrem recurso homônimo em ambientes distintos, API→banco compartilhado, ciclo, revogação de vínculo, perda de fonte/coleta, timeout, 401, 503, expiração, reinício, leitura tardia, recuperação evidenciada, coleta periódica sem sessões e persistência de incidente. A falha de coleta mostra `sem_dados` com cobertura perdida; não resolve o incidente anterior. A sonda de host lê memória local pontualmente no teste com saúde `sem_dados`, evitando classificar uso de RAM como saúde do host. HTTP usa respostas falsas; nenhuma API do laboratório foi sondada.

A cena contém racks lógicos e painel de recurso com ambiente, saúde, frescor, cobertura, fonte, horário, indicador, evidência e projetos dependentes. Todo valor na cena vem de fixture sintética e aparece como exemplo. O selo `CONCEITO · DADOS ILUSTRATIVOS` permanece visível. O runner aceita agendamento e parada explícitos, mas nenhuma coleta contínua real foi instalada. O estado operacional persistido no SQLite ainda não chega ao Unity; não há HTTP/SSE, `resource.changed`, `dependency.changed` nem reconhecimento de incidentes. O proxy Docker foi ensaiado pontualmente; banco não possui conector ativo. A issue #3 permanece aberta e sem aceite funcional.

O novo teste PlayMode detectou que o carregador M2 não era reconstruído ao reabrir a cena. Renomear o arquivo C# para corresponder ao `MonoBehaviour` serializado corrigiu o vínculo; a cena foi recriada e EditMode, PlayMode e build foram repetidos no código corrigido.

Revisão automática da PR #9: o corpo HTTP aberto após receber cabeçalhos e o status de recurso preservado ao filtrar uma sala sem vínculos foram reproduzidos e corrigidos. Regressões de cancelamento do corpo e troca de filtro passaram; serviço, PlayMode e build foram repetidos após as correções.

Levantamento de permissões e fontes: [laboratório](laboratorio.md).
