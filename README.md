# ⚡ Babilônia — LoL Live Companion & AI Coach (Dracula Edition)

Assistente em tempo real para **League of Legends** inspirado no **Blitz.gg**, com tema **Dracula Dark Mode**, conexão 100% automática ao cliente do jogo (sem precisar de chave da Riot API e 100% seguro contra banimentos do Vanguard).

## 🚀 Funcionalidades Principais

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
3. Inicie o aplicativo dando dois cliques em **`Iniciar-Babilonia.bat`** (ou rodando no terminal):
   ```bash
   node server.js
   ```
4. Acesse no navegador: **`http://localhost:3000`**

---

## 🔄 Como continuar o desenvolvimento no Antigravity em outro PC

Ao abrir esta pasta no **Antigravity** no seu computador pessoal, basta enviar na primeira mensagem do chat:
> *"Leia o arquivo `CONTEXTO_PROJETO.md` para carregar todo o histórico e continuar o projeto Babilônia de onde paramos."*
