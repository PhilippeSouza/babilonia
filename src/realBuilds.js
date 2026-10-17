/**
 * Builds Reais por Campeão e Rota - Babilonia Buff
 *
 * Busca as estatísticas públicas do op.gg (todas as regiões, ranqueada, patch atual) para o
 * campeão NA ROTA em que ele vai jogar: feitiços, itens iniciais, botas, itens principais,
 * runas e ordem de habilidades. Guarda em cache local por algumas horas e, sem internet,
 * o app continua com as builds fixas.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://lol-api-champion.op.gg/api/global/champions/ranked';
const CACHE_FILE = path.join(__dirname, '..', 'build-cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const LANES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const BOOT_IDS = new Set(['3006', '3009', '3020', '3047', '3111', '3117', '3158', '2422']);

let cache = {};
let spellNames = {}; // id numérico do feitiço -> nome em português
let perkNames = {}; // id da runa -> nome em português
let assetsVersion = '';
const inFlight = new Map();

try {
  if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {};
} catch (_) {
  cache = {};
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
  } catch (_) {}
}

/** Carrega nomes em português dos feitiços e runas do Data Dragon (uma vez por patch). */
async function initBuildAssets(ddragonVersion) {
  if (!ddragonVersion || assetsVersion === ddragonVersion) return;
  try {
    const [spRes, ruRes] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/pt_BR/summoner.json`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/pt_BR/runesReforged.json`, { signal: AbortSignal.timeout(8000) })
    ]);
    if (spRes.ok) {
      const sp = await spRes.json();
      spellNames = {};
      Object.values(sp.data || {}).forEach((s) => (spellNames[String(s.key)] = s.name));
    }
    if (ruRes.ok) {
      const trees = await ruRes.json();
      perkNames = {};
      trees.forEach((t) => {
        perkNames[String(t.id)] = t.name;
        (t.slots || []).forEach((slot) => (slot.runes || []).forEach((r) => (perkNames[String(r.id)] = r.name)));
      });
    }
    assetsVersion = ddragonVersion;
  } catch (err) {
    console.warn('[Builds] Sem nomes de feitiços/runas:', err.message);
  }
}

const STAT_SHARD_NAMES = {
  5001: 'Vida Escalável',
  5005: 'Velocidade de Ataque',
  5007: 'Aceleração de Habilidade',
  5008: 'Força Adaptativa',
  5010: 'Velocidade de Movimento',
  5011: 'Vida',
  5013: 'Tenacidade e Resistência a Lentidão'
};

function perkName(id) {
  return perkNames[String(id)] || STAT_SHARD_NAMES[id] || `Runa #${id}`;
}

function cacheKey(champKey, lane) {
  return `${champKey}|${lane}`;
}

/** Retorna a build real do cache (ou null) e, se faltar ou estiver velha, busca em segundo plano. */
function peekRealBuild(champKey, lane) {
  if (!champKey || !LANES.includes(lane)) return null;
  const hit = cache[cacheKey(champKey, lane)];
  if (!hit || Date.now() - hit.fetchedAt > CACHE_TTL_MS) fetchRealBuild(champKey, lane).catch(() => {});
  return hit ? hit.data : null;
}

