/**
 * Motor Híbrido do Coach de IA (Local Tactical Engine + Google Gemini AI)
 * Analisa os dados em tempo real da partida e gera alertas de Macro, Build,
 * Matchup e frases curtas para narração por Voz (Text-to-Speech).
 */

const { getChampionGuide } = require('./championsDb');

function generateLocalTacticalCoaching(matchState, ddragonChampData = null) {
  if (!matchState || !matchState.activePlayer) {
    return {
      voiceCallout: 'Aguardando início da partida ou seleção de campeões.',
      priorityCards: [
        {
          id: 'idle-tip',
          type: 'MACRO',
          badge: 'PRONTO',
          title: 'BaronAI Monitorando o Cliente',
          message: 'Abra o League of Legends ou ative o Modo Simulador no topo da tela para testar o Coach em tempo real!'
        }
      ]
    };
  }

  const p = matchState.activePlayer;
  const guide = getChampionGuide(p.championId || p.championName, ddragonChampData);
  const cards = [];
  let voiceCallout = '';

  // 1. Alerta de Ouro Acumulado no Bolso (Recall Timing)
  if (p.currentGold >= 1300) {
    const nextItem = guide.coreItems.find(
      (ci) => !p.items.some((owned) => String(owned.itemID) === String(ci.id))
    ) || guide.coreItems[1] || guide.coreItems[0];

    const goldMsg = `Você está com ${p.currentGold} de ouro guardado! Empurre a wave atual até a torre inimiga e dê Recall agora para comprar ${nextItem ? nextItem.name : 'seu próximo componente'}.`;
    cards.push({
      id: `gold-${Math.floor(p.currentGold / 200)}`,
      type: 'URGENT',
      badge: `${p.currentGold} OURO NO BOLSO`,
      title: 'Hora de dar Recall (Pico de Compra)',
      message: goldMsg
    });
    voiceCallout = `Atenção: você tem ${p.currentGold} de ouro no bolso. Empurre a rota e dê base para comprar ${nextItem ? nextItem.name : 'itens'} antes da próxima luta.`;
  }

  // 2. Alerta de Objetivo Próximo (Dragão / Vastilarvas / Arauto / Barão)
  const { dragon, heraldOrGrubs, baron } = matchState.objectives;
  if (dragon.isUrgent) {
    cards.push({
      id: `dragon-urgent`,
      type: 'URGENT',
      badge: `DRAGÃO EM ${dragon.statusText}`,
      title: 'Preparação para o Dragão Elemental',
      message: `O Dragão nasce em ${dragon.statusText}! Garanta prioridade na rota do meio/bot e coloque visão no rio Sul 40 segundos antes.`
    });
    if (!voiceCallout) {
      voiceCallout = `Dragão Elemental nasce em ${dragon.secondsRemaining} segundos. Empurre a wave e controle a visão do rio.`;
    }
  } else if (baron.isUrgent && matchState.gameTime >= 1125) {
    cards.push({
      id: `baron-urgent`,
      type: 'URGENT',
      badge: `BARÃO EM ${baron.statusText}`,
      title: 'Controle de Visão do Barão Nashor',
      message: `Barão ativo em breve (${baron.statusText}). Não apareça na rota inferior sem Teleporte disponível!`
    });
    if (!voiceCallout) {
      voiceCallout = `Atenção ao topo do mapa: Barão em ${baron.secondsRemaining} segundos. Não mostre no bot sem teleporte.`;
    }
  } else if (heraldOrGrubs.isUrgent) {
    cards.push({
      id: `pit-urgent`,
      type: 'MACRO',
      badge: `${heraldOrGrubs.name.toUpperCase()} EM ${heraldOrGrubs.statusText}`,
      title: `Rotação para ${heraldOrGrubs.name}`,
      message: `${heraldOrGrubs.name} em ${heraldOrGrubs.statusText}. Ganhe tempo puxando sua wave primeiro para ajudar seu caçador.`
    });
  }

  // 3. Análise da Maior Ameaça Inimiga (Counter-Build Dinâmico)
  const threat = matchState.biggestThreat;
  if (threat && threat.kills >= 3) {
    const sitItem = guide.situationalItems[0] || { name: 'Item Defensivo (Zhonya / Dança da Morte / Passos de Mercúrio)' };
    cards.push({
      id: `threat-${threat.championName}`,
      type: 'BUILD',
      badge: `AMEAÇA: ${threat.championName.toUpperCase()} (${threat.kills}/${threat.deaths})`,
      title: `Cuidado com ${threat.championName} Feedado!`,
      message: `${threat.championName} inimigo está forte (${threat.kills}/${threat.deaths}/${threat.assists}). Evite duelos sem visão e considere adiantar ${sitItem.name}.`
    });
    if (!voiceCallout) {
      voiceCallout = `Cuidado com ${threat.championName} inimigo, ele já tem ${threat.kills} abates. Guarde suas defesas para ele e considere fazer ${sitItem.name}.`;
    }
  }

  // 4. Avaliação de Farm (CS por Minuto) + Fase do Jogo
  const phase = matchState.gameTime < 840 ? 'early' : matchState.gameTime < 1500 ? 'mid' : 'late';
  const phaseLabel = phase === 'early' ? 'Fase de Rotas (Early Game)' : phase === 'mid' ? 'Meio de Jogo (Mid Game)' : 'Fim de Jogo (Late Game)';
  const csFeedback =
    p.csPerMin >= 7.5
      ? `Excelente ritmo de farm (${p.csPerMin} CS/min)! Use sua vantagem de ouro para pressionar objetivos.`
      : p.csPerMin >= 5.5
      ? `Farm sólido (${p.csPerMin} CS/min). Tente coletar ondas nas rotas laterais entre as lutas para chegar a 7+ CS/min.`
      : `Alerta de Farm (${p.csPerMin} CS/min): Você está perdendo ouro de minions. Antes de agrupar sem objetivo vivo, limpe uma rota lateral!`;

  cards.push({
    id: `phase-${phase}`,
    type: 'MATCHUP',
    badge: `${guide.name.toUpperCase()} • ${phaseLabel.toUpperCase()}`,
    title: `Plano Tático de ${guide.name}`,
    message: `${guide.coachTips[phase]} ${csFeedback}`
  });

  if (!voiceCallout) {
    voiceCallout = `${guide.coachTips[phase]}`;
  }

  return {
    voiceCallout,
    priorityCards: cards,
    championGuide: guide
  };
}

