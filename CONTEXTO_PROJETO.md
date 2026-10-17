# 🧠 CONTEXTO COMPLETO DO PROJETO BABILONIA BUFF (PARA CONTINUIDADE NO ANTIGRAVITY)

> **INSTRUÇÃO PARA O AGENTE ANTIGRAVITY:**
> O usuário (Philippe) iniciou o desenvolvimento deste projeto em outro computador e subiu todo o código e este arquivo de contexto para o GitHub (`https://github.com/PhilippeSouza/babilonia`) para continuar o desenvolvimento na máquina pessoal dele, onde o **League of Legends** está instalado.
> Leia atentamente todas as especificações abaixo antes de fazer qualquer alteração.

---

## 📌 1. Visão Geral e Identidade do Projeto
- **Nome Oficial do Aplicativo:** **Babilonia Buff** (sem acento)
- **Estilo Visual:** Cópia inspirada no **Blitz.gg / Buff Baron**, porém 100% estilizada na paleta **modo escuro**:
  - Background principal: `#191a24` / `#282a36`
  - Cards / Superfícies: `#44475a` / `#1e1f29`
  - Destaques Neon: Roxo (`#bd93f9`), Rosa (`#ff79c6`), Ciano (`#8be9fd`), Verde (`#50fa7b`), Laranja (`#ffb86c`), Vermelho (`#ff5555`).
- **Ícone / Logo Oficial (`public/logo.png`, `Babilônia Buff-icone.ico`, `public/favicon.ico`, `public/logo.svg`):**
  - Ilustração estilo quadrinhos realista traçada e hachurada (comic-book ink line-art com iluminação neon) de um jogador com headset meio em pé/agachado em cima de uma cadeira gamer com as calças jeans abaixadas até os joelhos mostrando a bunda.
- **Executável Nativo Windows (`Babilônia Buff.exe` & `src/BabiloniaLauncher.cs`):**
  - Aplicativo Windows Forms nativo compilado com `.NET Framework csc.exe` (`/target:winexe /win32icon:"Babilônia Buff-icone.ico"`).
  - Quando aberto, exibe o ícone oficial tanto na **Barra de Tarefas do Sistema Operacional (Taskbar)** quanto na **Bandeja do Sistema (System Tray / Área de Notificação perto do relógio)** com menu de contexto.
  - Inicia automaticamente o servidor `node server.js` em segundo plano oculto (sem janela preta de CMD), monitora o status do servidor/LoL em tempo real e abre a interface em modo janela dedicada (`--app=http://localhost:3000`).

---

## 📌 2. Regras de Negócio Exigidas pelo Usuário (NÃO QUEBRAR!)

1. **PROIBIDO Coach com Voz (TTS):**
   - O usuário deixou explícito que **não quer voz** porque atrapalha na partida.
   - Toda comunicação durante a partida deve ser feita via **Popups Visuais Táticos Silenciosos** no canto inferior direito (`#tacticalPopupContainer`), estilo notificações do Blitz.
2. **Sem Simulador nem Atalhos de Teste:**
   - O usuário testa direto em partida real. **Não** recriar simulador de partida, botão "Simular Partida", "Testar Popup", presets de time inimigo ou textos de debug.
   - O aplicativo abre por padrão na aba **Home**.
   - Quando o League of Legends está aberto na máquina, a Home mostra o Perfil Real do jogador (`Nome#TAG`, Ícone, Nível, Elo Solo/Duo, PDL, Vitórias/Derrotas e Winrate) lido via LCU API (`/lol-summoner/v1/current-summoner` e `/lol-ranked/v1/current-ranked-stats`).
   - Permite consultar qualquer um dos 173 campeões, builds, runas e tier list livremente fora de partida.
3. **Detecção Automática de Lane + 6 Recomendações Pós-Banimentos (Divisão 3 + 3 Sem Repetição):**
   - Na Seleção de Campeões, o app lê automaticamente a lane em que o jogador caiu (`assignedPosition` via `/lol-champ-select/v1/session`, normalizada para `TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`).
   - Após a fase de banimentos, exibe **6 sugestões** para a rota do jogador divididas em:
     - **3 Campeões Fortes Contra o Oponente Direto da Sua Rota (Counters de Lane)**
     - **3 Campeões Mais Fortes do Meta Atual na Sua Rota (Top Meta)**
   - **Regra de Ouro Anti-Repetição:** Se um campeão já apareceu entre os 3 Counters (ou foi banido/escolhido), ele é **pulado automaticamente** na lista dos 3 Mais Fortes do Meta, puxando o próximo mais forte da fila para garantir 6 opções únicas.
