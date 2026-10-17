/**
 * Detecção Automática da Rota de Cada Inimigo - Babilonia Buff
 *
 * A Seleção de Campeões não informa a rota do time inimigo e a ordem de pick não diz nada
 * sobre ela. Aqui cada campeão recebe as chances de jogar em cada rota (taxa de jogo real por
 * posição, baixada uma vez e guardada em cache, ou a tabela fixa abaixo quando estiver offline)
 * e o time inteiro é resolvido junto: escolhemos a combinação de rotas sem repetição mais provável.
 * Em partida, Golpear (Smite) marca o caçador e o item de suporte marca o suporte.
 */

const fs = require('fs');
const path = require('path');

const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const RATES_URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json';
const RATES_CACHE = path.join(__dirname, '..', 'lane-rates-cache.json');
const RIOT_TO_LANE = { TOP: 'TOP', JUNGLE: 'JUNGLE', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUPPORT' };
// Aceita também os nomes curtos usados no resto do app
const ANY_TO_LANE = { ...RIOT_TO_LANE, MID: 'MID', ADC: 'ADC', SUPPORT: 'SUPPORT', BOT: 'ADC', SUP: 'SUPPORT' };

// Itens de suporte (Atlas Mundial e evoluções) e Golpear
const SUPPORT_ITEM_IDS = new Set(['3865', '3866', '3867', '3869', '3870', '3871', '3876', '3877']);
const SMITE_NAMES = ['smite', 'golpear'];

// Rotas mais comuns de cada campeão, da principal para a secundária (usado sem internet)
// T = Top, J = Selva, M = Meio, A = Atirador, S = Suporte
const FALLBACK_LANES = {
  Aatrox: 'T', Ahri: 'M', Akali: 'MT', Akshan: 'MT', Alistar: 'S', Ambessa: 'TJ', Amumu: 'JS', Anivia: 'M',
  Annie: 'MS', Aphelios: 'A', Ashe: 'AS', AurelionSol: 'M', Aurora: 'MT', Azir: 'M', Bard: 'S', Belveth: 'J',
  Blitzcrank: 'S', Brand: 'SJM', Braum: 'S', Briar: 'J', Caitlyn: 'A', Camille: 'T', Cassiopeia: 'MT',
  Chogath: 'TM', Corki: 'MA', Darius: 'T', Diana: 'JM', DrMundo: 'TJ', Draven: 'A', Ekko: 'JM', Elise: 'J',
  Evelynn: 'J', Ezreal: 'A', Fiddlesticks: 'J', Fiora: 'T', Fizz: 'M', Galio: 'MS', Gangplank: 'T', Garen: 'T',
  Gnar: 'T', Gragas: 'TJ', Graves: 'J', Gwen: 'TJ', Hecarim: 'J', Heimerdinger: 'MTS', Hwei: 'MS', Illaoi: 'T',
  Irelia: 'TM', Ivern: 'J', Janna: 'S', JarvanIV: 'J', Jax: 'TJ', Jayce: 'TM', Jhin: 'A', Jinx: 'A', KSante: 'T',
  Kaisa: 'A', Kalista: 'A', Karma: 'SM', Karthus: 'JM', Kassadin: 'M', Katarina: 'M', Kayle: 'TM', Kayn: 'J',
  Kennen: 'T', Khazix: 'J', Kindred: 'J', Kled: 'T', KogMaw: 'A', Leblanc: 'M', LeeSin: 'J', Leona: 'S',
  Lillia: 'J', Lissandra: 'M', Lucian: 'AM', Lulu: 'S', Lux: 'SM', Malphite: 'TS', Malzahar: 'M', Maokai: 'SJ',
  MasterYi: 'J', Mel: 'MS', Milio: 'S', MissFortune: 'A', MonkeyKing: 'TJ', Mordekaiser: 'T', Morgana: 'SJ',
  Naafiri: 'MJ', Nami: 'S', Nasus: 'T', Nautilus: 'S', Neeko: 'MS', Nidalee: 'J', Nilah: 'A', Nocturne: 'J',
  Nunu: 'J', Olaf: 'TJ', Orianna: 'M', Ornn: 'T', Pantheon: 'STJ', Poppy: 'TJS', Pyke: 'S', Qiyana: 'MJ',
  Quinn: 'T', Rakan: 'S', Rammus: 'J', RekSai: 'J', Rell: 'S', Renata: 'S', Renekton: 'T', Rengar: 'JT',
  Riven: 'T', Rumble: 'TM', Ryze: 'MT', Samira: 'A', Sejuani: 'J', Senna: 'SA', Seraphine: 'SA', Sett: 'T',
  Shaco: 'JS', Shen: 'TS', Shyvana: 'J', Singed: 'T', Sion: 'T', Sivir: 'A', Skarner: 'JT', Smolder: 'AM',
  Sona: 'S', Soraka: 'S', Swain: 'SM', Sylas: 'MJ', Syndra: 'M', TahmKench: 'TS', Taliyah: 'JM', Talon: 'MJ',
  Taric: 'S', Teemo: 'T', Thresh: 'S', Tristana: 'AM', Trundle: 'JT', Tryndamere: 'T', TwistedFate: 'M',
  Twitch: 'AJ', Udyr: 'JT', Urgot: 'T', Varus: 'AM', Vayne: 'AT', Veigar: 'MA', Velkoz: 'SM', Vex: 'M', Vi: 'J',
  Viego: 'J', Viktor: 'M', Vladimir: 'MT', Volibear: 'TJ', Warwick: 'JT', Xayah: 'A', Xerath: 'SM', XinZhao: 'J',
  Yasuo: 'MTA', Yone: 'MT', Yorick: 'T', Yunara: 'A', Yuumi: 'S', Zaahen: 'TJ', Zac: 'J', Zed: 'MJ', Zeri: 'A',
  Ziggs: 'MA', Zilean: 'S', Zoe: 'M', Zyra: 'SJ'
};
const LETTER_TO_LANE = { T: 'TOP', J: 'JUNGLE', M: 'MID', A: 'ADC', S: 'SUPPORT' };

// Chance por rota (0 a 1) indexada pela chave numérica do campeão, vinda da internet
let ratesByKey = null;

function normalizeRates(entry) {
  const out = {};
  let total = 0;
  for (const [riotPos, lane] of Object.entries(RIOT_TO_LANE)) {
    const v = Number(entry?.[riotPos]?.playRate) || 0;
    out[lane] = v;
    total += v;
  }
  if (total <= 0) return null;
  LANES.forEach((l) => (out[l] /= total));
  return out;
}

function applyRatesJson(json) {
  const data = json?.data;
  if (!data || typeof data !== 'object') return false;
  const parsed = {};
  for (const [key, entry] of Object.entries(data)) {
    const n = normalizeRates(entry);
    if (n) parsed[String(key)] = n;
  }
  if (Object.keys(parsed).length < 50) return false;
  ratesByKey = parsed;
  return true;
}

/** Carrega as taxas por rota: primeiro o cache local, depois tenta atualizar pela internet. */
async function initLaneRates() {
  try {
    if (fs.existsSync(RATES_CACHE)) applyRatesJson(JSON.parse(fs.readFileSync(RATES_CACHE, 'utf8')));
  } catch (_) {}
  try {
    const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      if (applyRatesJson(json)) {
        try {
          fs.writeFileSync(RATES_CACHE, JSON.stringify(json), 'utf8');
        } catch (_) {}
        console.log(`[Rotas] Taxas por rota carregadas para ${Object.keys(ratesByKey).length} campeões.`);
      }
    }
  } catch (err) {
    console.warn('[Rotas] Sem internet para as taxas por rota, usando a tabela fixa:', err.message);
  }
}

