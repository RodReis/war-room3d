# ChatGPT Canvas, ferramentas MCP e produção de arte

**Estado em 06/11/2026:** Unity CLI/MCP, Blender MCP e Tripo CLI/MCP foram conectados e testados na M0. O [ensaio do GLB v2 e do rack sintético](validation/m0/arte-v2.md) registra o que foi importado e medido. Não houve geração pelo Tripo nem publicação de binários de arte. MCP é uma forma de operar ferramentas de autoria; não é fonte de eventos, protocolo do serviço local nem dependência do aplicativo distribuído. O runtime continua descrito em [ARCHITECTURE](ARCHITECTURE.md).

## Papel de cada ferramenta

| Ferramenta | Uso proposto | Saída verificável | Estado observado nesta sessão |
|---|---|---|---|
| ChatGPT Canvas | Rascunhar e revisar especificações, prompts e protótipos de layout | Texto/código revisado e transferido para arquivos versionados do projeto | Identidade confirmada; não há servidor MCP do Canvas identificado ou sincronização automática com o Git |
| Unity + MCP/CLI | Criar e inspecionar cenas/prefabs, importar derivados, capturar vistas e executar testes/build no Editor | Cena modular e build Windows com captura e métricas | CLI 1.0.0-beta.13 e Pipeline 0.10.0-exp.1 conectados ao Editor 6000.3.27f1; leitura, importação, captura, testes e build validados |
| Blender + MCP | Inspecionar GLB, separar/remodelar peças, corrigir pivôs/UV/materiais/LOD e exportar derivados | Arquivo fonte editável e GLB por peça, com relatório de malha | Addon 1.8 e servidor 1.30.0 validados por leitura e execução; rack sintético exportado, sem derivar do GLB v2 |
| Tripo3D | Gerar **uma peça por solicitação** a partir de prompt ou referência autorizada; enviar a peça ao Blender para revisão | GLB candidato, prompt, versão/modelo, tarefa e licença registrados | CLI/MCP 0.8.1 autenticado; inicialização e lista de ferramentas passaram; geração `not_run` por custo/direitos não definidos |

Neste projeto, “Canvas” significa **ChatGPT Canvas**, a área de edição colaborativa do ChatGPT para texto e código. Essa identificação não comprova a existência de um servidor MCP do Canvas nesta sessão. O Tripo Studio também tem um recurso chamado Agentic Canvas, mas é outro produto e não faz parte desta escolha.

## Fluxo de M0

1. Definir uma peça do kit modular do [GDD](../GDD.md): parede, porta, rack, mesa ou avatar. Um GLB de edifício inteiro não substitui salas, agentes e pontos de interação independentes.
2. Reunir referências próprias ou licenciadas em armazenamento local. Usar ChatGPT Canvas, quando acessível, para revisar o briefing, o prompt e um protótipo de layout. Transferir o resultado aprovado para os arquivos versionados; não presumir sincronização automática. Registrar autoria, permissão de derivação e decisão visual. Nunca enviar transcrições, logs, código privado, credenciais ou nomes reais de projetos a serviços de geração.
3. Criar prompt e, se aplicável, gerar **um** protótipo no Tripo3D após verificar conta, custo, direitos do plano e direitos da imagem de entrada. Guardar localmente prompt, parâmetros, identificador da tarefa, data, origem e arquivo bruto. Não automatizar lote antes de um resultado aprovado.
4. No Blender, comparar o gerado com o GLB v2 e a direção de arte: geometria limpa, escala, pivô no encaixe, UV, materiais PBR, partes separáveis e silhueta em quatro ângulos. Corrigir ou remodelar. Exportar GLB derivado com nome estável por peça e preservar o original.
5. Na Unity, importar em cena de ensaio, criar prefab com colisores e âncoras simples, confirmar materiais URP e seleção. Medir triângulos, memória e tempo de quadro no Editor **e** no build Windows. A peça só entra na sala modular após revisão visual e de licença.
6. Registrar resultado em `docs/validation/m0/arte-v2.md`: peça, fonte, licença, hashes, versões, métricas, capturas, decisão de recuperar/remodelar/descartar e limitações. Publicar binários apenas após revisão específica de direitos, conteúdo e tamanho.