/**
 * Responde perguntas do jogador no chat (ou gera análise profunda) usando Gemini AI
 * ou o Motor Especialista Local caso nenhuma chave Gemini esteja configurada.
 */
async function answerPlayerQuestion({ question, matchState, selectedChampionId, enemyChampionId, geminiApiKey, ddragonChampData }) {
  const champId = matchState?.activePlayer?.championId || selectedChampionId || 'Yasuo';
  const guide = getChampionGuide(champId, ddragonChampData);

  // Se houver chave da API do Gemini configurada, usa o modelo gemini-2.5-flash com todo o contexto!
  if (geminiApiKey && geminiApiKey.trim().length > 10) {
    try {
      const prompt = buildGeminiPrompt({ question, matchState, guide, enemyChampionId });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey.trim())}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 450
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleanVoice = text
            .replace(/[*#_`~>-]/g, '')
            .split(/\n|\./)
            .filter((s) => s.trim().length > 12)
            .slice(0, 2)
            .join('. ');
          return {
            source: 'Gemini AI (Tempo Real)',
            answer: text.trim(),
            voiceText: cleanVoice || 'Confira as recomendações táticas no painel.'
          };
        }
      }
    } catch (err) {
      // Fallback silencioso para o motor tático local
    }
  }

  // Motor Especialista Local (Responde instantaneamente mesmo sem API Key externa)
  const qLower = (question || '').toLowerCase();
  const enemy = enemyChampionId || matchState?.biggestThreat?.championName || 'seu oponente';

  let answer = '';
  let voiceText = '';

  if (qLower.includes('item') || qLower.includes('build') || qLower.includes('comprar') || qLower.includes('faço')) {
    const coreNames = guide.coreItems.map((i) => `**${i.name}** (${i.timing})`).join(' → ');
    const sit = guide.situationalItems.map((s) => `• **${s.name}** contra *${s.vs}*`).join('\n');
    answer = `### ⚔️ Build Recomendada para ${guide.name}\n\n**Sequência Principal:**\n${coreNames}\n\n**Adaptações Situacionais:**\n${sit}\n\n${
      matchState?.activePlayer
        ? `💡 **Agora na partida:** Você tem **${matchState.activePlayer.currentGold} de ouro**. ${
            matchState.activePlayer.currentGold >= 1100
              ? 'Já vale dar Recall após empurrar a próxima onda!'
              : 'Farme mais 2 ondas antes de voltar à base.'
          }`
        : ''
    }`;
    voiceText = `Para ${guide.name}, siga a build principal com ${guide.coreItems.slice(0, 3).map((i) => i.name).join(', ')}.`;
  } else if (qLower.includes('runa') || qLower.includes('feitiço') || qLower.includes('talento')) {
    answer = `### 🔮 Runas e Feitiços para ${guide.name}\n\n• **Página:** ${guide.runes.name}\n• **Resumo:** ${guide.runes.summary}\n• **Feitiços:** ${guide.spells.join(' + ')}\n• **Ordem de Habilidades:** Priorize **${guide.skillPriority}**.\n\n👉 *Dica: Clique no botão **"Exportar Runas para o LoL"** na aba Seleção de Campeões para enviar esta página automaticamente para o seu cliente!*`;
    voiceText = `Use a página ${guide.runes.name} e priorize as habilidades na ordem ${guide.skillPriority}.`;
  } else if (qLower.includes('contra') || qLower.includes('matchup') || qLower.includes('counter') || qLower.includes('ganhar')) {
    answer = `### 🛡️ Como Jogar de ${guide.name} (Matchup & Rotas)\n\n• **Counters que exigem cuidado:** ${guide.counters.join(', ')}\n• **Bons confrontos:** ${guide.goodAgainst.join(', ')}\n• **Na Fase de Rotas:** ${guide.coachTips.early}\n• **Contra ${enemy}:** Não gaste sua habilidade de mobilidade/defesa de forma ofensiva sem saber onde está o caçador inimigo. Jogue em torno dos seus picos de nível 3 e 6!`;
    voiceText = `Contra ${enemy}, jogue com paciência nos primeiros níveis. ${guide.coachTips.early}`;
  } else {
    // Análise geral do momento atual do jogo
    const localCoaching = generateLocalTacticalCoaching(matchState, ddragonChampData);
    const bullets = localCoaching.priorityCards.map((c) => `• **${c.title}:** ${c.message}`).join('\n');
    answer = `### 🧠 Análise Tática em Tempo Real (${guide.name})\n\n${bullets}\n\n**Resumo de Habilidades:** Priorize **${guide.skillPriority}** | **Build Core:** ${guide.coreItems.map((i) => i.name).join(' → ')}`;
    voiceText = localCoaching.voiceCallout;
  }

  return {
    source: 'BaronAI Motor Tático Local',
    answer,
    voiceText
  };
}

