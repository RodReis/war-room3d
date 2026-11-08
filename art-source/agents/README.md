# Avatares da sala de referência

Fonte original do projeto: `author_agents.py` gera `Agents.blend` e exporta `AgentSeated.fbx` / `AgentStanding.fbx` para `unity/Assets/WarRoom3D/Art/Agents/`. Nenhum modelo, textura, fonte ou animação de terceiros foi incorporado. Autoria por geometria procedural em Blender 5.2.2.

O rig contém ossos de cabeça, braços e pernas; as peças de malha são vinculadas rigidamente aos ossos. A Unity aplica gestos discretos de trabalho/espera ao rig e preserva a pose quando o usuário reduz efeitos. A geometria não representa estado operacional: `AgentProjection` recebe esse estado do snapshot normalizado.

Regeneração no Windows, com o Blender instalado no caminho padrão:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python art-source/agents/author_agents.py
```

Na Unity, `War-Room3D/Arte/Gerar prefabs de agentes` importa os FBX, aplica os materiais URP do projeto e gera os prefabs em `Assets/Resources/Agents/`. O build M2 chama esse gerador antes de montar a cena. Os arquivos `.blend`, `.fbx`, materiais e prefabs são versionados para inspeção e reprodução.
