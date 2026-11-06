# Git e GitHub

## Branches e commits

`main` contém entregas integradas. Criar branch curta por fatia, com nome `feat/<issue>-<tema>`, `fix/<issue>-<tema>` ou `docs/<issue>-<tema>`. Antes de abrir PR, confirmar base remota, diff e arquivos staged. Em checkout misto, adicionar caminhos explícitos; não usar `git add -A`.

Commits em português e com finalidade clara, por exemplo `docs: detalhar contrato de eventos M1`. Um commit não precisa equivaler a uma issue, mas deve ser reversível e legível. Não registrar segredos, sessões pessoais, GLBs sem licença, artefatos de build ou banco local. `.gitignore` reduz risco; revisar `git diff --cached` antes do push.

## PR e merge

Um PR contém uma fatia coerente, referência `refs #N`, validação e limites. Ver [PRS](PRS.md). Rebase/atualização da base é feito quando necessário, preservando trabalho alheio. Verificar checks e regras da branch no SHA atual. A estratégia de merge depende das configurações vigentes do repositório; preferir squash para uma fatia coesa se permitido, sem assumir configuração imutável.

Confirmar SHA e estado remoto após merge. Issue tecnicamente integrada permanece aberta até aceite funcional do PI. Não apagar branch de terceiros nem forçar push em branch compartilhada por rotina.
