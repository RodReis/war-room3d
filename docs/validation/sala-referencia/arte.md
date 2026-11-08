# #29 — sala de referência: arte e luz

## Escopo e procedência

Uma única sala (`setor-01/slot-03`, projeto ilustrativo API Core) substitui o módulo provisório. As demais posições continuam provisórias. O FBX é um módulo 3D próprio, com piso segmentado, paredes recortáveis, mesa oval, holograma espacial, quatro postos, monitores, racks e vegetação. O prefab contém âncoras de câmera, UI e quatro agentes para as fatias seguintes. Nenhum agente real ou dado operacional foi adicionado por esta issue.

| Item | Origem e direitos | Tratamento |
|---|---|---|
| `art-source/reference-room/author_reference_room.py` e `ReferenceRoom.blend` | Geometria e materiais autorados para War-Room3D nesta implementação; sem modelos/texturas de terceiros | Blender 5.2.2 LTS, escala 1 unidade = 1 m, fonte editável preservada |
| `unity/Assets/WarRoom3D/Art/ReferenceRoom/ReferenceRoom.fbx` | Exportação do arquivo acima; redistribuição com este projeto | 403 malhas e 42.948 triângulos na fonte Blender e no Player |
| Materiais URP e `Prefabs/ReferenceRoom.prefab` | Gerados no Editor pelo código do projeto; redistribuição com este projeto | Onze superfícies; rugosidade/metal distintos, emissão ciano/verde controlada, luz de ambiente/tarefa/destaque |
| Capturas conceituais do PI `111020` e `111008` | Referência fornecida na conversa; direitos de redistribuição não estabelecidos | Apenas comparação local; arquivos não copiados ao Git nem usados como textura/fundo |

Hashes SHA-256 da exportação atual:

- Script de autoria: `596a9eddb42b05d0ecf63169ea6757af81dcdb2ab820cb3da2521eff127802ea`.
- Fonte `.blend`: `e71fe23a4707feb9352bacfb43c2b738af0adfe55f02e3e61bf69765e093972d`.
- FBX: `cccb1f04b6d83bd87c3f86b82bd593278b325f72198ffb1842c8ce7cec2019dd`.
- Referência `111020`: `08b117354db170cc2b90d40ffdd546db2d5c791d5a82b7e73f4ecd33f9a871eb`.
- Referência `111008`: `e1fa85a6d8f81c3c1ced869ec2541e992525a70005ccaaf53f0c93d4c867d6d1`.

Regeneração: `blender -b --factory-startup --python art-source/reference-room/author_reference_room.py -- <caminho-absoluto-do-fbx> <caminho-absoluto-do-blend>`; no Unity, executar `WarRoom3D.Editor.M0ProjectSetup.BuildWindows`. A prévia de autoria pode ser gerada com `render_preview.py`; **não é prova do Player**.

## Perfis e recorte

- **Visual:** luz ambiente, tarefa com sombra suave, dois destaques sem sombra; superfícies emissivas e recorte de parede conforme a câmera.
- **Reduzido (F8):** mantém geometria, paleta e emissivos; desliga luzes de tarefa/destaque e sombras. O mesmo projeto e o mesmo `slot-03` permanecem selecionáveis.
- Paredes frontal, posterior e laterais ficam em grupos independentes. O componente `ReferenceRoomView` oculta a parede que ficaria entre a câmera e a mesa; isso só altera renderizadores, não estado, colisões ou dados.

## Player Windows e medições pontuais

Build M0 demo no Unity `6000.3.27f1`: **pass**, 174.918.036 bytes. Build M2 Live com a mesma sala: **pass**, 174.913.961 bytes. O M0 foi rodado em janela visível a 1920×1080 na RTX 5060, Direct3D 12, com `WR3D_REFERENCE_CAPTURE_DIR` apontando para um diretório local. O capturador dev-only produziu seis PNGs e `report.json`, sem depender de serviço ou conta real. O processo encerrou com código 0 e o log registrou `Captura #29 concluida` sem exceções. Identificação do build M0: `sharedassets0.assets.resS` SHA-256 `4ff0d0fb51aec51bbb8a5dcd129ce920244353508babea3129f0d157109497c1` e `Assembly-CSharp.dll` SHA-256 `77e26dd874249f7682c78f8fc77e90e580ce3024383d70417b1519542fc30d4a`.

