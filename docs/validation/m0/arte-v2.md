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
| Memória/VRAM incremental do GLB | `not_run` |
| GLB no build M0 | Não incluído |

## Decisão para a M0

O GLB v2 tem quatro salas periféricas visíveis e uma malha única, sem hierarquia que permita selecionar, apagar ou ampliar salas independentemente. A cena entregue usa seis módulos geométricos separados e um núcleo. O GLB serve como referência de composição até haver licença, limpeza de conteúdo, classificação de peças, otimização e medição de desempenho. Nenhuma peça foi extraída ou remodelada a partir dele neste ensaio.

O Blender MCP foi validado por leitura de cena, mas não houve tratamento de peça. A geração Tripo por prompt ficou `not_run`: custo por tarefa, licença de saída e aprovação da referência não foram definidos para consumo dos créditos da conta. Esses itens de arte ficam explícitos para uma fatia posterior; não são pré-requisito para executar a cena modular M0.
