# Ferramentas MCP e produção de arte

**Estado em 06/11/2026:** fluxo planejado para M0, sem geração, instalação ou importação executada. MCP é uma forma de o assistente operar ferramentas de autoria; não é fonte de eventos, protocolo do serviço local nem dependência do aplicativo distribuído. O runtime continua descrito em [ARCHITECTURE](ARCHITECTURE.md).

## Papel de cada ferramenta

| Ferramenta | Uso proposto | Saída verificável | Estado observado nesta sessão |
|---|---|---|---|
| Canvas | Identidade e finalidade a confirmar antes de atribuir função no fluxo | Entregável e formato de exportação ainda não definidos | “Canvas” não identifica um servidor único; nenhuma integração específica foi escolhida |
| Unity + MCP/CLI | Criar e inspecionar cenas/prefabs, importar derivados, capturar vistas e executar testes/build no Editor | Cena modular e build Windows com captura e métricas | Não há projeto Unity nem ferramenta Unity MCP conectada nesta sessão |
| Blender + MCP | Inspecionar GLB, separar/remodelar peças, corrigir pivôs/UV/materiais/LOD e exportar derivados | Arquivo fonte editável e GLB por peça, com relatório de malha | Ferramenta MCP listada, mas o addon do Blender não respondeu à checagem de conexão |
| Tripo3D | Gerar **uma peça por solicitação** a partir de prompt ou referência autorizada; enviar a peça ao Blender para revisão | GLB candidato, prompt, versão/modelo, tarefa e licença registrados | CLI/MCP oficiais documentados; nenhum servidor Tripo3D conectado ou geração executada |

“Canvas” também é nome de recurso do Tripo Studio, além de outros produtos. O fluxo não presume que o usuário se referia a ele. A ferramenta e seu identificador MCP serão registrados depois da confirmação, sem alterar a arquitetura do runtime por inferência.

## Fluxo de M0

1. Definir uma peça do kit modular do [GDD](../GDD.md): parede, porta, rack, mesa ou avatar. Um GLB de edifício inteiro não substitui salas, agentes e pontos de interação independentes.
2. Reunir referências próprias ou licenciadas em armazenamento local; usar Canvas somente após identificar a ferramenta e seu papel. Registrar autoria, permissão de derivação e decisão visual. Nunca enviar transcrições, logs, código privado, credenciais ou nomes reais de projetos a serviços de geração.
3. Criar prompt e, se aplicável, gerar **um** protótipo no Tripo3D após verificar conta, custo, direitos do plano e direitos da imagem de entrada. Guardar localmente prompt, parâmetros, identificador da tarefa, data, origem e arquivo bruto. Não automatizar lote antes de um resultado aprovado.
4. No Blender, comparar o gerado com o GLB v2 e a direção de arte: geometria limpa, escala, pivô no encaixe, UV, materiais PBR, partes separáveis e silhueta em quatro ângulos. Corrigir ou remodelar. Exportar GLB derivado com nome estável por peça e preservar o original.
5. Na Unity, importar em cena de ensaio, criar prefab com colisores e âncoras simples, confirmar materiais URP e seleção. Medir triângulos, memória e tempo de quadro no Editor **e** no build Windows. A peça só entra na sala modular após revisão visual e de licença.
6. Registrar resultado em `docs/validation/m0/arte-v2.md`: peça, fonte, licença, hashes, versões, métricas, capturas, decisão de recuperar/remodelar/descartar e limitações. Publicar binários apenas após revisão específica de direitos, conteúdo e tamanho.

O resultado de Tripo3D é um candidato artístico. Texto de painel, atividade de agentes e estados de infraestrutura continuam vindo da UI e do contrato de dados, não de textura gerada. Um avatar gerado precisa ser separado/rigado e avaliado antes de representar qualquer agente.

## Prompt base para Tripo3D

Usar o prompt abaixo **por peça**, substituindo o primeiro substantivo e as medidas após o ensaio de escala. O modelo pode ignorar instruções; a validação é obrigatória.

> Rack modular de data center futurista sóbrio para um aplicativo desktop 3D em perspectiva isométrica. Objeto único e independente, carcaça grafite, detalhes de vidro escuro, indicadores discretos azul-ciano e verde, superfícies PBR, silhueta legível de longe e de perto, frente e traseira coerentes, base plana e espaço livre para um painel de interface aplicado depois na Unity. Sem ambiente, piso, pessoas, logotipos, letras, números, telas com texto ou brilho excessivo. Topologia adequada a tempo real; preservar peças que possam ser animadas ou selecionadas separadamente.

**Variações controladas:** trocar “rack” por “segmento de parede com porta”, “mesa central com projetor independente” ou “estação de trabalho sem conteúdo nas telas”. Não pedir todo o quartel em uma única geração. Registrar prompt negativo e parâmetros efetivos no ensaio, se usados.

## Escolha do conector de autoria

- **Unity:** a documentação atual da Unity informa que o servidor MCP embutido no antigo pacote AI Assistant foi descontinuado; `unity mcp` do Unity CLI permanece suportado. No início de M0, verificar disponibilidade e compatibilidade com o Editor fixado e testar leitura de cena, captura e um teste isolado antes de editar o projeto. Um pacote MCP de terceiros só entra com versão, origem e permissões registradas.
- **Blender:** o MCP disponível neste ambiente opera o Blender em execução; precisa de addon conectado. Falha de conexão não é evidência de erro no GLB. Exportação GLB também pode ser repetida pela API oficial do Blender, se o fluxo MCP não estiver disponível.
- **Tripo3D:** a documentação oficial oferece CLI, `tripo mcp`, plugin Codex e API. A escolha é do fluxo de autoria, não do serviço do War-Room3D. O exemplo de API atual usa tarefas assíncronas e devolve um URL de GLB; não assumir que uma chamada gera um ativo pronto para jogo. Não inserir chave de API em Git, prompt, screenshot ou issue.
- **Canvas:** confirmar nome/link do servidor antes de configurar ferramenta, formato de exportação ou automação.

## Fontes consultadas em 06/11/2026

- [Unity: substituição do servidor MCP antigo pelo Unity CLI](https://docs.unity.com/en-us/unity-cli/replace-mcp-server-unity-cli)
- [Blender: importação e exportação glTF/GLB](https://docs.blender.org/api/current/bpy.ops.export_scene.html)
- [Tripo3D: rotas CLI, MCP, plugin e API](https://www.tripo3d.ai/blog/ai-mcp)
- [Tripo3D: geração por prompt e resultado GLB](https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard)
- [Tripo3D: direitos de uso e direitos da imagem de entrada](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)
