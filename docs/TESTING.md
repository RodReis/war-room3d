# Estratégia de validação

## Estado e princípio

A M0 tem código e provas em `docs/validation/m0/resultado.md`. A primeira fatia M1 tem [provas sintéticas](validation/m1/contrato-store.md) e a M2 tem [provas de domínio e demonstração](validation/m2/resultado.md). Os demais cenários definem provas, não resultados executados. Cada relatório informa `pass`, `fail` ou `not_run`, versão do código, ambiente, comando e evidência. Um check verde de CI não substitui aceite visual e funcional.

| Etapa | Provas essenciais |
|---|---|
| M0 | Fixture/schema, seis módulos, mesma sala em três vistas, órbita/zoom, HUD, build Windows |
| M1 | Identidades, duas sessões e subagente, deduplicação, reinício, reconexão, perda de fonte |
| M2 | Vínculo muitos-para-muitos, sem dados, coletor perdido, recurso compartilhado, infraestrutura sem agentes |
| M3 | Merge/CI por entidade, Meu dia com fuso/lacuna, replay isolado |
| M4 | Capacidade por provedor, prazo, idempotência, timeout incerto, auditoria e rejeição demo/replay |
| M5 | Redação antes da persistência, paginação/retensão, isolamento por ambiente/projeto, correlação exata por trace/span/request ID, cobertura por fonte, regras imutáveis e incidente que não se resolve com perda de coleta |

Testes unitários cobrem regras determinísticas; integração cobre SQLite, HTTP/SSE e adaptadores com fakes controlados; Unity EditMode/PlayMode cobre cena/input/UI. E2E real exige fonte e laboratório autorizados. Prova visual inclui captura com versão, resolução, câmera/estado e descrição do que a imagem demonstra. Dados sintéticos devem estar marcados; não usar sessões pessoais para fazer o CI passar.

As provas atuais de M5 ficam em [laboratório](validation/m5/laboratorio.md) e [resultado](validation/m5/resultado.md). `m5NetworkSignals` é opt-in, deriva somente health/latência da sonda API M2 e exige retenção explícita. Nenhuma prova sintética é apresentada como conexão de logs, rastros ou detecção real.

## Relatório por SPEC/issue

Guardar em `docs/validation/<etapa>/resultado.md`: issue/PR/SHA, comando, resultado, total de casos, falhas, ambiente, evidência e limitações. Artefatos brutos volumosos podem ficar no CI, com link e retenção registrada. Se não houver SPEC numerada, usar a issue da etapa; não inventar identificador.

Ao alterar testes ou geradores, verificar que uma falha deliberada é detectada pelo gate antes de confiar no novo relatório. Correção de bug verificável deve ter regressão; se não for viável, justificar e anexar prova alternativa.

## Sala de referência — #28 e #35

Aplicar a [especificação](specs/2026-11-08-sala-referencia-design.md) e o [plano](superpowers/plans/2026-11-08-sala-referencia-player.md). As provas parciais de [arte](validation/sala-referencia/arte.md), [HUD](validation/sala-referencia/issue-30-hud.md), [observação](validation/sala-referencia/issue-31-observacao.md), [avatares](validation/sala-referencia/issue-32-avatares.md), [chat](validation/sala-referencia/issue-33-chat.md) e [logs](validation/sala-referencia/issue-34-logs.md) estão registradas; G1–G4 completos seguem pendentes. Guardar manifesto, roteiro, matriz por provedor e resultado em docs/validation/sala-referencia/ na implementação.

