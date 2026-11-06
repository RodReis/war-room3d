# M2 — cena Unity live

A cena `QuartelM2Live` consome `snapshot.v1` do serviço local e usa avisos SSE para buscar um novo snapshot. Ela não inclui os carregadores de demonstração nem apresenta a fixture M2 como dado observado. O build Windows desta fatia contém somente essa cena; a cena demonstrativa permanece disponível no projeto Unity.

O cliente aceita apenas `WR3D_SERVICE_URL=http://127.0.0.1:<porta>` e `WR3D_SERVICE_TOKEN` com pelo menos 32 bytes. A URL e o token devem corresponder ao serviço de leitura documentado em [transporte](transport.md). Sem configuração ou conexão, o painel mostra `Sem conexão` e `Sem dados`. Com conexão perdida após um snapshot, informa que o estado exibido é o último snapshot e não mantém um selo de saúde atual. Se o stream ficar 45 segundos sem receber dados, o cliente encerra a conexão e tenta buscar um novo snapshot. A seleção de projeto filtra recursos por dependência declarada; o detalhe de recurso mostra ambiente, indicador, fonte, horário, frescor, cobertura, evidência e projetos dependentes.

## Validação sintética em 06/11/2026

- EditMode `pass` 9/9: parser rejeita `mode=demo`, estado saudável sem frescor/cobertura atual e incidente com projeto desconhecido; parser SSE aceita quadros fragmentados e limita o tamanho. Comando: `unity test ./unity --mode EditMode --output Logs/m2-live-editmode-final.xml --timeout 240`.
- PlayMode `pass` 7/7: cena sem serviço inicia vazia, sem carregadores de fixture; um snapshot sintético exibe recurso degradado e impacto potencial sem agentes, e cobertura perdida remove a classificação de saúde atual. Comando: `unity test ./unity --mode PlayMode --output Logs/m2-live-playmode-final.xml --timeout 240`.
- PlayMode de transporte, incluído na suíte: servidor sintético em loopback entrega snapshot degradado, avisa `resource.changed` por SSE e entrega snapshot saudável; o painel muda apenas após a nova leitura. O teste exige token e exercita a cena completa.
- Build Windows x64 de desenvolvimento `pass`, 172.229.542 bytes: `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsM2Live` gera `unity/Builds/WarRoom3D-M2-Live/WarRoom3D.exe` localmente. Log: `Logs/m2-live-build-final.log`.

**Limites:** esse ensaio não observa API ou banco reais. A prova de transporte usa servidor e inventário sintéticos. Não há captura visual do Player, medição de frame time, ensaio de latência sob carga ou aceite funcional do PI nesta fatia. Apenas posições do primeiro setor com slots físicos existentes são navegáveis em 3D; os demais projetos continuam listados no HUD.
