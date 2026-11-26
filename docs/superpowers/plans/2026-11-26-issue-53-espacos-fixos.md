# Espaços fixos do quartel — #53

Execução autorizada pelo PI em 26/11/2026. Escopo: [issue #53](https://github.com/RodReis/war-room3d/issues/53), especificação de 09/11 e aceite com limites da #52. Execução nesta sessão, sem aprovações intermediárias.

**Objetivo:** cafeteria e sala de reunião visitáveis independentemente de projetos e transporte.

**Arquitetura:** prefabs próprios em `Prefabs/FixedSpaces`, com identidade e descrição em `FixedSpaceView`. `SectorBuilder.FixedSpaces` é separado de `Rooms`; posições permanentes atrás da primeira fileira, sem ocupar os seis slots. `LiveHudPresenter` integra entrada por botão/teclado ou objeto, retorno, câmera e descrição sem afirmar presença do PI. Não há fonte ou captura nova de dados reais.

**Tecnologia:** Unity 6000.3.27f1, C#, UI Toolkit, Input System e testes PlayMode existentes.

## Etapas e provas

- [x] Escrever `FixedSpaceTests.cs`: instâncias e posições preservadas ao remover/reconectar projetos e trocar setor; seis vagas dinâmicas; lugar do PI sem avatar; câmera, HUD e Escape com snapshot vazio e atualização durante visita. Falha inicial registrada pelo compilador Roslyn do Unity; execução final PlayMode passou.
- [x] Criar `FixedSpaceView.cs` e `FixedSpaceAssetBuilder.cs`, gerar os dois prefabs com materiais existentes, mobiliário próprio e placa do PI. Configurar `QuartelM2Live.unity` e o gerador `M2LiveProjectSetup.cs`.
- [x] Integrar `SectorBuilder.cs`, `OrbitCamera.cs`, `RoomSceneSelection.cs`, `LiveHudPresenter.cs`, `Hud.uxml` e `Hud.uss`. Manter visita independente de seleção e eventos de projeto; botões focáveis, retorno com Escape e reset da câmera no espaço atual.
- [x] Executar EditMode e PlayMode pelo Editor batch (`-runTests -testPlatform EditMode/PlayMode`), build Windows `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsFixedSpaces` em pasta própria para preservar o Player da #52, contratos e serviço conforme CI.
- [x] Capturar Player com dados explicitamente sintéticos: visão geral, interiores e modo reduzido, zero/dois projetos, resoluções 1920×1080, 1440×900 e 1366×768. Registrar hash do executável/runtime/cena e limites em `docs/validation/quartel-vivo/issue-53.md`. Seis projetos são provados em PlayMode.
- [x] Revisar diff completo nos eixos de correção, arquitetura, legibilidade, segurança e desempenho e corrigir achados. Commits seletivos, sem incluir mudanças locais alheias.

Integração e fecho seguem o protocolo remoto: PR com `refs #53` e `refs #64`, CI no HEAD, merge confirmado e CI da main, comentário de encerramento e `proplan:done`; issues abertas para o PI. Os links e estados atuais ficam nas próprias issues.

## Decisões técnicas

Interiores autorais construídos com primitivas e materiais já distribuídos pelo projeto; sem downloads de ativos. Cafeteria com balcão, máquina de café, mesas e assentos; reunião com mesa, cadeiras, tela e referência textual ao lugar do PI. Não inserir personagens nesses espaços. As salas fixas entram no enquadramento geral mesmo sem snapshot. Atualizações de fonte continuam alimentando os projetos enquanto a visita preserva câmera e contexto.
