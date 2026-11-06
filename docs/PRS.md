# Pull requests

## Corpo mínimo

1. **Problema e objetivo:** comportamento observado e resultado pretendido, com `refs #N` e SPEC/plano aplicável.
2. **Mudanças:** arquivos ou módulos relevantes e decisão técnica tomada.
3. **Validação:** comandos executados, resultados, ambiente e provas visuais quando houver UI.
4. **Limites:** `not_run`, dependências externas, riscos e trabalho que fica para outra fatia.

Revisar o diff completo contra a base remota, incluindo commits anteriores do mesmo PR. Responder achados com correção ou evidência, sem marcar discussão resolvida por silêncio. Novo commit invalida a leitura de checks anteriores até os checks cobrirem o novo SHA.

## Métricas de fluxo

Medir, quando houver histórico suficiente: tempo da abertura ao merge, tamanho do diff, rodadas de CI, tempo de execução dos jobs e frequência de falha/retrabalho. DORA (frequência de deploy, lead time, taxa de falhas e tempo de recuperação) só é mensurável quando houver deploys e incidentes definidos. Não publicar número inventado ou equiparar merge a deploy.

Para cada PR, registrar URL, SHA de merge, checks obrigatórios e limitações em [STATUS-ARQUIVO](STATUS-ARQUIVO.md) se mudar o estado de uma etapa. O aceite funcional pertence ao PI e é anotado separadamente.
