# #48 — regressão de isolamento por fonte

Revisão focada na PR #58. Ambiente: Windows, Node.js 24, fixture sintética em SQLite local. Comando: `node --test test/room-lifecycle.test.ts` em `service/`, usando o executável Node 24. Resultado final: **pass, 7/7, 0 falhas**. A suíte completa do serviço passou 182/182 e contratos 17/17.

O teste de escopo verifica quatro eventos recusados antes da projeção: projeto diferente do vínculo, versão da fonte divergente, provedor divergente e sessão de fonte sem vínculo após a configuração de fontes. A quarentena contém quatro entradas e o snapshot continua sem salas. A mesma suíte verifica que evento anterior à perda da fonte não reativa a sala incerta.

O arquivo `AgentPresenter.cs` foi inspecionado no diff: a mudança remove referências de views Unity já destruídas durante a reconciliação e testa `null` antes de `Destroy`. Não altera entrada externa, capacidades de agentes, envio de comandos ou autorização. PlayMode passou 26/26 no build validado.

Após a revisão da PR, foram adicionadas duas regressões: replay de `workspace.opened` já persistido com sala ativa e fechamento posterior; e perda de fonte comparada cronologicamente a aberturas com segundos inteiros e fracionários. Ambas falharam antes da correção e passaram depois. O conjunto de salas e histórico passou 45/45; a projeção histórica confia apenas nos IDs dos eventos lidos do store persistido, enquanto a ingestão live continua validando o vínculo.

Limite: esta é regressão focada e revisão do diff, não um scanner de dependências ou teste com provedor real. A CI da PR executa contratos, serviço e tipagem no SHA publicado; seu resultado deve ser conferido separadamente.
