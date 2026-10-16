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

module.exports = {
  hasGeminiKey,
  refineTipWithGemini
};
