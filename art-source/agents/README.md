# Avatares da sala de referência

Fonte original do projeto: `author_agents.py` gera `Agents.blend` e exporta `AgentSeated.fbx` / `AgentStanding.fbx` para `unity/Assets/WarRoom3D/Art/Agents/`. Nenhum modelo, textura, fonte ou animação de terceiros foi incorporado. Autoria por geometria procedural em Blender 5.2.2.

O rig contém ossos de cabeça, braços e pernas; as peças de malha são vinculadas rigidamente aos ossos. A Unity aplica gestos discretos de trabalho/espera ao rig e preserva a pose quando o usuário reduz efeitos. A geometria não representa estado operacional: `AgentProjection` recebe esse estado do snapshot normalizado.

Na #50, os mesmos modelos originais recebem quatro combinações locais de roupa/cabelo e duas proporções de silhueta em `AgentView.cs`. As opções de apresentação feminina/masculina são escolhas visuais do usuário; nenhuma identidade ou gênero é inferido da fonte. Entrada, trajeto e troca para a postura sentada são animados pela Unity e não geram evento operacional. Rótulo, aparência e estado são testados no Player com fixture identificada.

**Autoria e direitos:** geometria e código de autoria do projeto War-Room3D; sem ativos de terceiros. Não há licença externa de reutilização concedida para estes arquivos. Essa informação registra a proveniência dos ativos distribuídos e não amplia os direitos de uso fora do projeto.

Regeneração no Windows, com o Blender instalado no caminho padrão:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python art-source/agents/author_agents.py -- "$((Resolve-Path unity/Assets/WarRoom3D/Art/Agents).Path)" "$((Resolve-Path art-source/agents).Path)\Agents.blend"
```

Na Unity, `War-Room3D/Arte/Gerar prefabs de agentes` importa os FBX, aplica os materiais URP do projeto e gera os prefabs em `Assets/Resources/Agents/`. O build M2 chama esse gerador antes de montar a cena. Os arquivos `.blend`, `.fbx`, materiais e prefabs são versionados para inspeção e reprodução.
