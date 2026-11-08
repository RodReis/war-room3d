# #32 — avatares e atividade da sala de referência

## Escopo

Dois modelos humanos estilizados originais, sentado e em pé, com rig editável e gestos discretos. `AgentProjection` deriva lista, detalhe e corpos do mesmo snapshot normalizado. A seleção pela lista ou pelo corpo usa `agentKey`; o foco mantém a sala visível e uma linha liga filho ao pai somente quando ambos estão observados. Até 12 agentes aparecem individualmente; os demais entram em marcador com contagem e permanecem na lista completa. Sem sessão, nenhum avatar aparece. Encerramento explícito remove o corpo; perda de fonte o mantém opaco e incerto, sem declarar conclusão.

O painel mostra provedor, `sourceId` quando disponível, último sinal, tarefa com proveniência e ferramenta/skill vinculadas por **sessão e agente exatos**. Campos sem evidência ficam não observados; não se faz associação por coincidência de horário. A flag de efeitos reduzidos e o perfil reduzido da sala congelam os gestos; não geram evento operacional. Modelos/gestos são visuais, não fontes de estado.

## Origem dos ativos

`art-source/agents/author_agents.py` e `Agents.blend` foram criados para esta fatia com Blender 5.2.2. Os dois FBX, oito materiais URP e prefabs são derivados dessa fonte; sem modelos, texturas, animações ou fontes externas. [Instruções de reprodução](../../../art-source/agents/README.md). SHA-256: script `c1695819438594e0889aa98924e474e7939ddfa81c07ad401df66a3311baea34`, `.blend` `567714556932d81c65584cf95df47d35086e68b4ec12741d1a99796b4fed2bfe`, FBX sentado `a403978fea8a47adc40ccc93007db1c7cdc9f9a4ef076dccddd08912443b4b57`, FBX em pé `c87a4ab6a0dece8de2f1c1718c094c2fe8142b59f6e952b44f91e280fe7abbc4`.

## Validação técnica

| Prova | Resultado | Evidência local |
|---|---|---|
| Contratos | **14/14 pass** | `npm test` em `contracts` |
| Serviço | **162/162 pass** e typecheck **pass**; regressão de `sourceId` 13/13 | `npm test`, `npm run typecheck`, `node --test test/store.test.ts` em `service` |
| Unity PlayMode | **22/22 pass** | `Logs/issue-32-playmode-release-candidate.xml`; projeção por projeto, pai ausente, perda de fonte, tarefas/invocações exatas, rig, movimento reduzido e clique por raio |
| Player Windows de desenvolvimento | **pass**, 175.555.608 bytes | `Logs/issue-32-build-release-candidate.log`; `WarRoom3D.Runtime.dll` SHA-256 `a35ff8dd3fecc26340f208fc78d53caabd3ddf0bcf2bce8559634e11afa1c049` |
| Player + serviço local sintético | **10/10 pass**, saída 0, conexão e capturas 1280×720 | `node service/scripts/issue-32-player-proof.mjs <cenario> <diretorio>`; relatórios brutos em `Logs/issue-32-player-release-candidate/` |

Todas as dez capturas vieram do mesmo build Windows acima. Foram inspecionadas em resolução original. `snapshotToHudMs` foi de 424 a 450 ms nas execuções pontuais; os 120 frames de cada captura não constituem o ensaio RNF-01 de 10 eventos/s nem o RNF-02 de apresentação por 10 minutos. Logs, DB em memória e relatórios brutos ficam fora do Git; PNGs publicáveis contêm apenas dados sintéticos.

## Matriz visual do Player

| Cenário | Resultado observado | Captura |
|---|---|---|
| Trabalho, duas principais + filho | 3 sessões, 3 corpos, 1 vínculo; painel separa presentes de trabalhando | [sala](issue-32-working.png) |
| Ângulo oposto | Mesma sala e 3 corpos, outra câmera | [ângulo oposto](issue-32-opposite.png) |
| Seleção do filho | `agent-child` selecionado, linha pai-filho ativa e sala ainda enquadrada | [foco](issue-32-childFocus.png) |
| Detalhe do filho | Origem `source-codex`, horário, tarefa, proveniência e falha de ferramenta; demais linhas acessíveis pela rolagem | [detalhe](issue-32-child.png) |
| Modo reduzido | 3 corpos preservados, gestos estáticos, controle `Reduzir efeitos: sim` | [reduzido](issue-32-reduced.png) |
| Sem sessão | 0 corpos e nenhum agente presente | [vazio](issue-32-empty.png) |
| Espera | 3 corpos, estado `Aguardando` | [espera](issue-32-waiting.png) |
| Fonte perdida | 3 corpos atenuados; 0 presentes confirmados e 3 incertos | [incerto](issue-32-unknown.png) |
| Encerramento explícito | 0 corpos; histórico de sessões não vira presença operacional | [encerrado](issue-32-ended.png) |
| 14 agentes | 12 corpos, marcador `+2`, lista completa | [agrupamento](issue-32-overflow.png) |

## Limites

Prova inteiramente sintética: não demonstra avatares ligados continuamente a contas pessoais nem satisfaz o G3 real completo da #35. O Player da #31 recebeu o vínculo real pai-filho; esta fatia valida sua representação com o mesmo contrato, por dados sintéticos. Apenas `setor-01/slot-03` tem o prefab final da sala; as demais posições seguem provisórias. `sourceId` é opcional no contrato para preservar snapshots anteriores/replay. Nomes humanos não existem no snapshot: a lista mostra papel, provedor e sufixo da chave opaca. Aceite visual/funcional do PI e replicação para outras salas seguem pendentes.
