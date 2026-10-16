/**
 * Servidor Principal - Babilonia Buff
 * Detecta automaticamente a Lane que você caiu via LCU,
 * retorna 3 Counters do seu Oponente de Rota + 3 Mais Fortes do Meta (sem repetição)
 * e gera as 3 Opções de Build para o campeão escolhido.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getLCUState, exportRunePageToLCU, getMatchHistory } = require('./src/lcu');
const { fetchLiveGameData, parseLiveMatchState } = require('./src/liveClient');
const { getChampionGuide, getTop6MetaPicks, getChampionLanes, getRankedMetaEntry } = require('./src/championsDb');
const { hasGeminiKey, refineTipWithGemini, answerQuickQuestion } = require('./src/coachEngine');
const { LiveTipsEngine } = require('./src/liveTipsEngine');

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Overlays que o jogador liga/desliga na tela Overlays (salvos no config.json)
const DEFAULT_OVERLAYS = {
  objectives: true, // Notificações de objetivos
  benchmark: true, // Benchmarking de CS
  loadingScreen: true, // Resumo da tela de carregamento
  minimapTimers: true, // Timers de inibidor
  skillOrder: true, // Ordem de habilidades recomendada
  trinket: true, // Lembrete de sentinela
  itemValue: true // Diferença de valor de itens
};

let appConfig = {
  geminiApiKey: '',
  overlays: { ...DEFAULT_OVERLAYS }
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    appConfig = { ...appConfig, ...saved, overlays: { ...DEFAULT_OVERLAYS, ...(saved.overlays || {}) } };
  } catch (_) {}
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (_) {}
}

let ddragonVersion = '16.20.1';
let ddragonChampions = {};
let ddragonItems = {};
let championKeyMap = {};
let championNameMap = {};

// Estado atual do Draft (Ordem dos 5 slots do time inimigo: [0]=TOP, [1]=JUNGLE, [2]=MID, [3]=ADC, [4]=SUPPORT)
// Começa vazio: só é preenchido pela Seleção de Campeões, pela partida ao vivo ou quando você escolhe um campeão
let draftState = {
  role: 'TOP',
  autoDetectedLane: true,
  myChampionId: '',
  bannedChampions: [],
  enemyTeam: []
};

async function initDataDragon() {
  try {
    const verRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    if (verRes.ok) {
      const versions = await verRes.json();
      if (Array.isArray(versions) && versions.length > 0) {
        ddragonVersion = versions[0];
      }
    }

    const [champRes, itemRes] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/pt_BR/champion.json`),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/pt_BR/item.json`)
    ]);

    if (champRes.ok) {
      const champJson = await champRes.json();
      ddragonChampions = champJson.data || {};
      for (const [id, c] of Object.entries(ddragonChampions)) {
        championKeyMap[String(c.key)] = id;
        championNameMap[id.toLowerCase()] = id;
        championNameMap[c.name.toLowerCase()] = id;
      }
      console.log(`[Data Dragon] Carregados ${Object.keys(ddragonChampions).length} campeões (Patch ${ddragonVersion} pt_BR).`);
    }

    if (itemRes.ok) {
      const itemJson = await itemRes.json();
      ddragonItems = itemJson.data || {};
      console.log(`[Data Dragon] Carregados ${Object.keys(ddragonItems).length} itens e componentes (Patch ${ddragonVersion} pt_BR).`);
    }
  } catch (err) {
    console.warn('[Data Dragon] Aviso:', err.message);
  }
}

// =========================================================================
// DICAS PROATIVAS: observa a partida (porta 2999) e gera dicas sozinho
// =========================================================================
const guideCache = new Map();
function getLiveGuide(champId, rawEnemyIds) {
  const enemyIds = rawEnemyIds.map((id) => championNameMap[String(id).toLowerCase()] || id);
  const cacheKey = `${champId}|${enemyIds.join(',')}|${Object.keys(ddragonItems).length}`;
  if (!guideCache.has(cacheKey)) {
    if (guideCache.size > 20) guideCache.clear();
    guideCache.set(
      cacheKey,
      getChampionGuide(champId, ddragonChampions[champId] || null, enemyIds, ddragonChampions, ddragonItems)
    );
  }
  return guideCache.get(cacheKey);
}

const tipsEngine = new LiveTipsEngine({
  getGuide: getLiveGuide,
  isOverlayEnabled: (key) => appConfig.overlays[key] !== false
});

// Diferença de valor de itens entre os times (preço oficial do Data Dragon)
function computeItemValue(matchState) {
  if (!matchState) return null;
  const valueOf = (p) => (p.items || []).reduce((acc, it) => acc + (ddragonItems[String(it.itemID)]?.gold?.total || 0), 0);
  const allies = (matchState.allies || []).reduce((acc, p) => acc + valueOf(p), 0);
  const enemies = (matchState.enemies || []).reduce((acc, p) => acc + valueOf(p), 0);
  const myPos = matchState.activePlayer?.position;
  const meRow = (matchState.allies || []).find((p) => p.position === myPos);
  const laner = (matchState.enemies || []).find((p) => p.position === myPos);
  return {
    allies,
    enemies,
    diff: allies - enemies,
    lane: meRow && laner ? { me: valueOf(meRow), enemy: valueOf(laner), enemyChampion: laner.championName } : null
  };
}

// =========================================================================
// PERFIL (Início): elo, histórico de partidas e histórico de PDL salvo localmente
// =========================================================================
const LP_HISTORY_PATH = path.join(__dirname, 'lp-history.json');
let lpHistory = [];
try {
  if (fs.existsSync(LP_HISTORY_PATH)) lpHistory = JSON.parse(fs.readFileSync(LP_HISTORY_PATH, 'utf8')) || [];
} catch (_) {}

function recordLpSnapshot(rankedSolo) {
  if (!rankedSolo || !rankedSolo.tier || rankedSolo.tier === 'UNRANKED' || rankedSolo.tier === 'NONE') return;
  const last = lpHistory[lpHistory.length - 1];
  if (last && last.tier === rankedSolo.tier && last.division === rankedSolo.division && last.lp === rankedSolo.leaguePoints) return;
  lpHistory.push({ at: Date.now(), tier: rankedSolo.tier, division: rankedSolo.division, lp: rankedSolo.leaguePoints });
  if (lpHistory.length > 100) lpHistory = lpHistory.slice(-100);
  try {
    fs.writeFileSync(LP_HISTORY_PATH, JSON.stringify(lpHistory), 'utf8');
  } catch (_) {}
}

let profileCache = { at: 0, data: null };
async function buildProfile() {
  if (profileCache.data && Date.now() - profileCache.at < 60 * 1000) return profileCache.data;
  const [lcu, matches] = await Promise.all([getLCUState(championKeyMap), getMatchHistory(championKeyMap, 20)]);
  if (!lcu?.connected || !lcu.summoner) return { connected: false };
  recordLpSnapshot(lcu.summoner.rankedSolo);

  const games = (matches || []).filter((m) => !m.remake);
  const ranked = games.filter((m) => m.isRanked);

  // Desempenho por campeão (só ranqueadas)
  const byChamp = new Map();
  ranked.forEach((m) => {
    const c = byChamp.get(m.championId) || { championId: m.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    c.games++;
    if (m.win) c.wins++;
    c.kills += m.kills;
    c.deaths += m.deaths;
    c.assists += m.assists;
    byChamp.set(m.championId, c);
  });
  const championPerformance = [...byChamp.values()]
    .sort((a, b) => b.games - a.games)
    .map((c) => ({
      ...c,
      losses: c.games - c.wins,
      winRate: Math.round((c.wins / c.games) * 100),
      kda: Number(((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(1))
    }));

  // Jogou recentemente com (aliados que aparecem em 2+ partidas)
  const myPuuid = lcu.summoner.puuid;
  const mates = new Map();
  games.forEach((m) => {
    m.participants
      .filter((p) => p.teamId === m.teamId && p.puuid && p.puuid !== myPuuid)
      .forEach((p) => {
        const key = p.puuid;
        const e = mates.get(key) || { name: p.name, tag: p.tag, championId: p.championId, games: 0, wins: 0 };
        e.games++;
        if (m.win) e.wins++;
        mates.set(key, e);
      });
  });
  const recentlyPlayedWith = [...mates.values()]
    .filter((e) => e.games >= 2)
    .sort((a, b) => b.games - a.games)
    .slice(0, 8)
    .map((e) => ({ ...e, losses: e.games - e.wins, winRate: Math.round((e.wins / e.games) * 100) }));

  const data = {
    connected: true,
    summoner: lcu.summoner,
    matches: matches || [],
    matchHistoryAvailable: Array.isArray(matches),
    championPerformance,
    recentlyPlayedWith,
    lpHistory: lpHistory.slice(-20)
  };
  profileCache = { at: Date.now(), data };
  return data;
}
const TIPS_POLL_MS = 2000;
let liveTipFeed = []; // dicas prontas para o painel (já refinadas pelo Gemini quando houver chave)

async function tipsLoopTick() {
  try {
    const liveRaw = await fetchLiveGameData();
    const matchState = liveRaw ? parseLiveMatchState(liveRaw, championNameMap) : null;
    if (!matchState) {
      tipsEngine.update(null, null);
      return;
    }
    if (!tipsEngine.inGame) liveTipFeed = []; // partida nova: limpa as dicas da anterior
    const tip = tipsEngine.update(liveRaw, matchState);
    if (tip) {
      const finalTip = await refineTipWithGemini(tip, matchState, appConfig.geminiApiKey);
      liveTipFeed.push(finalTip);
      if (liveTipFeed.length > 20) liveTipFeed.shift();
      console.log(`[Dica ${finalTip.formattedTime}] ${finalTip.title}: ${finalTip.message}`);
    }
  } catch (err) {
    console.warn('[Dicas] Aviso:', err.message);
  } finally {
    setTimeout(tipsLoopTick, TIPS_POLL_MS);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function serveStaticFile(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '/overlay') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Arquivo não encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// Aberto pelo launcher (que fecha sozinho), o servidor encerra quando a janela do app
// fica fechada por alguns minutos, para não ficar rodando escondido para sempre.
const AUTO_EXIT = process.env.BB_AUTO_EXIT === '1';
const AUTO_EXIT_IDLE_MS = 5 * 60 * 1000;
let lastAppPollAt = Date.now();
if (AUTO_EXIT) {
  setInterval(() => {
    if (Date.now() - lastAppPollAt > AUTO_EXIT_IDLE_MS) {
      console.log('[Babilonia Buff] Janela do app fechada há 5 minutos. Encerrando o servidor.');
      process.exit(0);
    }
  }, 30 * 1000).unref();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 1. Status em Tempo Real (LCU + Detecção Automática de Lane + Live Client 2999)
  if ((pathname === '/api/status' || pathname === '/api/state') && req.method === 'GET') {
    if (pathname === '/api/status') lastAppPollAt = Date.now();
    const [lcuState, liveRaw] = await Promise.all([
      getLCUState(championKeyMap),
      fetchLiveGameData()
    ]);

    // Sincronização Automática com o Cliente do LoL na Seleção de Campeões
    if (lcuState?.champSelect) {
      const cs = lcuState.champSelect;
      if (cs.detectedRole) {
        draftState.role = cs.detectedRole;
        draftState.autoDetectedLane = true;
      }
      if (Array.isArray(cs.bannedChampions) && cs.bannedChampions.length > 0) {
        draftState.bannedChampions = cs.bannedChampions;
      }
      const liveEnemies = (cs.theirTeam || []).map((p) => p.championId).filter(Boolean);
      if (liveEnemies.length > 0) {
        draftState.enemyTeam = liveEnemies;
      }
      if (cs.myChampionId) {
        draftState.myChampionId = cs.myChampionId;
      }
    }

    const matchState = liveRaw ? parseLiveMatchState(liveRaw, championNameMap) : null;

    // Fora de Seleção de Campeões e de partida: limpa o draft da partida anterior
    const phase = lcuState?.phase || 'Disconnected';
    if (!liveRaw && !['ChampSelect', 'GameStart', 'InProgress', 'ReadyCheck'].includes(phase)) {
      draftState.bannedChampions = [];
      draftState.enemyTeam = [];
    }

    // Quando a partida ao vivo começa (porta 2999), sincroniza automaticamente seu Campeão, Rota e os 5 Inimigos!
    if (matchState?.activePlayer) {
      const pPos = (matchState.activePlayer.position || '').toUpperCase();
      if (['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(pPos)) {
        draftState.role =
          pPos === 'MIDDLE' ? 'MID' : pPos === 'BOTTOM' ? 'ADC' : pPos === 'UTILITY' ? 'SUPPORT' : pPos;
      }
      if (matchState.activePlayer.championId) {
        draftState.myChampionId = matchState.activePlayer.championId;
      }
      if (Array.isArray(matchState.enemies) && matchState.enemies.length > 0) {
        const posOrder = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
        const orderedEnemies = [...matchState.enemies].sort(
          (a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9)
        );
        const realEnemyIds = orderedEnemies
          .map((e) => {
            const raw = (e.championName || '').toLowerCase();
            return championNameMap[raw] || (e.championName || '').replace(/[^a-zA-Z]/g, '');
          })
          .filter(Boolean);
        if (realEnemyIds.length > 0) {
          draftState.enemyTeam = realEnemyIds;
        }
      }
    }

    const activeChampId =
      matchState?.activePlayer?.championId || lcuState?.champSelect?.myChampionId || draftState.myChampionId || null;

    const liveEnemyIds = (matchState?.enemies || [])
      .map((e) => championNameMap[(e.championName || '').toLowerCase()] || (e.championName || '').replace(/[^a-zA-Z]/g, ''))
      .filter(Boolean);
    const coaching = {
      championGuide: matchState ? getLiveGuide(activeChampId, liveEnemyIds.length ? liveEnemyIds : draftState.enemyTeam) : null
    };

    return sendJson(res, 200, {
      timestamp: Date.now(),
      ddragonVersion,
      hasGeminiKey: hasGeminiKey(appConfig.geminiApiKey),
      lcu: lcuState,
      inLiveGame: Boolean(liveRaw),
      draftState,
      matchState,
      activeChampionId: activeChampId,
      coaching,
      liveTips: liveTipFeed,
      overlays: appConfig.overlays,
      itemValue: appConfig.overlays.itemValue ? computeItemValue(matchState) : null
    });
  }

  // 2. Análise de Draft Pós-Banimentos: Retorna 3 Counters do Oponente de Rota + 3 Mais Fortes do Meta (Sem Repetição!) + 3 Builds
  if (pathname === '/api/draft/analyze' && (req.method === 'POST' || req.method === 'GET')) {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.role) draftState.role = body.role;
      if (typeof body.myChampionId === 'string') {
        draftState.myChampionId = body.myChampionId;
      }
      if (Array.isArray(body.bannedChampions)) {
        draftState.bannedChampions = body.bannedChampions.filter(Boolean);
      }
      if (Array.isArray(body.enemyTeam)) {
        draftState.enemyTeam = body.enemyTeam.map((c) => c || ''); // mantém a posição de cada rota
      }
    }

    const recommendations = getTop6MetaPicks({
      role: draftState.role,
      bannedChampions: draftState.bannedChampions,
      enemyTeam: draftState.enemyTeam,
      ddragonVersion,
      ddragonChampions
    });

    const myId = draftState.myChampionId || '';
    const resolvedId = championNameMap[myId.toLowerCase()] || myId;
    const guide = resolvedId
      ? getChampionGuide(resolvedId, ddragonChampions[resolvedId] || null, draftState.enemyTeam, ddragonChampions, ddragonItems)
      : null;

    return sendJson(res, 200, {
      ddragonVersion,
      draftState,
      recommendations, // { detectedRole, enemyLanerId, enemyLanerName, counterPicks (3), metaPicks (3), allSix (6) }
      top6MetaPicks: recommendations.allSix,
      guide: guide
        ? { ...guide, iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${guide.id}.png` }
        : null
    });
  }

  // 3. Lista de todos os Campeões
  if (pathname === '/api/champions' && req.method === 'GET') {
    const list = Object.values(ddragonChampions).map((c) => {
      const guide = getChampionGuide(c.id, c, draftState.enemyTeam, ddragonChampions, ddragonItems);
      return {
        id: c.id,
        key: c.key,
        name: c.name,
        title: c.title,
        tags: c.tags,
        role: guide.role,
        lanes: getChampionLanes(c.id, guide.role),
        ranked: getRankedMetaEntry(c.id), // null quando não há dado fixo de ranqueada
        tier: guide.tier,
        winRate: guide.winRate,
        difficulty: guide.difficulty,
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${c.id}.png`
      };
    });

    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return sendJson(res, 200, { ddragonVersion, count: list.length, champions: list });
  }

  // 4. Guia Detalhado de um Campeão Específico
  if (pathname.startsWith('/api/champion/') && req.method === 'GET') {
    const champId = decodeURIComponent(pathname.replace('/api/champion/', '').trim());
    const resolvedId = championNameMap[champId.toLowerCase()] || champId;
    const ddragonChamp = ddragonChampions[resolvedId] || null;
    const guide = getChampionGuide(resolvedId, ddragonChamp, draftState.enemyTeam, ddragonChampions, ddragonItems);

    return sendJson(res, 200, {
      ddragonVersion,
      guide: {
        ...guide,
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${guide.id}.png`
      }
    });
  }

  // 5. Exportar Página de Runas Direto para o Cliente do LoL
  if (pathname === '/api/lcu/export-runes' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const champId = body.championId || draftState.myChampionId;
    if (!champId) {
      return sendJson(res, 400, { ok: false, message: 'Escolha um campeão antes de exportar as runas.' });
    }
    const buildIdx = Number(body.buildIndex || 0);
    const ddragonChamp = ddragonChampions[champId] || null;
    const guide = getChampionGuide(champId, ddragonChamp, draftState.enemyTeam, ddragonChampions, ddragonItems);
    const chosenBuild = (guide.builds && guide.builds[buildIdx]) || guide.builds[0];

    try {
      const result = await exportRunePageToLCU({
        name: chosenBuild.runes.name || `Babilonia Buff: ${guide.name}`,
        primaryStyleId: chosenBuild.runes.primaryStyleId,
        subStyleId: chosenBuild.runes.subStyleId,
        selectedPerkIds: chosenBuild.runes.selectedPerkIds
      });
      return sendJson(res, 200, {
        ok: true,
        message: `Runas da "${chosenBuild.badge}" (${guide.name}) exportadas e ativadas no LoL!`,
        page: result
      });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        message: err.message || 'Abra o Cliente do League of Legends para exportar as runas automaticamente.'
      });
    }
  }

  // 6. Assistente Tático: perguntas prontas (botões) respondidas com os dados da partida
  if (pathname === '/api/coach/quick' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const liveRaw = await fetchLiveGameData();
    const matchState = liveRaw ? parseLiveMatchState(liveRaw, championNameMap) : null;
    const enemyIds = (matchState?.enemies || []).map(
      (e) => championNameMap[(e.championName || '').toLowerCase()] || (e.championName || '').replace(/[^a-zA-Z]/g, '')
    );
    const guide = matchState ? getLiveGuide(matchState.activePlayer.championId, enemyIds) : null;
    const local = answerQuickQuestion(String(body.questionId || ''), matchState, guide);
    if (!local) return sendJson(res, 400, { ok: false, message: 'Pergunta desconhecida.' });
    const answer = matchState ? await refineTipWithGemini(local, matchState, appConfig.geminiApiKey) : local;
    return sendJson(res, 200, { ok: true, title: answer.title, message: answer.message, source: answer.source || 'local' });
  }

  // 7. Perfil do jogador (Início)
  if (pathname === '/api/profile' && req.method === 'GET') {
    if (url.searchParams.get('refresh') === '1') profileCache.at = 0;
    return sendJson(res, 200, { ddragonVersion, ...(await buildProfile()) });
  }

  // 8. Overlays: lê e salva o que o jogador ligou/desligou
  if (pathname === '/api/overlays' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      Object.keys(DEFAULT_OVERLAYS).forEach((k) => {
        if (typeof body[k] === 'boolean') appConfig.overlays[k] = body[k];
      });
      saveConfig();
    }
    return sendJson(res, 200, { overlays: appConfig.overlays });
  }

  // 9. Salvar Configurações
  if (pathname === '/api/config' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (typeof body.geminiApiKey === 'string') {
      appConfig.geminiApiKey = body.geminiApiKey.trim();
    }
    saveConfig();
    return sendJson(res, 200, {
      ok: true,
      hasGeminiKey: hasGeminiKey(appConfig.geminiApiKey)
    });
  }

  serveStaticFile(req, res);
});

initDataDragon().then(() => {
  server.listen(PORT, () => {
    console.log('==============================================================');
    console.log(`⚡ Babilonia Buff rodando em: http://localhost:${PORT}`);
    console.log('==============================================================');
  });
  tipsLoopTick();
});
