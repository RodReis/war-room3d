# #50 — avatares do quartel vivo

Data: 11/11/2026. Estado: **candidato em PR; prova sintética no Player concluída; aceite funcional do PI pendente**.

## Implementação

- `AgentLocalProfile` grava apelido e uma das quatro apresentações somente no Player local, por projeto, sessão e agente. O identificador normalizado e o vínculo com tarefa, ferramenta, skill, chat e logs não mudam.
- Os dois modelos procedurais já versionados recebem quatro conjuntos de roupa/acessório e duas proporções de silhueta, independentes de inferência de gênero. Rótulo de nome e estado permanece sobre o avatar, inclusive sob incerteza e modo reduzido. A correção usa o nome de mesh importado pelo Unity, que acrescenta sufixos numéricos aos nomes do Blender.
- A entrada com trajeto e gesto de caminhada é composição visual. Ao chegar à estação, os quatro primeiros ocupantes assumem a postura sentada. Trabalho e espera continuam derivados do snapshot, sem eventos produzidos pela animação.
- A fixture `QuartelPreview.json` contém quatro avatares na mesma sala, identificada como demonstração. O ensaio `Issue50AvatarCapture` verifica estilos, rótulos, deslocamento, edição local e modo reduzido no executável de desenvolvimento. Uma segunda execução verifica a preferência após reiniciar e remove a preferência sintética.
- Geometria, origem e direitos dos ativos estão em `art-source/agents/README.md`; nenhum ativo de terceiro foi incluído.

## Validação

| Prova | Resultado |
|---|---|
| `git diff --check`; parse da fixture JSON | `pass` |
| Compilação C# isolada de todos os fontes `Runtime` e testes PlayMode com referências locais da Unity 6000.3.27f1/NUnit | `pass`, 0 erros; não substitui o Editor |
| Unity PlayMode `WarRoom3D.Tests.Agent*` | `pass`, 8/8, `Logs/issue-50-agent-playmode.xml` (local) |
| Build Windows Development `WarRoom3D.Editor.M2LiveProjectSetup.BuildWindowsQuartel` | `pass`, 175.698.208 bytes, Unity 6000.3.27f1, `Logs/issue-50-build-windows-2.log` (local) |
| Player sintético 1280×720 | `pass`, quatro estilos, rótulos, deslocamento medido de 0,88 m, modo reduzido com identificação preservada e edição local refletida no avatar |
| Reinício do Player | `pass`, apelido e estilo recuperados na mesma sessão/agente; preferência sintética removida ao fim, `Logs/issue-50-player-user/resultado-reinicio.txt` (local) |
| Fonte real até o Player | `not_run`. Hook local autorizado no ArenaHub instalado com backup; eventos nativos sanitizados foram capturados. Store/API e Player não foram ligados a essa fonte nesta prova. |

SHA-256 do `Builds/WarRoom3D-Quartel/WarRoom3D.exe` testado: `93043E47ABFCE89AE9D048DBF34108E101EDB367150E6203E0BCEE27CD5A623D`.
SHA-256 de `WarRoom3D_Data/Managed/WarRoom3D.Runtime.dll`: `67A6F867A105798D07D02B381CDD0DF08802C51248C995EC84F7E58D7C55D38D`.

## Evidência visual sintética

- [Vídeo do deslocamento e dos gestos](capturas/issue-50-movimento.mp4), gerado dos 18 quadros do Player.
- [Quatro avatares na sala](capturas/issue-50-quatro-avatares.png).
- [Modo reduzido](capturas/issue-50-modo-reduzido.png).
- [Apelido e apresentação alterados](capturas/issue-50-apelido-local.png).

As imagens usam exclusivamente a fixture sintética `QuartelPreview.json` e os ativos próprios descritos em `art-source/agents/README.md`. A demonstração não prova cobertura de conteúdo real, identificação de host do Claude Code nem aceite funcional do PI. A 720p, os campos de apelido e aparência ficam abaixo da dobra no painel rolável. O primeiro ensaio de edição no Player em sandbox falhou ao gravar `PlayerPrefs` no registro do Windows; a repetição no contexto do usuário passou nas duas execuções.

O hook temporário do ArenaHub permanece ativo durante a janela autorizada pelo usuário. Ao final da janela, restaurar `.claude/settings.local.json` byte a byte ao SHA-256 original `2775CB1496D074C037F5572DBF4C90291602C7A621927AEE2933C20017A0FAD2`; a configuração compartilhada não foi alterada.