4. **3 Opções de Build para o Campeão Escolhido:**
   - **Opção 1 — Build com Melhor Winrate (`best_wr`):** A build padrão mais vitoriosa do patch atual.
   - **Opção 2 — Build Alternativa (`alternative`):** Estilo alternativo (splitpush, pico rápido ou variação de runas).
   - **Opção 3 — Build Melhor Contra o Time Inimigo (`anti_enemy`):** Calculada dinamicamente analisando os 5 campeões do time inimigo (proporção AD vs AP, quantidade de Tanques, Campeões de Cura/Sustain e Controle de Grupo/CC), trocando botas, corta-cura, penetração e item defensivo automaticamente.
5. **IA Integrada (Motor Híbrido Local + Gemini Opcional):**
   - **Sem chat livre.** A IA observa a partida e avisa sozinha. Dentro de "Partida Ao Vivo" existe o Assistente Tático IA com as dicas passando e perguntas prontas em botões (`/api/coach/quick`, respostas do motor local, Gemini opcional).
   - Draft e Partida Ao Vivo ficam vazios e OFF fora de Seleção de Campeões/partida; nada de campeão padrão (ex: Darius) aparecendo fora de jogo.
   - O launcher (`Babilônia Buff.exe`) fecha sozinho depois de abrir o app; o servidor encerra 5 min após a janela do app fechar (`BB_AUTO_EXIT=1`). Recompilar com `Recompilar-Launcher.bat`.
   - Não usar o nome "Dracula" em nenhum lugar. Não automatizar teclado/ações dentro do jogo.
   - `src/liveTipsEngine.js` é o motor local que lê a porta 2999 a cada 2s (loop no `server.js`) e decide quando mostrar uma dica: recall/compra, objetivos 60s antes, oponente de rota morto, vantagem/desvantagem numérica, eventos (morte, dragão, Barão, inibidor, ace), vida baixa, nível 6/11/16, inimigo forte, composição inimiga e farm.
   - Frequência limitada: 1 dica por vez, 25s entre dicas normais e 6s para urgentes, cada situação aparece uma vez só.
   - `src/coachEngine.js` só refina o texto da dica com o **Google Gemini 2.5 Flash** quando há chave configurada (timeout de 2,5s, senão usa o texto local).
6. **100% Seguro contra Banimentos (Riot Vanguard Safe):**
   - Não lê memória RAM, não injeta DLL no `League of Legends.exe` e não simula cliques/macros. Usa apenas as APIs locais oficiais da Riot: **LCU API** (cliente) e **Live Client Data API** (`https://127.0.0.1:2999/liveclientdata/allgamedata`).

---

## 📂 3. Estrutura de Arquivos do Repositório

- `Babilônia Buff.exe` — Executável nativo Windows com ícone na Barra de Tarefas e Bandeja do Sistema.
- `Babilônia Buff-icone.ico` — Ícone multi-resolução (`16x16` a `256x256`) da arte realista traçada.
- `src/BabiloniaLauncher.cs` — Código-fonte C# do executável `Babilônia Buff.exe`.
- `src/BabiloniaOverlay.cs` — Janela por cima do jogo (próximo item e habilidade a upar), aberta pelo launcher com `--overlay`.
- `server.js` — Servidor HTTP Node.js (porta `3000`, zero dependências externas no `package.json`).
- `src/lcu.js` — Conector automático LCU (`lockfile` + processo `LeagueClientUx.exe`), leitura de perfil/elo, champ select, bans, lane automática e exportação de runas (`/lol-perks/v1/pages`).
- `src/liveClient.js` — Leitor da partida ao vivo na porta `2999`.
- `src/championsDb.js` — Integração Data Dragon (`pt_BR`) + algoritmo dos `3 Counters + 3 Meta` sem repetição + gerador das `3 Builds` (`best_wr`, `alternative`, `anti_enemy`).
- `src/liveTipsEngine.js` — Motor de dicas proativas (observa a partida e decide quando avisar).
- `src/coachEngine.js` — Refinamento opcional do texto das dicas com Gemini 2.5 Flash.
- `public/index.html`, `public/styles.css`, `public/app.js` — Interface completa Babilonia Buff em modo escuro.
- `public/logo.png`, `public/favicon.ico`, `public/logo.svg` — Arte oficial do Babilonia Buff.