function buildGeminiPrompt({ question, matchState, guide, enemyChampionId }) {
  let stateDesc = `Campeão selecionado: ${guide.name} (${guide.role}). Inimigo na rota: ${enemyChampionId || 'Não informado'}.`;
  if (matchState && matchState.activePlayer) {
    const p = matchState.activePlayer;
    stateDesc = `
DADOS REAIS DA PARTIDA AO VIVO:
- Tempo de Jogo: ${matchState.formattedTime} | Placar: Aliados ${matchState.teamScore.allies} x ${matchState.teamScore.enemies} Inimigos
- Meu Campeão: ${p.championName} (Nível ${p.level}) | KDA: ${p.kills}/${p.deaths}/${p.assists} | CS: ${p.cs} (${p.csPerMin}/min)
- Ouro no bolso agora: ${p.currentGold}
- Meus Itens atuais: ${p.items.map((i) => i.displayName).join(', ') || 'Nenhum'}
- Maior ameaça inimiga: ${matchState.biggestThreat ? `${matchState.biggestThreat.championName} (${matchState.biggestThreat.kills}/${matchState.biggestThreat.deaths})` : 'Nenhuma'}
- Objetivos: Dragão (${matchState.objectives.dragon.statusText}), ${matchState.objectives.heraldOrGrubs.name} (${matchState.objectives.heraldOrGrubs.statusText}), Barão (${matchState.objectives.baron.statusText})
`;
  }

  return `Você é o BaronAI, um Coach Challenger de League of Legends direto, tático e objetivo.
Responda em Português do Brasil em no máximo 4 tópicos curtos e práticos para o jogador ler ou ouvir rápido durante a partida.
${stateDesc}
Pergunta/Pedido do Jogador: "${question || 'O que eu devo fazer agora para vencer essa partida?'}"`;
}

module.exports = {
  generateLocalTacticalCoaching,
  answerPlayerQuestion
};
