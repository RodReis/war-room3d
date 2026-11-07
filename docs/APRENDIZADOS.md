# Aprendizados verificados

Fonte de entrada: seção **Aprendizado** dos comentários de entrega técnica de PRs/issues integradas. A integração técnica não equivale ao fechamento da issue ou ao aceite funcional do PI. Registrar somente lição que tenha evidência identificável: documento oficial, commit, teste, log ou comando reproduzível. “Nenhum” no comentário não gera item aqui.

## M4 — integração técnica verificada

| Data · Issue/PR | Situação | Aprendizado | Evidência | Ação futura |
|---|---|---|---|---|
| 07/11/2026 · #5 / #24 | Descoberta com credencial só de comando | Autorização de escrita não concede leitura global: filtrar projetos antes de montar pedidos e conservar a autoridade de leitura separadamente | Correção `510274f`, [regressão e revisão externa](validation/m4/resultado.md) | Cobrir acesso permitido e negado, inclusive descoberta e revogação |
| 07/11/2026 · #5 / #24 | CLI Codex 0.166.0 e IDs MCP | Caminhos de override são segmentados por pontos literais; IDs citados devem estar no valor TOML. Uma tabela vazia não remove configurações herdadas | Correção `b6d1fcc`, [contraprova nativa e recibo](validation/m4/codex-windows.md) | Fixar versão, validar configuração efetiva e usar fixture com ID contendo ponto |
| 07/11/2026 · #5 / #24 | Política global do CLI no laboratório | O limite de documentação do projeto não desativa a governança global. Validar a identidade da fonte autorizada sem suprimir políticas ou aceitar arquivos arbitrários | Correção `8587967`, [escopo e prova Windows](validation/m4/codex-windows.md) | Manter allowlist exata fornecida pelo host e bloquear fontes divergentes |

## Formato e manutenção

Cada item futuro usa: `Data · Issue/PR · Situação · Aprendizado · Evidência · Ação futura`. Manter até 20 itens ativos de valor recorrente; quando exceder, agrupar por tema e mover o texto antigo para um arquivo histórico com link. Corrigir ou retirar lição refutada com referência à nova prova; nunca apagar o contexto da decisão silenciosamente.