/** Busca (ou devolve do cache) a build real do campeão na rota. */
async function fetchRealBuild(champKey, lane) {
  if (!champKey || !LANES.includes(lane)) return null;
  const key = cacheKey(champKey, lane);
  const hit = cache[key];
  if (hit && Date.now() - hit.fetchedAt <= CACHE_TTL_MS) return hit.data;
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    try {
      const res = await fetch(`${API_BASE}/${champKey}/${lane}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Babilonia Buff)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = json?.data;
      if (!data || !Array.isArray(data.core_items) || data.core_items.length === 0) throw new Error('sem dados');
      const version = (data.trends?.win || [])[0]?.version || '';
      const playedLane = (data.summary?.positions || []).find((p) => p.name === lane);
      const slim = {
        lane,
        version,
        games: playedLane?.stats?.play || data.summary?.average_stats?.play || 0,
        laneWinRate: playedLane?.stats?.win_rate ?? null,
        spells: data.summoner_spells || [],
        starters: data.starter_items || [],
        boots: data.boots || [],
        cores: data.core_items || [],
        lastItems: data.last_items || [],
        runes: data.runes || [],
        skills: data.skills || [],
        masteries: data.skill_masteries || []
      };
      cache[key] = { fetchedAt: Date.now(), data: slim };
      saveCache();
      return slim;
    } catch (err) {
      console.warn(`[Builds] Falha ao buscar build real (${champKey} ${lane}):`, err.message);
      return hit ? hit.data : null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

const pct = (win, play) => (play > 0 ? `${((win / play) * 100).toFixed(1)}%` : null);

function itemInfo(id, ddragonItems) {
  const it = ddragonItems[String(id)];
  return {
    id: String(id),
    name: it?.name || `Item #${id}`,
    cost: it?.gold?.total ? `${it.gold.total}g` : '',
    rawGold: it?.gold?.total || 0
  };
}

/** Completa a ordem de habilidades até o nível 18 (Q/W/E no máximo 5 pontos, R no máximo 3). */
function completeSkillOrder(order = []) {
  const out = order.slice(0, 18);
  const count = (k) => out.filter((s) => s === k).length;
  const priority = ['R', ...['Q', 'W', 'E'].sort((a, b) => count(b) - count(a))];
  while (out.length < 18) {
    const lvl = out.length + 1;
    const next =
      lvl >= 16 && count('R') < 3 ? 'R' : priority.find((k) => k !== 'R' && count(k) < 5) || 'R';
    out.push(next);
  }
  return out;
}

function runesFromOpgg(page, champName, label) {
  if (!page) return null;
  const selected = [...(page.primary_rune_ids || []), ...(page.secondary_rune_ids || []), ...(page.stat_mod_ids || [])];
  const keystone = perkName(page.primary_rune_ids?.[0]);
  return {
    name: `Babilonia Buff: ${champName} (${keystone})`,
    primaryStyleId: page.primary_page_id,
    subStyleId: page.secondary_page_id,
    selectedPerkIds: selected,
    perkNames: Object.fromEntries(selected.map((id) => [id, perkName(id)])),
    summary: `${perkName(page.primary_page_id)} (${keystone}) + ${perkName(page.secondary_page_id)} • ${pct(page.win, page.play) || ''} de vitória em ${page.play} partidas`
  };
}

/** Itens iniciais da build real no formato do app (com sentinela grátis). */
function starterFromOpgg(starter, ddragonItems, lane) {
  if (!starter) return null;
  const counts = new Map();
  // A fonte não lista o item de suporte (Atlas Mundial): na rota de suporte ele sempre vem primeiro
  const supportItems = ['3865', '3866', '3867', '3869', '3870', '3871', '3876', '3877'];
  if (lane === 'SUPPORT' && !(starter.ids || []).some((id) => supportItems.includes(String(id)))) counts.set('3865', 1);
  (starter.ids || []).forEach((id) => counts.set(String(id), (counts.get(String(id)) || 0) + 1));
  const items = [...counts.entries()].map(([id, count]) => {
    const info = itemInfo(id, ddragonItems);
    const total = info.rawGold * count;
    return { id, name: count > 1 ? `${info.name} (x${count})` : info.name, cost: total ? `${total}g` : info.cost, count, role: 'Item Inicial' };
  });
  items.push({ id: '3340', name: 'Sentinela Invisível', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' });
  const laneName = { TOP: 'Topo', JUNGLE: 'Selva', MID: 'Meio', ADC: 'Atirador', SUPPORT: 'Suporte' }[lane] || lane;
  return {
    title: `Saída mais usada no ${laneName} (${pct(starter.win, starter.play) || '--'} de vitória)`,
    summary: `${items
      .filter((i) => i.id !== '3340')
      .map((i) => i.name)
      .join(' + ')} • escolhida em ${Math.round((starter.pick_rate || 0) * 100)}% das partidas.`,
    items
  };
}

/** Monta os 6 itens: 1º item principal, botas, 2º e 3º itens principais e os 2 mais comuns depois. */
function sixItemsFromOpgg(core, boots, lastItems, ddragonItems) {
  const coreIds = (core?.ids || []).map(String).filter((id) => !BOOT_IDS.has(id));
  const bootId = String(boots?.ids?.[0] || '');
  const used = new Set([...coreIds, bootId]);
  const extras = (lastItems || [])
    .map((x) => String(x.ids?.[0]))
    .filter((id) => id && !used.has(id) && !BOOT_IDS.has(id) && ddragonItems[id]?.gold?.total >= 2000);
  const ordered = [coreIds[0], bootId, coreIds[1], coreIds[2], ...extras].filter(Boolean);
  const unique = [...new Set(ordered)].slice(0, 6);
  return unique.map((id, idx) => {
    const info = itemInfo(id, ddragonItems);
    const isBoot = BOOT_IDS.has(id);
    return {
      id,
      name: info.name,
      timing: ['10 min', '13 min', '17 min', '22 min', '26 min', '30 min'][idx],
      note: isBoot
        ? 'Botas mais usadas nessa rota.'
        : idx < 4
        ? `${idx === 0 ? '1º' : idx === 2 ? '2º' : '3º'} item principal da build mais jogada.`
        : 'Item mais comprado no fim da partida.'
    };
  });
}

/**
 * Converte a build real no formato do guia do app.
 * Retorna { spells, skillOrder, skillPriority, runes, altRunes, coreItems, altItems, starterPack, ... }.
 */
function toGuideBuild(real, champName, ddragonItems = {}) {
  if (!real) return null;
  const topSpells = real.spells[0];
  const spells = (topSpells?.ids || []).map((id) => spellNames[String(id)] || `Feitiço ${id}`);
  const skills = real.skills[0];
  const mastery = real.masteries[0];
  const core1 = real.cores[0];
  const core2 = real.cores.find((c, i) => i > 0 && String(c.ids?.[0]) !== String(core1?.ids?.[0])) || real.cores[1];

  return {
    lane: real.lane,
    version: real.version,
    games: real.games,
    source: 'op.gg',
    spells,
    skillOrder: completeSkillOrder(skills?.order || []),
    skillPriority: mastery?.ids ? mastery.ids.join(' > ') : null,
    runes: runesFromOpgg(real.runes[0], champName),
    altRunes: runesFromOpgg(real.runes[1], champName) || runesFromOpgg(real.runes[0], champName),
    starterPack: starterFromOpgg(real.starters[0], ddragonItems, real.lane),
    coreItems: sixItemsFromOpgg(core1, real.boots[0], real.lastItems, ddragonItems),
    coreWinRate: core1 ? pct(core1.win, core1.play) : null,
    corePickRate: core1 ? `${Math.round((core1.pick_rate || 0) * 100)}%` : null,
    altItems: core2 ? sixItemsFromOpgg(core2, real.boots[1] || real.boots[0], real.lastItems, ddragonItems) : null,
    altWinRate: core2 ? pct(core2.win, core2.play) : null,
    altPickRate: core2 ? `${Math.round((core2.pick_rate || 0) * 100)}%` : null,
    laneWinRate: real.laneWinRate != null ? `${(real.laneWinRate * 100).toFixed(1)}%` : null
  };
}

module.exports = { initBuildAssets, peekRealBuild, fetchRealBuild, toGuideBuild, completeSkillOrder, LANES };
