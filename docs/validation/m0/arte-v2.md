# Ensaio local do GLB v2

Data: 06/11/2026. Fonte local: `docs/arte/war-room3d-v2.glb`, 62.645.756 bytes, SHA-256 `e77ad1ad6ebaa862cfc6d1bc66846776b6893fbb288e56da07ecd8b955499dbb`. Os metadados do arquivo indicam geração pelo Tripo; licença e autorização de redistribuição não estão documentadas. O GLB, a cena de ensaio e as capturas do modelo permanecem ignorados pelo Git.

## Resultado no Unity

O glTFast 6.20.0 importou o arquivo como `GameObject` em `Assets/LocalArt/war-room3d-v2.glb`. `AssetDatabase.LoadAllAssetsAtPath` encontrou um `Mesh`, um `Material` e três `Texture2D`. A malha possui **1.886.287 triângulos**, o mesmo total da inspeção estrutural anterior. Uma cena local `EnsaioGlbV2.unity` instanciou o prefab e produziu captura por câmera no Editor. O modelo aparece com geometria e textura; a captura permanece em `docs/analise/glb-v2/unity-import.png` no workspace local.

O importador registrou avisos de extensão não suportada para `KHR_materials_volume` e `FB_ngon_encoding`. A importação não falhou, mas essa observação não valida fidelidade integral do material ou compatibilidade de todos os dados do GLB.

| Medida | Resultado |
|---|---|
| Geometria no Unity | 1 malha; 1.886.287 triângulos |
| Texturas importadas | 3 |
| Tempo de quadro do GLB no Editor | `not_run` |
| Tempo de quadro do GLB em build | `not_run` |
| Memória reportada para malha e texturas no Editor | 455.060.818 bytes (~434 MiB) somados via `Profiler.GetRuntimeMemorySizeLong` |
| Memória/VRAM incremental do processo | `not_run` |
| GLB no build M0 | Não incluído |

## Decisão para a M0

O valor de memória acima soma uma malha (141.839.616 bytes) e três texturas (156.631.981, 89.479.423 e 67.109.798 bytes) carregadas como assets no Editor. É uma estimativa de tamanho desses assets na sessão, não mede aumento de RAM do processo, VRAM, pico de importação nem custo no player.

O GLB v2 tem quatro salas periféricas visíveis e uma malha única, sem hierarquia que permita selecionar, apagar ou ampliar salas independentemente. A cena entregue usa seis módulos geométricos separados e um núcleo. O GLB serve como referência de composição até haver licença, limpeza de conteúdo, classificação de peças, otimização e medição de desempenho. Nenhuma peça foi extraída ou remodelada a partir dele neste ensaio.

## Peça modular sintética pelo Blender MCP

O script versionado [`tools/blender/m0-rack.py`](../../../tools/blender/m0-rack.py) modelou um rack próprio, sem usar ou derivar geometria do GLB v2. A chamada `node tools/mcp-smoke.mjs blender --code-file tools/blender/m0-rack.py --output-dir docs/analise/m0-rack` executou `execute_blender_code` no Blender 5.2.2 (addon 1.8, servidor MCP 1.30.0). O `.blend` fonte e o `.glb` exportado permanecem em `docs/analise/m0-rack/`, ignorados pelo Git. O GLB local tem 23.556 bytes, SHA-256 `231820221111b21f6a03ee5ea1422340df13984e4062c526c7b61875690e55ac`.

O rack mede 1,20 × 0,68 × 2,20 m, com pivô no centro da base, 15 partes separadas, 180 triângulos e três materiais PBR simples. O Unity importou 15 meshes (12 triângulos cada) e três materiais; a cena local `EnsaioRackM0.unity` confirmou dimensões no espaço Unity, renderização pela URP, `BoxCollider` na raiz e `FrontPanelAnchor`. Um raycast da câmera atingiu o colisor. A captura de conferência está em `docs/analise/m0-rack/unity-import.png`, também ignorada.

| Medida | Resultado |
|---|---|
| Malhas/triângulos Unity | 15 / 180 |
| Memória das malhas no Editor | 48.600 bytes somados via `Profiler.GetRuntimeMemorySizeLong` |
| Tempo de quadro Editor/build com a peça | `not_run` |
| Memória/VRAM incremental do processo | `not_run` |
| Peça no build M0 | Não incluída |

A peça prova o caminho de autoria e importação local. Sua aparência ainda precisa de revisão do PI antes de uso na sala modular; o ensaio não comprova desempenho no build. O tamanho de memória das malhas não inclui materiais, estruturas do importador nem overhead do processo.

A geração Tripo por prompt ficou `not_run`: custo por tarefa, licença de saída e aprovação da referência não foram definidos para consumo dos créditos da conta. Esses itens de arte ficam explícitos para uma fatia posterior; não são pré-requisito para executar a cena modular M0.