O resultado de Tripo3D é um candidato artístico. Texto de painel, atividade de agentes e estados de infraestrutura continuam vindo da UI e do contrato de dados, não de textura gerada. Um avatar gerado precisa ser separado/rigado e avaliado antes de representar qualquer agente.

O ensaio reproduzível de autoria local usa `node tools/mcp-smoke.mjs blender --code-file tools/blender/m0-rack.py --output-dir docs/analise/m0-rack`, com uma sessão temporária do Blender. O script substitui os objetos da cena aberta e salva `.blend` e `.glb` no diretório ignorado; ele recusa substituir um arquivo `.blend` aberto fora desse diretório. `node tools/mcp-smoke.mjs tripo` verifica o servidor sem iniciar geração.

## Prompt base para Tripo3D

Usar o prompt abaixo **por peça**, substituindo o primeiro substantivo e as medidas após o ensaio de escala. O modelo pode ignorar instruções; a validação é obrigatória.

> Rack modular de data center futurista sóbrio para um aplicativo desktop 3D em perspectiva isométrica. Objeto único e independente, carcaça grafite, detalhes de vidro escuro, indicadores discretos azul-ciano e verde, superfícies PBR, silhueta legível de longe e de perto, frente e traseira coerentes, base plana e espaço livre para um painel de interface aplicado depois na Unity. Sem ambiente, piso, pessoas, logotipos, letras, números, telas com texto ou brilho excessivo. Topologia adequada a tempo real; preservar peças que possam ser animadas ou selecionadas separadamente.

**Variações controladas:** trocar “rack” por “segmento de parede com porta”, “mesa central com projetor independente” ou “estação de trabalho sem conteúdo nas telas”. Não pedir todo o quartel em uma única geração. Registrar prompt negativo e parâmetros efetivos no ensaio, se usados.

## Escolha do conector de autoria

- **Unity:** a documentação atual da Unity informa que o servidor MCP embutido no antigo pacote AI Assistant foi descontinuado; `unity mcp` do Unity CLI permanece suportado. No início de M0, verificar disponibilidade e compatibilidade com o Editor fixado e testar leitura de cena, captura e um teste isolado antes de editar o projeto. Um pacote MCP de terceiros só entra com versão, origem e permissões registradas.
- **Blender:** o MCP disponível neste ambiente opera o Blender em execução; precisa de addon conectado. Falha de conexão não é evidência de erro no GLB. Exportação GLB também pode ser repetida pela API oficial do Blender, se o fluxo MCP não estiver disponível.
- **Tripo3D:** a documentação oficial oferece CLI, `tripo mcp`, plugin Codex e API. A escolha é do fluxo de autoria, não do serviço do War-Room3D. O exemplo de API atual usa tarefas assíncronas e devolve um URL de GLB; não assumir que uma chamada gera um ativo pronto para jogo. Não inserir chave de API em Git, prompt, screenshot ou issue.
- **ChatGPT Canvas:** superfície de edição e revisão de documentos/código, sem ponte MCP própria verificada neste ambiente. Um rascunho só passa a ser referência do projeto depois de revisão e registro no repositório. Seu uso é opcional e não condiciona o build Unity.

## Fontes consultadas em 06/11/2026

- [Unity: substituição do servidor MCP antigo pelo Unity CLI](https://docs.unity.com/en-us/unity-cli/replace-mcp-server-unity-cli)
- [Blender: importação e exportação glTF/GLB](https://docs.blender.org/api/current/bpy.ops.export_scene.html)
- [Tripo3D: rotas CLI, MCP, plugin e API](https://www.tripo3d.ai/blog/ai-mcp)
- [Tripo3D: geração por prompt e resultado GLB](https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard)
- [Tripo3D: direitos de uso e direitos da imagem de entrada](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)
- [OpenAI: Canvas para escrita, código e revisão](https://openai.com/index/introducing-canvas/)
