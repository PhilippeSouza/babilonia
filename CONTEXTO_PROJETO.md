# 🧠 Contexto Completo do Projeto e Histórico da Conversa (Handoff para Antigravity)

> **Instrução para o Agente Antigravity na outra máquina:**
> Se o usuário (Philippe) pedir para continuar o projeto a partir de onde parou em outro computador, leia este documento para ter 100% do contexto do que foi construído, das decisões de design e das regras de negócio.

---

## 📌 Resumo do Projeto: **Babilônia (LoL Live Companion — Dracula Edition)**

O **Babilônia** é um aplicativo/site local inspirado no **Blitz.gg / Buff Baron** para auxiliar jogadores de **League of Legends** em tempo real, sem precisar de chave paga da API da Riot Games e com **risco zero de banimento pelo Vanguard** (usa exclusivamente as APIs locais oficiais da Riot: **LCU API**, **Live Client Data API na porta 2999** e **Data Dragon CDN em pt_BR**).

### 🎨 Identidade Visual e UXDefinidas pelo Philippe:
1. **Nome do Aplicativo:** `Babilônia`
2. **Ícone Oficial (`public/logo.svg`):** Ilustração estilo cartoon neon Dracula de um personagem em pé em cima de uma cadeira gamer com as calças abaixadas mostrando a bunda.
3. **Tema Visual:** Clone da estrutura do **Blitz.gg** com a paleta de cores oficial **Dracula Dark Mode**:
   - Fundo Profundo: `#191a21` / `#21222c`
   - Cards: `#282a36` | Linhas/Bordas: `#44475a`
   - Destaques: Roxo (`#bd93f9`), Rosa (`#ff79c6`), Ciano (`#8be9fd`), Verde (`#50fa7b`), Laranja (`#ffb86c`), Vermelho (`#ff5555`).
4. **Sem Voz (100% Silencioso com Popups Táticos Visuais):**
   - O usuário optou por **não** ter narração por voz para não atrapalhar durante a partida.
   - Em vez disso, o aplicativo exibe **Popups Táticos Visuais** (Toast Notifications estilo Overlay do Blitz) no canto inferior direito com barra de progresso quando há alertas importantes na partida.
5. **Tela Inicial Limpa (`🏠 Início / Home`):**
   - O aplicativo abre por padrão na aba **Home** fora do modo de simulação, mostrando o perfil real do jogador quando o LoL está aberto (Nome#TAG, Ícone, Nível, Elo Solo/Duo + PDL, Vitórias/Derrotas), destaques do Patch e acesso livre aos 173 campeões.

---

## ⚙️ Regras de Negócio Principais Implementadas

### 1. Reconhecimento Automático da Lane + 6 Sugestões Pós-Banimentos (Divisão 3 + 3 Sem Repetição)
- **Arquivo:** `src/lcu.js` e `src/championsDb.js` (`getTop6MetaPicks`)
- Na Seleção de Campeões, o app lê automaticamente `assignedPosition` do LCU (`TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`) para o jogador não precisar escolher a lane manualmente.
- Lê automaticamente os **campeões banidos** e os **campeões escolhidos pelo time inimigo**.
- Exibe **6 campeões recomendados** divididos em dois blocos de 3:
  1. **🎯 3 Campeões Fortes Contra o Seu Oponente de Rota:** Counters diretos contra o campeão inimigo da mesma lane (ex: contra o Top inimigo).
  2. **🔥 3 Campeões Mais Fortes do Meta Atual na Sua Rota:** Os líderes do meta atual naquela lane.
  - **Regra de Salto (Sem Repetição):** Caso algum campeão que esteja entre os mais fortes do meta já tenha aparecido nos 3 Counters (ou tenha sido banido/escolhido), o algoritmo **pula automaticamente para o próximo campeão mais forte**, mantendo sempre 6 opções 100% únicas.

### 2. 3 Opções de Build para o Campeão Escolhido
- **Arquivo:** `src/championsDb.js` (`buildThreeOptionsForChampion`)
- Ao selecionar seu campeão, o app gera **3 Abas de Build completas** (cada uma com 6 itens, tempos de compra, justificativa, feitiços e página de runas própria exportável com 1 clique para o LoL):
  1. **🏆 Opção 1 — Build Maior Winrate:** A build mais vitoriosa e consistente do meta atual.
  2. **⚡ Opção 2 — Build Alternativa:** Uma variação tática (ex: Splitpush/Duelo, Aceleração de Ultimate ou Mobilidade/Kiting).
  3. **🛡️ Opção 3 — Melhor Contra o Time Inimigo (Counter-Composição Dinâmica):** Analisa os **5 campeões do time inimigo** (% de dano AD vs AP, quantidade de Tanques, Campeões de Cura e Controle de Grupo) e adapta automaticamente as **Botas** (*Passos de Mercúrio* vs AP/CC ou *Botas Galvanizadas de Aço* vs Full AD), **Corta-Cura**, **Penetração** e **Itens Defensivos**, explicando o motivo de cada escolha.

### 3. Coach de IA Híbrido em Tempo Real
- **Arquivo:** `src/coachEngine.js`
- Monitora a porta `2999` da partida ao vivo e dispara Popups Táticos para:
  - **Ouro acumulado no bolso (`>= 1300g`)** indicando hora de dar Recall e qual item comprar.
  - **Temporizadores de Objetivos (`<= 60s`)** para Dragão Elemental, Vastilarvas/Arauto e Barão Nashor.
  - **Ameaça Inimiga Feedada (`>= 3 kills`)** sugerindo counter-build defensivo.
  - **Ritmo de Farm (`CS/min`)** e dicas de fase de jogo (*Early, Mid, Late*).
- Inclui aba **Assistente Tático IA** (motor local instantâneo + suporte opcional à API gratuita do `Google Gemini 2.5 Flash`).

---

## 📂 Estrutura de Arquivos
- `server.js` — Servidor HTTP Node.js (Zero dependências externas, roda nativo no Node v18/v20/v24+).
- `src/lcu.js` — Conector automático com o cliente do LoL (`LeagueClientUx.exe` / `lockfile`), leitura de Invocador, Elo, Draft, Bans e exportação de Runas (`/lol-perks/v1/pages`).
- `src/liveClient.js` — Conector com a partida ao vivo (`https://127.0.0.1:2999/liveclientdata/allgamedata`) + modo simulador opcional.
- `src/championsDb.js` — Motor dos 6 Picks Pós-Ban (3 Counters + 3 Meta sem repetição) e gerador das 3 Builds por campeão.
- `src/coachEngine.js` — Motor Híbrido de IA (Tático Local + Gemini API).
- `public/index.html`, `public/styles.css`, `public/app.js`, `public/logo.svg` — Interface **Babilônia** em Dracula Dark Mode.
- `Iniciar-Babilonia.bat` — Atalho Windows de 1 clique para iniciar o servidor e abrir `http://localhost:3000`.