| Medida no Player | Visual | Reduzido | Alcance |
|---|---:|---:|---|
| p95 interno, 120 frames | 1,659 ms | 1,517 ms | Diagnóstico; não mede apresentação |
| p95 GPU interno | 1,066 ms (93 amostras) | 0,953 ms (99 amostras) | `FrameTimingManager`; amostras indisponíveis excluídas, não é tempo apresentado |
| Triângulos da sala | 42.948 | 42.948 | Geometria mantida |
| Memória das malhas da sala | 2.479.016 bytes | 2.479.016 bytes | `Profiler.GetRuntimeMemorySizeLong` dos meshes únicos |
| Memória alocada pelo driver gráfico, fim de cada perfil | 184.019.520 bytes | 181.840.448 bytes | `Profiler.GetAllocatedMemoryForGraphicsDriver`; não é VRAM medida |
| Memória total alocada, fim de cada perfil | 138.974.844 bytes | 138.808.846 bytes | Cena e Player; duas medições pontuais |

Capturas do **mesmo Player/build**, em modo demonstração sinalizado:

| Perfil | Quartel | Interior | Oposto |
|---|---|---|---|
| Visual | [PNG](capturas/visual-quartel.png) | [PNG](capturas/visual-interior.png) | [PNG](capturas/visual-oposto.png) |
| Reduzido | [PNG](capturas/reduced-quartel.png) | [PNG](capturas/reduced-interior.png) | [PNG](capturas/reduced-oposto.png) |

O ângulo oposto mostra a mesa e o holograma sem parede sobre eles. O enquadramento ainda deixa partes do setor provisório ao fundo; avaliar isso no G1. Os avatares humanos e o HUD contextual pertencem às #32 e #30, respectivamente. O antigo HUD demo permanece nas capturas e os quatro lugares estão vazios; não apresentar a imagem como experiência completa da #28.

PlayMode Unity: **13/13 pass**, incluindo a regressão de `slot-03`, âncoras, paredes recortáveis e perfil reduzido. O comando de teste precisa omitir `-quit`; com essa opção o Editor encerrou sem gerar XML. Reexecução sem `-quit`: `Logs/issue-29-playmode-full.xml`, `total=13`, `failed=0`. O relatório bruto fica no diretório local ignorado; estes resultados são os dados relevantes publicados.

## Comparação e gate G1

| Critério | Referência do PI | Prova exigida | Estado |
|---|---|---|---|
| Quartel | Seis salas, API Core destacada no alto à direita | Captura da mesma instância no Player Windows | `capturado`; avaliação artística pendente |
| Interior | Mesa oval, holograma, quatro postos, racks, plantas, paredes e luz ciano/verde | Captura Player em aproximação, lado a lado com `111020` | `capturado`; avaliação artística pendente |
| Ângulo oposto | Mesa e interação legíveis sem parede bloqueadora | Captura Player após órbita de 180°, mesma instância | `capturado`; avaliação artística pendente |
| Perfis | Identidade e legibilidade preservadas | Capturas visual/reduzido e custo de GPU, memória e triângulos | Capturas/custos pontuais `pass`; apresentação/VRAM por perfil `not_run` |
| Revisão artística PI | Comparação no Player e decisão G1 | Registro explícito de aceite/recusa e ajustes | `not_run` |

O build, testes e prévias Blender não equivalem ao G1. Medição interna de frame não substitui apresentação na tela; custo de VRAM exige instrumento próprio. A replicação para outras salas permanece bloqueada até aceite do PI no Player.
