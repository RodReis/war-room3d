# M2 — levantamento do laboratório autorizado

Data: 06/11/2026. O PI indicou um checkout local em desenvolvimento como candidato de laboratório para observação. Esta nota publica somente categorias e limites; nomes de recursos, endereços e credenciais do ambiente não são incluídos.

| Categoria | Evidência de leitura | Decisão nesta fatia |
|---|---|---|
| Host | Máquina Windows local disponível | Sonda de memória implementada e testada com relógio controlado; nenhuma regra de saúde foi inferida do uso de memória |
| Docker | Contexto local acessível; o nome Compose é compartilhado por contêineres de checkouts distintos | Proxy local temporário consultou somente `GET /containers/json`, filtrado por projeto Compose **e diretório exato** do checkout autorizado. Retornou um contêiner desse diretório, parado e sem healthcheck; rejeitou requisição sem token (`401`) e rota bruta do Engine (`404`). Sonda e SQLite registraram `indisponivel` com cobertura atual. Coleta contínua ainda não instalada |
| API | O serviço do projeto usa transporte UDP; não foi identificado endpoint HTTP de saúde autorizado | Sonda HTTP exercitada com fake, sem alvo real configurado |
| Banco | Um contêiner de banco do mesmo projeto Compose estava ativo, mas pertence a outro checkout pelo label de diretório | Nenhuma consulta SQL, leitura de credencial ou criação de papel; falta papel específico de monitoração e consulta aprovada para o checkout indicado |

Fonte: checkout e Compose do candidato indicados pelo PI, `docker info`/`docker ps` e ensaio do proxy em processo separado, todos somente leitura. Docker Engine 29 expõe `Health` na listagem; o proxy não usa `inspect`, logs, eventos, comandos administrativos ou corpo que exponha variáveis de ambiente. A resposta ao conector contém apenas nome, estado, healthcheck e horário. A observação pontual não é cobertura contínua nem valida saúde de API ou banco. Nenhum contêiner, volume, hook, agente, banco ou configuração do laboratório foi alterado. O inventário versionado e a cena de demonstração usam apenas nomes sintéticos.

O processo proxy ainda herda a permissão ampla do usuário local sobre o daemon. A autorização mínima foi comprovada **na interface do conector**, não como restrição do sistema operacional à identidade do proxy; este componente precisa de execução isolada e gestão de segredo antes de instalação contínua. O token do ensaio foi gerado em memória, não publicado nem persistido. [Detalhes e limites](docker-proxy.md).

## Escopo adicional autorizado e observado em 06/11/2026

O PI autorizou leitura pontual dos dois serviços de outros checkouts identificados pelos labels do mesmo Compose. Executei o proxy local separadamente para cada **diretório de trabalho exato**, com token efêmero em memória. As duas chamadas autenticadas a `GET /v1/snapshot` retornaram `200`, cada uma com somente o contêiner do respectivo escopo. Nenhuma rota de inspeção bruta, log, variável de ambiente ou volume foi consultada.

| Alvo autorizado | Resultado pontual | O que a evidência permite afirmar |
|---|---|---|
| Servidor de jogo do checkout adicional | Contêiner `exited` e healthcheck `unhealthy`; sem porta publicada enquanto parado | Serviço indisponível neste instante. O código expõe transporte de jogo UDP e métricas opcionais em log, não um endpoint HTTP de saúde ativo; a sonda HTTP não foi executada |
| Banco do outro checkout adicional | Contêiner `running`, healthcheck Docker `healthy`, porta limitada a loopback | Healthcheck do contêiner saudável neste instante. Não comprova consulta SQL, permissões de leitura, latência nem integridade dos dados |

O ensaio não criou conta, papel de banco, credencial, conexão SQL, processo persistente ou coleta periódica. Para a API, é necessário alvo HTTP autorizado e ativo ou um conector específico para o protocolo do serviço. A [sonda PostgreSQL](database-probe.md) está preparada e testada apenas sinteticamente; faltam papel de monitoração com permissões comprovadas, consulta aprovada e referência de segredo para medir saúde por SQL. O proxy Docker ainda requer identidade de sistema isolada e gestão de segredo para execução contínua. [A cena Unity live](unity-live.md) já consome o transporte em ensaio sintético; ela não foi alimentada por esses serviços reais.
