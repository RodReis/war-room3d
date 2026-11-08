# M5 — preparação do aceite visual

Estado: `not_run`. Nenhuma captura do painel no Player foi obtida; o PI ainda não registrou aceite visual.

## Objeto da revisão

Player Windows Development 6000.3.27f1, resolução planejada 1280 × 720, cena live `QuartelM2Live`. A prova usa apenas laboratório sintético local (`LAB M5 SINTÉTICO`, ambiente `m5-lab`); não inclui dados ou credenciais do ContaIA.

O laboratório em `service/scripts/m5-visual-lab.ts` serve snapshot e consultas M5 pelo serviço real, com 13 logs, um rastro ligado por Request ID explícito e um incidente ilustrativo. A captura opt-in `M5VisualPlayerProof` só existe no build de desenvolvimento e foi preparada para produzir:

1. Cobertura e fontes do ambiente.
2. Primeira página de logs e botão de próxima página ativo.
3. Segunda página de logs.
4. Rastro filtrado pelo Request ID `req-m5-lab`.
5. Incidente aberto pela regra sintética.
6. Painel fechado e acesso bloqueado em replay.

Os PNGs e `result.json` iriam para `Logs/m5-visual-proof-*`, ignorado pelo Git. Revisar conteúdo, direitos e tamanho antes de publicar qualquer imagem.

## Provas já executadas

- Serviço sintético: `/v1/snapshot`, cobertura, logs (10 itens e cursor), rastro (1) e incidentes (1) responderam HTTP 200; processo e porta do laboratório foram encerrados.
- `npm run typecheck` passou com o script de laboratório.
- Build Windows M5 concluiu com exit 0 e 172.376.301 bytes; log local `Logs/m5-visual-build.log`. Compilação incluiu o capturador de desenvolvimento. O Editor regravou cena/settings; alterações geradas foram restauradas, preservando apenas os arquivos de prova novos.

## Impedimento da captura

`computer-use` e a superfície alternativa retornaram `Computer Use native pipe is unavailable` (`os error 2`). Após preparar build e laboratório, a revisão automática rejeitou a ação de iniciar o Player por `Start-Process`: `blocked by policy`, sem motivo mais detalhado. Não houve tentativa de lançamento por outro canal. Assim, nenhum estado visual foi observado no Player e não há base para declarar `pass` ou aceite funcional.

A mesma revisão rejeitou a remoção recursiva da pasta `wr3d-m5-visual-*` em `%TEMP%` (`blocked by policy`). Ela contém apenas SQLite sintético deste ensaio; ficou registrada para limpeza quando a política permitir.
