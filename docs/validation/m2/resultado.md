# M2 — inventário, saúde, Docker e cena Unity live

Issue [#3](https://github.com/RodReis/war-room3d/issues/3) encerrada por solicitação do PI após integrar a base M1 [#8](https://github.com/RodReis/war-room3d/pull/8) e as fatias M2 [#9](https://github.com/RodReis/war-room3d/pull/9)–[#15](https://github.com/RodReis/war-room3d/pull/15). HEAD integrado: `3018e980afdfbd0e82d696db5e93265a96b8558b`. A validação operacional restante está na [#16](https://github.com/RodReis/war-room3d/issues/16). Data: 06/11/2026. Windows x64; Node.js 24.15.0; Unity 6000.3.27f1.

| Prova | Resultado | Evidência |
|---|---|---|
| Contratos | `pass` — 8/8 | `cd contracts; npm ci; npm test` |
| Serviço | `pass` — typecheck e 43/43 no HEAD integrado | `cd service; npm ci; npm run typecheck; npm test` |
| Unity EditMode | `pass` — 9/9 na branch da PR #12, após revisão | `unity test ./unity --mode EditMode --output Logs/m2-live-editmode-review.xml --timeout 240` |
| Unity PlayMode | `pass` — 7/7 na branch da PR #12, após revisão | `unity test ./unity --mode PlayMode --output Logs/m2-live-playmode-review.xml --timeout 240`; inclui HTTP/SSE sintético, atualização periódica e impacto em sala sem agentes |
| Build Windows x64 | `pass` — 172.230.310 bytes, live após revisão | `M2LiveProjectSetup.BuildWindowsM2Live`, Unity batch; executável local em `unity/Builds/WarRoom3D-M2-Live/` |
| Ensaio Docker real | `pass` pontual | Proxy separado e sonda em loopback, 401/404 de recusa, um contêiner do checkout autorizado, leitura persistida no SQLite temporário; [evidência e limites](docker-proxy.md) |
| Escopos adicionais de laboratório | `pass` pontual para metadata Docker | Dois checkouts autorizados observados por proxy em escopos exatos: servidor parado/sem porta; banco com healthcheck Docker saudável. Sem SQL ou HTTP de aplicação; [limites](laboratorio.md) |
| Sonda PostgreSQL | `pass` sintético | Consulta fixa em transação de leitura, timeout, erro ocioso e falha de coleta testados; serviço 42/42 com typecheck. Nenhuma conexão SQL real; [prova](database-probe.md) |
| API de produção autorizada | `pass` pontual | Liveness e readiness devolveram `200`; sonda HTTP persistiu saúde atual em SQLite temporário. Três GET no total, sem dados de negócio; [evidência e limites](api-producao.md) |
| Snapshot HTTP/SSE | `pass` sintético | Contrato validado, autenticação, cursor, replay e migração em SQLite temporário; [prova e limites](transport.md) |
| UI live HTTP/SSE | `pass` sintético | Cena sem fixture, snapshot degradado, aviso SSE e novo snapshot saudável; [evidência](unity-live.md) |
| Ensaio SQL real e servidor de jogo | `not_run` | O servidor de jogo autorizado está parado e não expõe HTTP de saúde; healthcheck Docker do banco não substitui papel de monitoração e consulta SQL aprovada |
| Capturas visuais e frame time do executável | `not_run` | Build e testes não medem legibilidade nem desempenho no Player; dependem de sessão visual separada |
| CI no HEAD | `not_run` | Nenhum workflow versionado para estas provas |

Os testes controlados cobrem recurso homônimo em ambientes distintos, API→banco compartilhado, ciclo, revogação de vínculo, perda de fonte/coleta, timeout, 401, 503, expiração, reinício, leitura tardia, recuperação evidenciada, coleta periódica sem sessões e persistência de incidente. A falha de coleta mostra `sem_dados` com cobertura perdida; não resolve o incidente anterior. A sonda de host lê memória local pontualmente no teste com saúde `sem_dados`, evitando classificar uso de RAM como saúde do host. Os testes HTTP usam respostas falsas; nenhuma API do laboratório de jogo foi sondada. A API de produção autorizada foi observada em ensaio pontual separado.

A cena demonstrativa contém racks lógicos e painel de recurso com ambiente, saúde, frescor, cobertura, fonte, horário, indicador, evidência e projetos dependentes. Seus valores vêm de fixture sintética e mantêm o selo `CONCEITO · DADOS ILUSTRATIVOS`. A cena live separada consome snapshot/SSE de serviço local e não inclui carregadores da demonstração; seu ensaio de transporte usou fonte sintética. O runner aceita agendamento e parada explícitos, mas nenhuma coleta contínua real foi instalada. O proxy Docker foi ensaiado pontualmente; banco não possui conector ativo. A issue #3 foi encerrada com os critérios operacionais restantes transferidos para a #16; o encerramento não comprova operação real completa.

O novo teste PlayMode detectou que o carregador M2 não era reconstruído ao reabrir a cena. Renomear o arquivo C# para corresponder ao `MonoBehaviour` serializado corrigiu o vínculo; a cena foi recriada e EditMode, PlayMode e build foram repetidos no código corrigido.

Revisão automática da PR #9: o corpo HTTP aberto após receber cabeçalhos e o status de recurso preservado ao filtrar uma sala sem vínculos foram reproduzidos e corrigidos. Regressões de cancelamento do corpo e troca de filtro passaram; serviço, PlayMode e build foram repetidos após as correções.

Revisão automática da PR #11: o snapshot podia misturar sessões antigas e sequência SSE nova quando outro processo escrevia no SQLite. A composição passou a ocorrer em uma transação de leitura; teste com duas conexões confirmou visão consistente. O código corrigido foi mesclado antes das PRs seguintes. EditMode, PlayMode e build Windows acima foram executados na branch Unity anterior ao merge final; não foram repetidos no HEAD integrado.

Levantamento de permissões e fontes: [laboratório](laboratorio.md).
