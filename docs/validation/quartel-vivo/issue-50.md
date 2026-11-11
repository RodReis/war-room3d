# #50 — avatares do quartel vivo

Data: 11/11/2026. Estado: **candidato em branch; sem prova visual no Player e sem aceite funcional**.

## Implementação candidata

- `AgentLocalProfile` grava apelido e uma das quatro apresentações somente no Player local, por projeto, sessão e agente. O identificador normalizado e o vínculo com tarefa, ferramenta, skill, chat e logs não mudam.
- Os dois modelos procedurais já versionados recebem quatro conjuntos de roupa/acessório e duas proporções de silhueta, independentes de inferência de gênero. Rótulo de nome e estado permanece sobre o avatar, inclusive sob incerteza e modo reduzido.
- A entrada com trajeto e gesto de caminhada é composição visual. Ao chegar à estação, os quatro primeiros ocupantes assumem a postura sentada. Trabalho e espera continuam derivados do snapshot, sem eventos produzidos pela animação.
- A fixture `QuartelPreview.json` foi ampliada para quatro avatares na mesma sala. Ela é identificada como demonstração. `Issue50AvatarCapture` verifica estilos, rótulos e deslocamento no executável de desenvolvimento e gera quadros e uma imagem em modo reduzido.
- Geometria, origem e direitos dos ativos estão em `art-source/agents/README.md`; nenhum ativo de terceiro foi incluído.

## Validação até aqui

| Prova | Resultado |
|---|---|
| `git diff --check`; parse da fixture JSON | `pass` |
| Compilação C# isolada de todos os fontes `Runtime` em configuração `DEVELOPMENT_BUILD` com referências locais da Unity 6000.3.27f1 | `pass`, 0 erros; avisos de campos serializados não atribuídos nesse compilador externo |
| Compilação C# isolada de `Runtime` e fontes PlayMode com NUnit local | `pass`, 0 erros; **não executa testes nem valida importação de ativos** |
| Unity PlayMode `WarRoom3D.Tests.Agent*` | `not_run`: Editor recusou a sessão sem licença válida. Tentativa com Hub aberto perdeu a conexão com Licensing Client e entrou em reconexões; processo interrompido após a repetição. Logs locais em `Logs/issue-50-agent-playmode*.log`. |
| Build Windows, captura/vídeo da fixture, leitura humana e modo reduzido no Player | `not_run`: dependem do Editor licenciado. SHA do executável da #50 indisponível. |
| Fonte real até o Player | `not_run`. O hook local autorizado no ArenaHub foi instalado com backup da configuração anterior, e o comando passou em entrada sintética separada. Houve eventos nativos de sessão nova no spool sanitizado; conteúdo de prompt, resposta e comando não foi persistido nem lido para esta prova. Store/API e Player não foram acionados. |

Nenhum resultado do compilador externo substitui PlayMode, build Windows ou inspeção visual. A branch/PR permanece aberta até a prova aplicável ou decisão explícita do PI sobre o impedimento externo. O hook temporário do ArenaHub deve ser removido após a janela de prova, restaurando `.claude/settings.local.json` byte a byte ao SHA-256 original `2775CB1496D074C037F5572DBF4C90291602C7A621927AEE2933C20017A0FAD2`; a configuração compartilhada não foi alterada.
