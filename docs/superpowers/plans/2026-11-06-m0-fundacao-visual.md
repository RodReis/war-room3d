# War-Room3D M0 — Fundação Visual e Contrato Implementation Plan

> **Prioridade revisada em 08/11/2026:** a [sala completa de referência (#28)](https://github.com/RodReis/war-room3d/issues/28) concentra o acabamento visual e o fluxo de uso antes da replicação. Consultar [especificação](../../specs/2026-11-08-sala-referencia-design.md) e [plano atual](2026-11-08-sala-referencia-player.md). Este plano permanece referência do subsistema; seu fechamento não comprova a nova experiência no Player.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um executável Windows de demonstração, com setor modular de seis posições, núcleo de comando, uma sala navegável em três ângulos e dados sintéticos explicitamente identificados, sustentados por um contrato versionado.

**Architecture:** `contracts/` define um snapshot mínimo e seus fixtures; `unity/` contém somente apresentação 3D e HUD. O carregador de M0 lê fixtures locais em modo demonstração e não abre fontes reais. A arte v2 é inspecionada em cena separada; a sala operacional é modular.

**Tech Stack:** Unity 6.3 LTS (6000.3.27f1), URP, C#, UI Toolkit, Input System, glTFast para o ensaio de importação, Node.js 24 para validação dos fixtures, JSON Schema.

---

## Limite e referências

Base aprovada: [PRD](../../../PRD.md), seções 3, 5, 8, 11 e 13; [GDD](../../../GDD.md), seções 3, 5, 9, 11, 13 e 20. M0 cobre RF-11 e RF-36, além da prova visual de RF-08 a RF-10. A implementação operacional destes últimos ocorre em M1. Sem conectores Claude/Codex, hooks, GitHub, banco de dados, monitoramento de infraestrutura ou comandos reais em M0.

Verificações documentais feitas em 06/11/2026: [importação glTFast no Editor](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/ImportEditor.html), [entrada sobre UI Toolkit](https://docs.unity3d.com/Manual/UIE-faq-event-and-input-system.html), [testes Unity em linha de comando](https://docs.unity3d.com/Manual/test-framework/run-tests-from-command-line.html), [testes nativos Node 24](https://nodejs.org/docs/latest-v24.x/api/test.html). Fixar versões efetivas no `manifest.json` e registrar o resultado; a página da glTFast 6.20 orienta o ensaio, não estabelece compatibilidade já comprovada com Unity 6.3.

## Mapa dos arquivos

| Caminho | Responsabilidade |
|---|---|
| `.gitignore` | Excluir cache e builds Unity, configurações e dados locais |
| `contracts/schemas/demo-snapshot.v1.schema.json` | Forma versionada do snapshot ilustrativo |
| `contracts/fixtures/m0-demo.v1.json` | Seis projetos sintéticos, estados e uma sala selecionada |
| `contracts/test/demo-snapshot.test.mjs` | Validar fixture, isolamento do modo demo e IDs únicos |
| `unity/` | Projeto Unity criado com o template URP e Editor fixado |
| `unity/Assets/WarRoom3D/Runtime/Demo/DemoSnapshot.cs` | Tipos serializáveis do fixture |
| `unity/Assets/WarRoom3D/Runtime/Demo/DemoLoader.cs` | Ler apenas o fixture embarcado e validar selo visual |
| `unity/Assets/WarRoom3D/Runtime/Scene/SectorBuilder.cs` | Montar núcleo e seis módulos, sem lógica de coleta |
| `unity/Assets/WarRoom3D/Runtime/Camera/OrbitCamera.cs` | Órbita, zoom, restauração e bloqueio sobre HUD |
| `unity/Assets/WarRoom3D/UI/Hud.uxml`, `Hud.uss` | Faixa, etiquetas e resumo legíveis em português |
| `unity/Assets/WarRoom3D/Runtime/UI/HudPresenter.cs` | Atualizar seleção e ações da UI |
| `unity/Assets/WarRoom3D/Tests/EditMode/` | Contrato e geometria de layout |
| `docs/validation/m0/` | Capturas, dimensões, métricas e decisão de arte |

Um arquivo por responsabilidade. A cena `QuartelM0.unity` referencia os componentes, e `EnsaioGlbV2.unity` recebe a importação experimental. Nenhuma classe do cliente lê arquivos de sessão ou toma decisão de saúde operacional.

## Task 1: Preparar o repositório para um projeto Unity local

**Files:** Review `.gitignore`; create `unity/` pelo template URP; verify `unity/ProjectSettings/ProjectVersion.txt` e `unity/Packages/manifest.json`.

- [ ] **Step 1: Conferir exclusões sem ocultar ativos de produto.** O `.gitignore` público já exclui pesquisa/arte local, dados, cache e builds Unity. Confirmar ao menos estas regras antes do bootstrap:

```gitignore
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]ser[Ss]ettings/
unity/.vs/
unity/.idea/
*.csproj
*.sln
*.suo
*.user
.env
.env.*
!*.env.example
```

- [ ] **Step 2: Criar `unity/` no Unity Hub, template Universal 3D, Editor `6000.3.27f1`.** Preservar a estrutura gerada por esse Editor. Confirmar `m_EditorVersion` e URP no `manifest.json`; instalar `Input System`, `UI Toolkit` se o template não o incluir, `Test Framework` e `com.unity.cloud.gltfast` pelo Package Manager. Não copiar o GLB para uma cena de produto ainda.
- [ ] **Step 3: Fixar o baseline.** Executar `git status --short` e registrar as versões reais de pacotes em `docs/validation/m0/baseline.md`. Esperado: `unity/Assets`, `unity/Packages`, `unity/ProjectSettings` versionáveis; cache `Library/` ausente de `git status`.
- [ ] **Step 4: Commit seletivo.** `git add .gitignore unity/Assets unity/Packages unity/ProjectSettings docs/validation/m0/baseline.md && git commit -m "build: create Unity URP baseline"`.

## Task 2: Formalizar fixture e contrato do modo demonstração

**Files:** Create `contracts/schemas/demo-snapshot.v1.schema.json`, `contracts/fixtures/m0-demo.v1.json`, `contracts/test/demo-snapshot.test.mjs`, `contracts/package.json`.

- [ ] **Step 1: Escrever teste que rejeita modo ausente, IDs repetidos e mais de seis posições no setor.** Em `contracts/test/demo-snapshot.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
const root = new URL('../', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(load('schemas/demo-snapshot.v1.schema.json'));
const fixture = load('fixtures/m0-demo.v1.json');
test('fixture tem contrato e selo ilustrativo', () => {
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assert.equal(fixture.mode, 'demo');
  assert.equal(fixture.projects.length, 6);
});
test('ids e posições não se repetem', () => {
  assert.equal(new Set(fixture.projects.map(x => x.projectId)).size, 6);
  assert.equal(new Set(fixture.projects.map(x => x.slotId)).size, 6);
});
test('contrato rejeita falso estado real', () => {
  assert.equal(validate({ ...fixture, mode: 'live' }), false);
});
```

- [ ] **Step 2: Executar `npm test` dentro de `contracts/`.** Esperado: falha por pacote, schema ou fixture ausente; registrar a falha inicial no terminal, sem versionar log volumoso.
- [ ] **Step 3: Criar `contracts/package.json`, instalar versão fixada de Ajv e gerar `package-lock.json`.** Scripts: `"test": "node --test test/*.test.mjs"`; dependência `ajv` registrada pelo `npm install --save-exact ajv`. Não usar `latest` no manifesto final.
- [ ] **Step 4: Criar schema com `additionalProperties: false` nas entidades e campos mínimos:** `schemaVersion` constante `1.0`, `mode` constante `demo`, `sectorId` constante `setor-01`, `selectedProjectId`, `projects` com exatamente seis itens; cada projeto tem `projectId`, `name`, `slotId` (`slot-01` a `slot-06`), `provider` (`Codex`, `Claude`, `Ambos`), `activeAgents` inteiro não negativo, `status` (`trabalhando`, `aguardando`, `atencao`, `inativo`) e `activity`. Nenhum campo admite credenciais, texto de prompt ou caminho local. O schema não tenta deduzir unicidade entre itens; o teste cobre isso.
- [ ] **Step 5: Criar fixture de seis projetos fictícios em pt-BR.** Usar os nomes do PRD, selecionar `API Core`, mostrar pelo menos um estado `atenção` e um `inativo`; usar somente ações inventadas e selo permanente `CONCEITO · DADOS ILUSTRATIVOS` na UI.
- [ ] **Step 6: Executar `npm test` em `contracts/`.** Esperado: três testes aprovados e zero falhas. Commit seletivo: `git add contracts && git commit -m "feat: define M0 demo snapshot contract"`.

## Task 3: Montar setor e sala com geometria modular

**Files:** Create `SectorBuilder.cs`, `QuartelM0.unity`, materiais e prefabs sob `unity/Assets/WarRoom3D/`.

- [ ] **Step 1: Escrever testes EditMode para seis encaixes, IDs estáveis e núcleo único.** O teste instancia `SectorBuilder`, chama `Build()` e verifica `transform.Find("Nucleo") != null`, `transform.Find("Salas").childCount == 6` e nomes distintos `slot-01` a `slot-06`.
- [ ] **Step 2: Executar os EditMode tests.** Esperado: falha por classe/cena ainda inexistente.
- [ ] **Step 3: Implementar `SectorBuilder.Build()` com uma matriz fixa de seis âncoras:** `(-14,0,9)`, `(0,0,11)`, `(14,0,9)`, `(-14,0,-9)`, `(0,0,-11)`, `(14,0,-9)`. Criar piso, paredes recortadas, mesa e duas estações por módulo; núcleo ao centro. Usar `GameObject.CreatePrimitive` inicialmente, nomes semânticos e materiais grafite/ciano. O módulo devolve âncoras para avatares, etiqueta e câmera; não carrega dados nem desenha texto operacional em textura.
- [ ] **Step 4: Ligar `QuartelM0.unity` ao builder.** Incluir EventSystem, `UIDocument`, câmera e iluminação. Seis salas visíveis simultaneamente, corredores contínuos e uma sala selecionada. Uma única sala é aproximada pelo mesmo objeto, sem duplicar malha para a tela interior.
- [ ] **Step 5: Rodar EditMode tests e abrir a cena.** Esperado: todos aprovados, seis módulos identificáveis sem sobreposição de etiquetas. Commit seletivo dos arquivos da cena e testes.

## Task 4: Aplicar fixture ilustrativo e construir HUD

**Files:** Create `DemoSnapshot.cs`, `DemoLoader.cs`, `Hud.uxml`, `Hud.uss`, `HudPresenter.cs`; copy fixture into `unity/Assets/WarRoom3D/Demo/m0-demo.v1.json` with a test that compares it byte-for-byte to the source fixture.

- [ ] **Step 1: Testar que `DemoLoader` rejeita `mode != "demo"`, versão diferente de `1.0`, `selectedProjectId` inexistente e IDs repetidos.** Teste de UI: selo `CONCEITO · DADOS ILUSTRATIVOS` permanece visível após selecionar uma sala.
- [ ] **Step 2: Rodar testes.** Esperado: falha por classes/UI inexistentes.
- [ ] **Step 3: Declarar tipos Unity para `JsonUtility` sem dicionários:**

```csharp
[System.Serializable] public sealed class DemoSnapshot {
    public string schemaVersion, mode, sectorId, selectedProjectId;
    public DemoProject[] projects;
}
[System.Serializable] public sealed class DemoProject {
    public string projectId, name, slotId, provider, status, activity;
    public int activeAgents;
}
```

- [ ] **Step 4: Implementar `DemoLoader.Load(TextAsset)` com `JsonUtility.FromJson<DemoSnapshot>`, validação explícita desses invariantes e erro visível no HUD.** Em falha, mostrar `Falha ao carregar demonstração` e detalhes sanitizados; jamais iniciar coleta real por fallback.
- [ ] **Step 5: Criar HUD com título `Quartel-general`, selo fixo, resumo da sala, botão `Entrar na sala`, breadcrumb `Quartel-general / API Core`, botão `Voltar ao quartel`, árvore curta de agentes ilustrativos e feed com horários ilustrativos.** Todos os textos em português, fontes legíveis a 1920×1080 e 1366×768. `HudPresenter` consulta `DemoLoader` e seleciona projeto por `projectId`.
- [ ] **Step 6: Rodar testes de contrato/UI e comparar os dois fixtures.** Esperado: todos aprovados, nenhum dado real aparece na demonstração. Commit seletivo dos tipos, UI, fixture e testes.

## Task 5: Controlar a câmera e provar três vistas da mesma sala

**Files:** Create `OrbitCamera.cs` e testes EditMode/PlayMode; modify `QuartelM0.unity`.

- [ ] **Step 1: Testar a matemática de órbita separadamente do input.** De `yaw=0`, aplicar `360` e verificar a mesma direção horizontal; zoom permanece no intervalo configurado; `ResetView()` restaura yaw, pitch e distância. PlayMode: arrastar sobre botão do HUD não gira a cena.
- [ ] **Step 2: Rodar testes.** Esperado: falha por controller inexistente.
- [ ] **Step 3: Implementar o núcleo da câmera:**

```csharp
private void ApplyPose() {
    float pitch = Mathf.Clamp(_pitch, 20f, 75f);
    float distance = Mathf.Clamp(_distance, 8f, 42f);
    Quaternion rotation = Quaternion.Euler(pitch, _yaw, 0f);
    transform.position = focus.position + rotation * new Vector3(0f, 0f, -distance);
    transform.LookAt(focus.position);
}
public void ResetView() { _yaw = 45f; _pitch = 42f; _distance = 26f; ApplyPose(); }
```

- [ ] **Step 4: Ligar Input System.** Mouse direito arrasta para órbita, scroll aproxima/afasta, botão `Restaurar câmera` chama `ResetView`; `EventSystem.current.IsPointerOverGameObject()` bloqueia gestos sobre UI. Se a integração com UI Toolkit exigir `panel.Pick`, registrar teste e usar essa checagem no presenter, sem adicionar um segundo sistema de input paralelo.
- [ ] **Step 5: Capturar quartel, interior e ângulo oposto da mesma instância de `API Core`.** Esperado: objeto da sala mantém o mesmo ID e posição; câmera muda sem trocar o mundo; rotação horizontal completa, zoom e restauração funcionam. Commit seletivo.

## Task 6: Ensaiar o GLB v2 sem incorporá-lo cegamente

**Files:** Create `EnsaioGlbV2.unity`, `docs/validation/m0/arte-v2.md` e capturas em `docs/validation/m0/`.

O [pipeline de arte e MCP](../../PIPELINE-ARTE-MCP.md) orienta o ensaio. ChatGPT Canvas pode apoiar a revisão de briefings e layouts, mas seus rascunhos precisam ser transferidos para arquivos versionados. Ferramentas de autoria são opcionais para executar o plano; o build não pode depender de MCP, conta Tripo3D ou Canvas.

- [ ] **Step 1: Importar o GLB v2 fornecido localmente pelo glTFast na cena de ensaio, após verificar permissão de uso.** Conferir Inspector: avisos, malha, materiais, UV, texturas e importação no build. Não espalhar cópias grandes por cena; não tratar partes da malha única como salas selecionáveis. O binário não é requisito para clonar este repositório público.
- [ ] **Step 2: Registrar quatro capturas padronizadas:** visão geral, ângulo oposto, aproximação de uma sala e núcleo/data center. Comparar com os renders de inspeção locais, quando disponíveis e autorizados.
- [ ] **Step 3: Medir triângulos, frame time e memória no Editor e build Windows; registrar hardware e qualidade URP.** O alvo do GDD é hipótese de ensaio, não limite validado. Decidir por peça: recuperar, remodelar ou usar somente como referência. Registrar licença/origem antes de enviar binário ao Git público.
- [ ] **Step 4: Executar um build Windows x64 e abrir fora do Editor.** Esperado: materiais corretos, sem figuras estáticas confundidas com agentes e HUD visível. Se a arte falhar, manter cena modular funcionando e registrar a falha em `arte-v2.md`.
- [ ] **Step 5: Comparar uma peça candidata gerada e uma recuperada/remodelada, se houver conta e direitos autorizados.** Usar prompt por peça, revisar no Blender e provar na Unity; registrar proveniência, custo, licença, métricas e decisão. Se Tripo3D/MCP não estiverem disponíveis, registrar `não executado` e concluir M0 pela geometria modular validada, sem simular integração. ChatGPT Canvas pode revisar o briefing, mas não é etapa de geração 3D.

## Task 7: Fechar M0 com evidência reproduzível

**Files:** Create `docs/validation/m0/resultado.md`; modify `README.md` com instruções de abertura da demonstração.

- [ ] **Step 1: Rodar `npm test` em `contracts/` e testes EditMode/PlayMode no Unity Test Framework.** Registrar comandos exatos, versão do Editor, totais e falhas. Em PowerShell, definir `$unityEditor` com o caminho da instalação Unity 6000.3.27f1 e executar `& $unityEditor -runTests -batchmode -projectPath (Join-Path $PWD 'unity') -testResults (Join-Path $PWD 'docs/validation/m0/editmode.xml') -testPlatform EditMode`; repetir com `PlayMode` e `playmode.xml`.
- [ ] **Step 2: Testar manualmente a 1920×1080 e 1366×768:** seis posições, selo demo permanente, seleção, entrada, retorno, três vistas, órbita 360°, zoom, restauração e gestos sobre HUD. Registrar capturas com versão do build.
- [ ] **Step 3: Executar `git status --short`, confirmar ausência de `Library/`, credenciais, logs e transcripts.** `resultado.md` deve separar testes de contrato, Editor, build e avaliação visual; anotar limitações e próximos itens de M1.
- [ ] **Step 4: Commit seletivo da evidência e README.** M0 está concluído apenas se as provas do PRD seção 5 existirem e o build puder ser reproduzido em outra máquina com os assets que têm direitos de distribuição.

## Critério de passagem para M1

M1 recebe uma especificação e plano próprios para ingestão Claude/Codex, identidade de projetos, estado/persistência e SSE. O fixture M0 continua no domínio `demo` e não serve como contrato de eventos reais. Antes de conectar sessões, definir schema completo do envelope, provas de deduplicação e proveniência, reconciliação após reinício e testes de isolamento de projetos. Não instalar hooks globais nem afirmar integração real com base nas capturas de M0.
