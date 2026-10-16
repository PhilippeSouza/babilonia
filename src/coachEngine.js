/**
 * Refinamento opcional das dicas com Google Gemini.
 * O motor local (src/liveTipsEngine.js) decide QUANDO e O QUE avisar;
 * se houver chave do Gemini configurada, ele só reescreve a mensagem de forma
 * mais natural usando o contexto da partida. Se falhar ou demorar, a dica
 * original do motor local é usada sem atraso perceptível.
 */

const GEMINI_TIMEOUT_MS = 2500;

function hasGeminiKey(key) {
  return Boolean(key && key.trim().length > 10);
}

async function refineTipWithGemini(tip, matchState, geminiApiKey) {
  if (!hasGeminiKey(geminiApiKey) || !tip || !matchState?.activePlayer) return tip;

  const p = matchState.activePlayer;
  const prompt = `Você é um coach de League of Legends que fala com o jogador DURANTE a partida por um popup pequeno.
Reescreva a dica abaixo em Português do Brasil, em no máximo 20 palavras, direta e no imperativo.
Mantenha os números, nomes de itens e campeões. Não use markdown, emojis nem aspas.

Contexto: ${matchState.formattedTime} de jogo, ${p.championName} nível ${p.level}, KDA ${p.kills}/${p.deaths}/${p.assists}, ${p.cs} CS (${p.csPerMin}/min), ${p.currentGold} de ouro. Placar ${matchState.teamScore.allies} x ${matchState.teamScore.enemies}.
Dica: ${tip.title}. ${tip.message}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey.trim())}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 80, thinkingConfig: { thinkingBudget: 0 } }
      })
    });
    if (!response.ok) return tip;
    const data = await response.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/[*#_`~>"]/g, '').trim();
    if (text.length < 8 || text.length > 220) return tip;
    return { ...tip, message: text, source: 'gemini' };
  } catch (_) {
    return tip;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perguntas prontas do Assistente Tático (botões na tela Partida Ao Vivo).
 * Não é chat livre: cada botão tem uma resposta calculada com os dados atuais da partida.
 */
const QUICK_QUESTIONS = {
  comprar: 'O que comprar agora?',
  recuar: 'Devo recuar ou lutar?',
  ameaca: 'Quem é a maior ameaça?',
  objetivo: 'Qual o próximo objetivo?',
  farm: 'Como está meu farm?',
  build: 'Como adaptar a build contra eles?'
};

function goldOf(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function answerQuickQuestion(questionId, matchState, guide) {
  const title = QUICK_QUESTIONS[questionId];
  if (!title) return null;
  if (!matchState?.activePlayer) {
    return { title, message: 'As respostas usam os dados da partida e ficam disponíveis assim que o jogo começar.' };
  }

  const p = matchState.activePlayer;
  const owned = new Set((p.items || []).map((i) => String(i.itemID)));
  const enemies = matchState.enemies || [];
  const allies = matchState.allies || [];
  const laner = enemies.find((e) => e.position && e.position === p.position) || null;
  const core = guide?.coreItems || [];
  const nextItem = core.find((ci) => !owned.has(String(ci.id))) || null;
  const nextComp = nextItem?.components?.find((c) => !owned.has(String(c.id))) || nextItem?.firstComponent || null;
  const hpPct = p.stats?.maxHealth > 0 ? Math.round((p.stats.currentHealth / p.stats.maxHealth) * 100) : 100;
  const deadEnemies = enemies.filter((e) => e.isDead).length;
  const deadAllies = allies.filter((a) => a.isDead).length;
  const fed = [...enemies].filter((e) => e.kills > e.deaths).sort((a, b) => b.kills - b.deaths - (a.kills - a.deaths));
  const antiItems = (guide?.builds?.[2]?.items || []).filter((it) => !owned.has(String(it.id)));

  let message = '';
  switch (questionId) {
    case 'comprar': {
      if (!nextItem) {
        message = 'Sua build principal está completa. Troque as botas por um item defensivo ou compre elixir e Sentinela de Controle.';
        break;
      }
      const compCost = goldOf(nextComp?.cost);
      const itemCost = goldOf(nextItem.totalCost);
      if (itemCost && p.currentGold >= itemCost) {
        message = `Você tem ${p.currentGold}g: dá para fechar ${nextItem.name}. Empurre a wave e volte agora.`;
      } else if (nextComp && compCost && p.currentGold >= compCost) {
        message = `Você tem ${p.currentGold}g: compre ${nextComp.name} (${nextComp.cost}), que é o próximo passo de ${nextItem.name}.`;
      } else {
        const target = nextComp || nextItem;
        const missing = Math.max(0, goldOf(target.cost || target.totalCost) - p.currentGold);
        message = `Faltam ${missing}g para ${target.name}. Continue farmando e volte quando chegar nesse valor.`;
      }
      if (!owned.has('2055') && matchState.gameTime > 360) message += ' Leve também uma Sentinela de Controle (75g).';
      break;
    }
    case 'recuar': {
      if (hpPct < 35) message = `Recue. Você está com ${hpPct}% de vida, qualquer troca pode virar morte.`;
      else if (deadAllies > deadEnemies) message = `Recue. Vocês estão com ${deadAllies} aliado(s) morto(s) contra ${deadEnemies} inimigo(s). Espere o time renascer.`;
      else if (deadEnemies >= 2) message = `Pressione. ${deadEnemies} inimigos estão mortos: é hora de objetivo ou torre.`;
      else if (laner && laner.level >= p.level + 2) message = `Evite luta: ${laner.championName} está ${laner.level - p.level} níveis acima de você. Farme perto da torre.`;
      else if (laner && laner.isDead) message = `${laner.championName} está morto. Empurre a wave e pegue placas.`;
      else message = `Vida em ${hpPct}% e números iguais. Lute só com a wave a seu favor e sabendo onde está o caçador inimigo.`;
      break;
    }
    case 'ameaca': {
      const t = fed[0];
      if (!t) {
        message = 'Ninguém do time inimigo está forte ainda. Foque no seu oponente de rota e no farm.';
        break;
      }
      message = `${t.championName} (${t.kills}/${t.deaths}/${t.assists}) é a maior ameaça. Não lute com ele sozinho e marque onde ele aparece.`;
      if (antiItems[0]) message += ` ${antiItems[0].name} ajuda contra o time deles.`;
      break;
    }
    case 'objetivo': {
      const o = matchState.objectives;
      const parts = [];
      if (matchState.gameTime >= 1200) parts.push(o.baron.secondsRemaining === 0 ? 'Barão está vivo' : `Barão em ${o.baron.statusText}`);
      parts.push(o.dragon.secondsRemaining === 0 ? 'Dragão está vivo' : `Dragão em ${o.dragon.statusText}`);
      if (matchState.gameTime < 1200) parts.push(`${o.heraldOrGrubs.name}: ${o.heraldOrGrubs.statusText}`);
      const advice =
        deadEnemies > deadAllies
          ? 'Vocês têm vantagem numérica: vão no objetivo vivo mais próximo.'
          : 'Empurre sua wave 40 a 60 segundos antes e chegue no rio com visão.';
      message = `${parts.join(' • ')}. ${advice}`;
      break;
    }
    case 'farm': {
      if (p.position === 'UTILITY') {
        message = `Como suporte, foque em visão: seu placar de visão está em ${p.wardScore}. Troque wards a cada volta à base.`;
        break;
      }
      const ideal = p.position === 'JUNGLE' ? 6 : 7;
      const vs = laner ? ` ${laner.championName} tem ${laner.cs} CS e você ${p.cs}.` : '';
      message =
        p.csPerMin >= ideal
          ? `Bom farm: ${p.csPerMin} CS/min.${vs} Use a vantagem de ouro para pressionar.`
          : `${p.csPerMin} CS/min, abaixo do ideal de ${ideal}.${vs} Pegue as waves laterais entre as lutas.`;
      break;
    }
    case 'build': {
      const comp = guide?.enemyCompAnalysis;
      const items = antiItems.slice(0, 2).map((i) => i.name);
      message = `${comp ? `${comp.summaryText}. ` : ''}${
        items.length ? `Priorize ${items.join(' e ')} contra eles.` : 'Sua build atual já cobre a composição deles.'
      }`;
      break;
    }
    default:
      return null;
  }
  return { title, message };
}

module.exports = {
  hasGeminiKey,
  refineTipWithGemini,
  QUICK_QUESTIONS,
  answerQuickQuestion
};
