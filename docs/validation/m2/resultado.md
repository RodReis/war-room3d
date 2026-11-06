# M2 — inventário, saúde, Docker e cena Unity live

Issue [#3](https://github.com/RodReis/war-room3d/issues/3), [PR #9](https://github.com/RodReis/war-room3d/pull/9) em revisão no HEAD `459a13c7987a54d5c4b1b9930fd433f13af636ed`, empilhada sobre a PR M1 [#8](https://github.com/RodReis/war-room3d/pull/8), HEAD base `abb61b4`. [PR #10](https://github.com/RodReis/war-room3d/pull/10) contém a fatia Docker; [#11](https://github.com/RodReis/war-room3d/pull/11), o transporte de estado; e [#12](https://github.com/RodReis/war-room3d/pull/12), a cena Unity live. Data: 06/11/2026. Windows x64; Node.js 24.15.0; Unity 6000.3.27f1.

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | `pass` — 8/8 | `cd contracts; npm ci; npm test` |
| Serviço | `pass` — typecheck e 38/38 com transporte | `cd service; npm ci; npm run typecheck; npm test` |
| Unity EditMode | `pass` — 9/9 na pilha atual | `unity test ./unity --mode EditMode --output Logs/m2-live-editmode-final.xml --timeout 240` |
| Unity PlayMode | `pass` — 7/7 na pilha atual | `unity test ./unity --mode PlayMode --output Logs/m2-live-playmode-final.xml --timeout 240`; inclui HTTP/SSE sintético e impacto em sala sem agentes |
| Build Windows x64 | `pass` — 172.229.542 bytes, live | `M2LiveProjectSetup.BuildWindowsM2Live`, Unity batch; executável local em `unity/Builds/WarRoom3D-M2-Live/` |
| Ensaio Docker real | `pass` pontual | Proxy separado e sonda em loopback, 401/404 de recusa, um contêiner do checkout autorizado, leitura persistida no SQLite temporário; [evidência e limites](docker-proxy.md) |
| Snapshot HTTP/SSE | `pass` sintético | Contrato validado, autenticação, cursor, replay e migração em SQLite temporário; [prova e limites](transport.md) |
| UI live HTTP/SSE | `pass` sintético | Cena sem fixture, snapshot degradado, aviso SSE e novo snapshot saudável; [evidência](unity-live.md) |
| Ensaio de API/banco real | `not_run` | Autorização não fornece endpoint HTTP de saúde nem papel de monitoração do banco |
| Capturas visuais e frame time do executável | `not_run` | Build e testes não medem legibilidade nem desempenho no Player; dependem de sessão visual separada |
| CI no HEAD | `not_run` | Nenhum workflow versionado para estas provas |

Os testes controlados cobrem recurso homônimo em ambientes distintos, API→banco compartilhado, ciclo, revogação de vínculo, perda de fonte/coleta, timeout, 401, 503, expiração, reinício, leitura tardia, recuperação evidenciada, coleta periódica sem sessões e persistência de incidente. A falha de coleta mostra `sem_dados` com cobertura perdida; não resolve o incidente anterior. A sonda de host lê memória local pontualmente no teste com saúde `sem_dados`, evitando classificar uso de RAM como saúde do host. HTTP usa respostas falsas; nenhuma API do laboratório foi sondada.

A cena demonstrativa contém racks lógicos e painel de recurso com ambiente, saúde, frescor, cobertura, fonte, horário, indicador, evidência e projetos dependentes. Seus valores vêm de fixture sintética e mantêm o selo `CONCEITO · DADOS ILUSTRATIVOS`. A cena live separada consome snapshot/SSE de serviço local e não inclui carregadores da demonstração; seu ensaio de transporte usou fonte sintética. O runner aceita agendamento e parada explícitos, mas nenhuma coleta contínua real foi instalada. O proxy Docker foi ensaiado pontualmente; banco não possui conector ativo. A issue #3 permanece aberta e sem aceite funcional.

O novo teste PlayMode detectou que o carregador M2 não era reconstruído ao reabrir a cena. Renomear o arquivo C# para corresponder ao `MonoBehaviour` serializado corrigiu o vínculo; a cena foi recriada e EditMode, PlayMode e build foram repetidos no código corrigido.

Revisão automática da PR #9: o corpo HTTP aberto após receber cabeçalhos e o status de recurso preservado ao filtrar uma sala sem vínculos foram reproduzidos e corrigidos. Regressões de cancelamento do corpo e troca de filtro passaram; serviço, PlayMode e build foram repetidos após as correções.

Levantamento de permissões e fontes: [laboratório](laboratorio.md).
