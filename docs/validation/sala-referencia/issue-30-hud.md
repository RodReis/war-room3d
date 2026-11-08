# #30 — HUD contextual e navegação no Player

## Entrega

O HUD mostra cabeçalho e breadcrumb compactos, etiqueta da sala, resumo lateral recolhível, lista de agentes com seleção textual, abas Atividade/Chat/Logs/Fontes e detalhe sob demanda. Esc fecha primeiro o detalhe, depois a sala; o projeto selecionado é preservado. O painel de interação M4 mantém alvo e título fixos, corpo rolável e ações visíveis. O arrasto da câmera cessa ao entrar sobre a UI.

Na demonstração, todo conteúdo é ilustrativo e sinalizado. A fixture `API Core` exibe dois agentes principais, subagentes, tarefa, ferramenta, skill e log fictícios no detalhe. No estado live/replay, a lista usa IDs de agente/sessão, origem e frescor do snapshot; tarefa, ferramenta e skill aparecem como indisponíveis quando o contrato não os fornece. Chat e logs não são apresentados como fonte operacional nesta fatia.

## Validação técnica

| Prova | Resultado | Alcance |
|---|---|---|
| Unity 6000.3.27f1 PlayMode | 16/16 pass (`Logs/issue-30-playmode-verified.xml`) | Seleção/retorno/Esc, detalhe, abas, resumo, seleção da sala importada sem colisor físico e input da câmera sobre UI. |
| Unity EditMode | 15/15 pass (`Logs/issue-30-editmode.xml`) | Regressão dos contratos locais existentes. |
| Serviço | `npm run typecheck` pass; `npm test` 130/130 pass | Contrato e comportamento do serviço existente. |
| Player Windows M0 | Build pass, 174.946.847 bytes (`Logs/issue-30-build-final3.log`) | Demonstração isolada, sem serviço real. |
| Player Windows M4 | Build pass, 174.942.770 bytes (`Logs/issue-30-build-m4-final3.log`) | Laboratório com adaptador fake. |

Os arquivos `Logs/` são evidência bruta local ignorada pelo Git. Os PNGs abaixo foram capturados no Player Windows e versionados para revisão.

## Matriz visual

O Player de demonstração passou no build final em 1920×1080 e 1440×900 com escalas de UI 1,00/1,25/1,50 e em 1366×768 com escala 1,00: sete combinações, cada uma com quartel, interior, detalhe e resumo recolhido. A inspeção das 28 imagens não encontrou título ou ação crítica cortados. O laboratório M4 passou nas mesmas sete combinações com pedido longo e modal aberto; uma execução adicional em 1280×720 passou. A configuração 1440×900/1,50 foi repetida no build M4 final (`Logs/issue-30-m4-modal/final3-1440x900-15`), com `playerExitCode=0`, `sends=1` e `pass=true`. A prévia e os bloqueios de replay/troca de projeto foram exercitados; cada execução enviou exatamente um comando ao adaptador fake. Nenhum provedor real recebeu comando.

| Vista representativa | Captura |
|---|---|
| Quartel, 1366×768 | [PNG](capturas/hud-30-quartel-1366.png) |
| Interior, 1440×900, escala 1,50 | [PNG](capturas/hud-30-sala-1440-150.png) |
| Detalhe, 1920×1080, escala 1,50 | [PNG](capturas/hud-30-detalhe-1920-150.png) |
| Resumo recolhido, 1920×1080 | [PNG](capturas/hud-30-resumo-1920.png) |
| Modal com pedido longo, 1440×900, escala 1,50 | [PNG](capturas/hud-30-modal-1440-150.png) |

A matriz altera `PanelSettings.scale` no Player. É simulação de escala da UI, não medição com Windows configurado fisicamente em 125%/150%. As imagens são prova de layout renderizado e não aceite visual/funcional do PI. A seleção de agente por lista compartilha o estado de navegação; vínculo com avatar clicável na cena depende da #32. A atividade normalizada depende da #31, chat da #33 e logs da #34. O G2 da #35 exige a jornada completa no Player.

Durante a validação, o build M0 deixou apenas sua cena na lista ativa do Editor; seis testes live falharam por cena ausente. O build M4 recompôs ambas as cenas e a suíte final passou 16/16. Os arquivos de cena e configuração gerados pelo build foram restaurados antes do commit.
