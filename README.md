# ⚡ Babilônia — LoL Live Companion & AI Coach (Dracula Edition)

<p align="center">
  <img src="public/logo.png" width="180" alt="Babilônia Logo Oficial" />
</p>

Assistente desktop e web em tempo real para **League of Legends** inspirado no **Blitz.gg**, com tema **Dracula Dark Mode**, executável nativo para Windows (**`Babilonia.exe`**) com ícone na Barra de Tarefas e na Bandeja do Sistema (System Tray), e conexão 100% automática ao cliente do jogo (sem precisar de chave da Riot API e 100% seguro contra banimentos do Vanguard).

## 🚀 Funcionalidades Principais

- **🖥️ Executável Nativo (`Babilonia.exe`) + Ícone na Barra do Sistema:**
  - Possui central de controle própria em **Dracula Dark Mode** que sobe o servidor em segundo plano (sem janela preta de CMD).
  - Exibe a logo oficial detalhada tanto na **Barra de Tarefas do Windows (Taskbar)** quanto na **Bandeja do Sistema (System Tray, perto do relógio)** com menu de acesso rápido ao clicar com o botão direito.
- **🏠 Home & Perfil Real do LoL:** Conecta sozinho ao cliente aberto e exibe seu `Nome#TAG`, Nível, Elo Ranqueado Solo/Duo, PDL e Vitórias/Derrotas.
- **📍 Detecção Automática de Lane + 6 Sugestões Pós-Ban (3 + 3 Sem Repetição):**
  - Reconhece em qual rota você caiu na Seleção de Campeões (`Top`, `Jungle`, `Mid`, `ADC`, `Suporte`).
  - Filtra automaticamente os campeões banidos e exibe **3 Counters diretos contra seu oponente de rota** + **3 Campeões mais fortes do Meta atual** (pulando automaticamente caso algum campeão se repita entre as listas!).
- **⚔️ 3 Opções de Build por Campeão:**
  1. **🏆 Build Maior Winrate:** A build mais vitoriosa do patch atual.
  2. **⚡ Build Alternativa:** Variação tática de estilo de jogo.
  3. **🛡️ Build Anti-Time Inimigo:** Analisa os 5 campeões adversários (% AD vs AP, Tanques, Cura e Controle de Grupo) e adapta suas Botas, Corta-Cura, Penetração e Defesa automaticamente.
- **⚡ Auto-Import de Runas (1-Clique):** Exporta a página de runas da build escolhida direto para dentro do seu League of Legends.
- **🔔 Popups Táticos Visuais (Sem Voz):** Alertas visuais silenciosos em tempo real durante a partida para Recall/Ouro no bolso (`1300g+`), Objetivos (`60s` antes de Dragão/Barão) e Ameaças Inimigas.

---

## 💻 Como rodar na sua máquina

1. Certifique-se de ter o [Node.js](https://nodejs.org/) instalado.
2. Clone este repositório:
   ```bash
   git clone https://github.com/PhilippeSouza/babilonia.git
   cd babilonia
   ```
3. Dê dois cliques diretamente no executável **`Babilonia.exe`**!
   - Ele iniciará o servidor silenciosamente, ficará com o ícone na **Barra de Tarefas** e na **Bandeja do Sistema** do Windows, e abrirá o aplicativo automaticamente.

---

## 🔄 Como continuar o desenvolvimento no Antigravity em outro PC

Ao abrir esta pasta no **Antigravity** no seu computador pessoal, basta enviar na primeira mensagem do chat:
> *"Leia o arquivo `CONTEXTO_PROJETO.md` para carregar todo o histórico e continuar o projeto Babilônia de onde paramos."*