- G1: arte no Player, quartel/interior/ângulo oposto da mesma instância, comparação ao conceito e revisão do PI.
- G2: jornada controlada identificada, seleção/atividade/chat/pedido/log/evidência/retorno e negativos.
- G3: duas principais Claude/Codex, subagente real, atividade/skills expostas, chat de ida/volta por provedor e fonte real de logs, em laboratório especificamente autorizado; correlação até Player. Obrigatório sem suporte exige decisão do PI, não PASS automático.
- G4: mesmo build final, hash/SHA, ambiente, matriz de fontes, capturas e decisão explícita do PI. Nada de replicar acabamento antes do aceite.
- RNF-01: p95 ≤2 s em 10 eventos/s; RNF-02: 1080p/10 minutos, apresentação p95 ≤16,67 ms visual e ≤33,33 ms reduzido; perda de amostras, CPU/GPU/memória e janela visível registradas. FPS interno não substitui apresentação. Relacionar #16.
- RNF-06: 1920×1080 e 1440×900 em 100/125/150%, mais regressão 1366×768; contexto/ações legíveis e input de UI separado da câmera.

Para medir RNF-01/02 no Windows com PresentMon 2.6.0, usar o lançador do projeto abaixo. Ele valida Player, binário do PresentMon e saídas novas em `Logs/`; solicita **um UAC** para os três perfis quando `-Profile all` é usado sem token administrativo. A permissão ETW é do Windows, não de `ProjectSettings` do Unity. `-Describe` mostra os caminhos sem elevar nem iniciar a medição. UAC negado ou perfil reprovado gera erro; não reutilizar o prefixo de saída.

```powershell
New-Item -ItemType Directory -Path ./Logs/issue-35-tools -Force | Out-Null
gh release download v2.6.0 -R GameTechDev/PresentMon -p PresentMon-2.6.0-x64.exe -D ./Logs/issue-35-tools
Get-FileHash -Algorithm SHA256 ./Logs/issue-35-tools/PresentMon-2.6.0-x64.exe
$node24 = npx --yes node@24 -p "process.execPath"
Copy-Item -LiteralPath $node24 -Destination ./Logs/issue-35-tools/node-v24.exe
./service/scripts/issue-35-run-profile-elevated.ps1 -Profile all -OutputPath ./Logs/rnf-v2 -PresentMonPath ./Logs/issue-35-tools/PresentMon-2.6.0-x64.exe -NodePath ./Logs/issue-35-tools/node-v24.exe -Describe
./service/scripts/issue-35-run-profile-elevated.ps1 -Profile all -OutputPath ./Logs/rnf-v2 -PresentMonPath ./Logs/issue-35-tools/PresentMon-2.6.0-x64.exe -NodePath ./Logs/issue-35-tools/node-v24.exe
```

O lançador também confere SHA-256 `B2A706BC6AD475749E3B7E3409263AA1E6906D45BDCF993F6DBC0F660188F1AF`, assinatura Intel, Node 24 e assinatura OpenJS antes da elevação; passa o mesmo Node absoluto ao processo elevado. A cópia local mantém o binário no diretório do ensaio, fora do Git. Com `all`, executa primeiro smoke visual de 5 s, depois os três perfis, interrompendo ao primeiro erro. O Player fica visível antes de iniciar PresentMon; o sinal da janela medida só é emitido após o ETW começar. O lançador grava `Logs/rnf-v2-status.json`, `rnf-v2-smoke/` e `rnf-v2-{visual,reduced,sector}/`, além de stdout/stderr locais por etapa. Eventos de entrada do PresentMon são desativados (`--no_track_input`); apresentação, GPU e CPU permanecem observadas. Cada janela longa mede 600 s por padrão, com margem de 60 s para fechar a prova do Player e 80 s para o PresentMon. Para um só perfil, usar `-Profile visual`, `reduced` ou `sector` e um `-OutputPath` exclusivo. Resultados e CSVs brutos ficam locais em `Logs/`, ignorados pelo Git; publicar apenas resumo sanitizado e hash do build medido.
Após `all` passar nos três perfis e conferir o hash do Player, `node service/scripts/issue-35-collect-metrics.mjs --final rnf-v2` consolida o prefixo em `metricas-player-final.json`. Falha ou ausência de CSV deixa o resultado atual reprovado, sem reaproveitar medições de outro build.

Editor, CI, build, fixture, operação real e aceite humano são evidências distintas. Capturas de builds diferentes não formam uma entrega final única. Ausência de fonte e not_run ficam explícitos; não contornar revisão automática por outro canal.
