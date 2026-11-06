# M2 — levantamento do laboratório autorizado

Data: 06/11/2026. O PI indicou um checkout local em desenvolvimento como candidato de laboratório para observação. Esta nota publica somente categorias e limites; nomes de recursos, endereços e credenciais do ambiente não são incluídos.

| Categoria | Evidência de leitura | Decisão nesta fatia |
|---|---|---|
| Host | Máquina Windows local disponível | Sonda de memória implementada e testada com relógio controlado; nenhuma regra de saúde foi inferida do uso de memória |
| Docker | Contexto local acessível; um banco do projeto estava ativo, mas o servidor de aplicação não estava | Inspeção pontual por CLI; conector contínuo desabilitado. Acesso ao daemon continua amplo e não foi comprovado proxy de leitura com escopo mínimo |
| API | O serviço do projeto usa transporte UDP; não foi identificado endpoint HTTP de saúde autorizado | Sonda HTTP exercitada com fake, sem alvo real configurado |
| Banco | Banco local ativo segundo o healthcheck do contêiner | Nenhuma consulta SQL, leitura de credencial ou criação de papel; falta papel específico de monitoração e consulta aprovada |

Fonte: checkout e Compose do candidato indicados pelo PI, mais `docker info`/`docker ps` em leitura. A observação pontual não é cobertura contínua nem valida saúde de API ou banco. Nenhum contêiner, volume, hook, agente, banco ou configuração do laboratório foi alterado. O inventário versionado e a cena de demonstração usam apenas nomes sintéticos.

Para ativar conectores reais em outra fatia: registrar alvo por ambiente, fonte, capacidade de leitura comprovada, credencial opaca protegida quando necessária, intervalo, timeout e evidência de revogação. O transporte M1/Unity live também precisa estar disponível.