function fallbackRates(champId, ddragonChamp) {
  const out = { TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 };
  const letters = FALLBACK_LANES[champId];
  if (letters) {
    const weights = [0.7, 0.2, 0.1];
    letters.split('').forEach((ch, i) => (out[LETTER_TO_LANE[ch]] += weights[i] || 0.05));
    return out;
  }
  // Campeão novo fora da tabela: usa as classes do Data Dragon
  const tags = ddragonChamp?.tags || [];
  if (tags.includes('Marksman')) out.ADC += 0.6;
  if (tags.includes('Support')) out.SUPPORT += 0.5;
  if (tags.includes('Mage') || tags.includes('Assassin')) out.MID += 0.5;
  if (tags.includes('Fighter') || tags.includes('Tank')) {
    out.TOP += 0.4;
    out.JUNGLE += 0.3;
  }
  const total = LANES.reduce((s, l) => s + out[l], 0);
  if (total <= 0) LANES.forEach((l) => (out[l] = 0.2));
  else LANES.forEach((l) => (out[l] /= total));
  return out;
}

/** Chance de um campeão jogar em cada rota (0 a 1). */
function getLaneRates(champId, ddragonChampions = {}) {
  const champ = ddragonChampions[champId];
  if (ratesByKey && champ && ratesByKey[String(champ.key)]) return ratesByKey[String(champ.key)];
  return fallbackRates(champId, champ);
}

/**
 * Distribui os inimigos nas 5 rotas pela combinação mais provável.
 * enemies: [{ championId, spells?: [nomes], itemIds?: [ids], position?: 'TOP'|'MIDDLE'|... }]
 * Retorna um array de 5 posições na ordem [TOP, JUNGLE, MID, ADC, SUPPORT] com o id do campeão ou ''.
 */
function assignEnemyLanes(enemies = [], ddragonChampions = {}) {
  const list = (enemies || []).filter((e) => e && e.championId).slice(0, 5);
  const result = ['', '', '', '', ''];
  if (list.length === 0) return result;

  const scores = list.map((e) => {
    const rates = getLaneRates(e.championId, ddragonChampions);
    const spells = (e.spells || []).map((s) => String(s).toLowerCase());
    const hasSmite = spells.some((s) => SMITE_NAMES.some((n) => s.includes(n)));
    const hasSupportItem = (e.itemIds || []).some((id) => SUPPORT_ITEM_IDS.has(String(id)));
    const riotLane = ANY_TO_LANE[String(e.position || '').toUpperCase()] || null;

    return LANES.map((lane) => {
      let p = Math.max(rates[lane] || 0, 0.003); // nenhuma rota é impossível, só improvável
      if (hasSmite) p *= lane === 'JUNGLE' ? 50 : 0.02;
      if (hasSupportItem) p *= lane === 'SUPPORT' ? 50 : 0.02;
      if (riotLane) p *= lane === riotLane ? 50 : 0.1;
      return Math.log(p);
    });
  });

  // Testa todas as combinações (no máximo 120) e fica com a de maior probabilidade
  let best = null;
  let bestScore = -Infinity;
  const used = new Array(5).fill(false);
  const pick = new Array(list.length);
  (function search(i, acc) {
    if (i === list.length) {
      if (acc > bestScore) {
        bestScore = acc;
        best = pick.slice();
      }
      return;
    }
    for (let l = 0; l < 5; l++) {
      if (used[l]) continue;
      used[l] = true;
      pick[i] = l;
      search(i + 1, acc + scores[i][l]);
      used[l] = false;
    }
  })(0, 0);

  best.forEach((laneIdx, i) => (result[laneIdx] = list[i].championId));
  return result;
}

module.exports = { LANES, initLaneRates, getLaneRates, assignEnemyLanes };
