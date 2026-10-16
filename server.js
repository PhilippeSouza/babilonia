/**
 * Servidor Principal - Babilônia
 * Detecta automaticamente a Lane que você caiu via LCU,
 * retorna 3 Counters do seu Oponente de Rota + 3 Mais Fortes do Meta (sem repetição)
 * e gera as 3 Opções de Build para o campeão escolhido.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getLCUState, exportRunePageToLCU } = require('./src/lcu');
const { fetchLiveGameData, parseLiveMatchState, createSimulatedRawGame } = require('./src/liveClient');
const { getChampionGuide, getTop6MetaPicks } = require('./src/championsDb');
const { generateLocalTacticalCoaching, answerPlayerQuestion } = require('./src/coachEngine');

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

let appConfig = {
  geminiApiKey: ''
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
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
let draftState = {
  role: 'TOP',
  autoDetectedLane: true,
  myChampionId: 'Renekton',
  bannedChampions: ['Jax', 'Garen', 'Zed'],
  enemyTeam: ['Aatrox', 'LeeSin', 'Malzahar', 'Jinx', 'Leona']
};

let simulatorState = {
  enabled: false,
  scenario: 'dragon_gold',
  championId: 'Renekton',
  enemyChampionId: 'Aatrox',
  gameTime: 560,
  level: 8,
  currentGold: 1550,
  kills: 3,
  deaths: 1,
  assists: 2,
  cs: 74
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 1. Status em Tempo Real (LCU + Detecção Automática de Lane + Live Client 2999)
  if ((pathname === '/api/status' || pathname === '/api/state') && req.method === 'GET') {
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

    // Modo 100% Real (Sem Simulador)
    simulatorState.enabled = false;
    const matchState = liveRaw ? parseLiveMatchState(liveRaw, championNameMap) : null;

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
      matchState?.activePlayer?.championId ||
      lcuState?.champSelect?.myChampionId ||
      draftState.myChampionId ||
      'Renekton';

    const ddragonChamp = ddragonChampions[activeChampId] || null;
    const coaching = generateLocalTacticalCoaching(
      matchState,
      ddragonChamp,
      draftState.enemyTeam,
      ddragonChampions,
      ddragonItems
    );

    return sendJson(res, 200, {
      timestamp: Date.now(),
      ddragonVersion,
      hasGeminiKey: Boolean(appConfig.geminiApiKey && appConfig.geminiApiKey.trim().length > 10),
      lcu: lcuState,
      inLiveGame: Boolean(liveRaw),
      isSimulated: false,
      simulatorState,
      draftState,
      matchState,
      activeChampionId: activeChampId,
      coaching
    });
  }

  // 2. Análise de Draft Pós-Banimentos: Retorna 3 Counters do Oponente de Rota + 3 Mais Fortes do Meta (Sem Repetição!) + 3 Builds
  if (pathname === '/api/draft/analyze' && (req.method === 'POST' || req.method === 'GET')) {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.role) draftState.role = body.role;
      if (body.myChampionId) {
        draftState.myChampionId = body.myChampionId;
      }
      if (Array.isArray(body.bannedChampions)) {
        draftState.bannedChampions = body.bannedChampions.filter(Boolean);
      }
      if (Array.isArray(body.enemyTeam)) {
        draftState.enemyTeam = body.enemyTeam.filter(Boolean);
      }
    }

    const recommendations = getTop6MetaPicks({
      role: draftState.role,
      bannedChampions: draftState.bannedChampions,
      enemyTeam: draftState.enemyTeam,
      ddragonVersion,
      ddragonChampions
    });

    const resolvedId = championNameMap[draftState.myChampionId.toLowerCase()] || draftState.myChampionId;
    const ddragonChamp = ddragonChampions[resolvedId] || null;
    const guide = getChampionGuide(resolvedId, ddragonChamp, draftState.enemyTeam, ddragonChampions, ddragonItems);

    return sendJson(res, 200, {
      ddragonVersion,
      draftState,
      recommendations, // { detectedRole, enemyLanerId, enemyLanerName, counterPicks (3), metaPicks (3), allSix (6) }
      top6MetaPicks: recommendations.allSix,
      guide: {
        ...guide,
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${guide.id}.png`
      }
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
    const champId = body.championId || draftState.myChampionId || 'Renekton';
    const buildIdx = Number(body.buildIndex || 0);
    const ddragonChamp = ddragonChampions[champId] || null;
    const guide = getChampionGuide(champId, ddragonChamp, draftState.enemyTeam, ddragonChampions, ddragonItems);
    const chosenBuild = (guide.builds && guide.builds[buildIdx]) || guide.builds[0];

    try {
      const result = await exportRunePageToLCU({
        name: chosenBuild.runes.name || `Blitz: ${guide.name}`,
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

  // 6. Perguntar ao Assistente Tático IA
  if (pathname === '/api/coach/ask' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const liveRaw = await fetchLiveGameData();
    const rawToUse = liveRaw || (simulatorState.enabled ? createSimulatedRawGame(simulatorState) : null);
    const matchState = rawToUse ? parseLiveMatchState(rawToUse, championNameMap) : null;

    const champId = body.championId || draftState.myChampionId || 'Darius';
    const ddragonChamp = ddragonChampions[champId] || null;

    const response = await answerPlayerQuestion({
      question: body.question,
      matchState,
      selectedChampionId: champId,
      enemyChampionId: draftState.enemyTeam[0] || simulatorState.enemyChampionId,
      geminiApiKey: appConfig.geminiApiKey,
      ddragonChampData: ddragonChamp
    });

    return sendJson(res, 200, response);
  }

  // 7. Controlar o Simulador
  if ((pathname === '/api/simulator' || pathname === '/api/simulate') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (typeof body.enabled === 'boolean') simulatorState.enabled = body.enabled;
    if (body.championId) {
      simulatorState.championId = body.championId;
      draftState.myChampionId = body.championId;
    }
    if (body.enemyChampionId) simulatorState.enemyChampionId = body.enemyChampionId;
    if (body.scenario) {
      simulatorState.scenario = body.scenario;
      if (body.scenario === 'early_lane') {
        Object.assign(simulatorState, { gameTime: 210, level: 3, currentGold: 450, kills: 1, deaths: 0, assists: 0, cs: 24 });
      } else if (body.scenario === 'dragon_gold') {
        Object.assign(simulatorState, { gameTime: 560, level: 8, currentGold: 1550, kills: 3, deaths: 1, assists: 2, cs: 74 });
      } else if (body.scenario === 'late_baron') {
        Object.assign(simulatorState, { gameTime: 1150, level: 14, currentGold: 2100, kills: 7, deaths: 3, assists: 6, cs: 162 });
      }
    }
    return sendJson(res, 200, { ok: true, simulatorState });
  }

  // 8. Salvar Configurações
  if (pathname === '/api/config' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (typeof body.geminiApiKey === 'string') {
      appConfig.geminiApiKey = body.geminiApiKey.trim();
    }
    saveConfig();
    return sendJson(res, 200, {
      ok: true,
      hasGeminiKey: Boolean(appConfig.geminiApiKey && appConfig.geminiApiKey.length > 10)
    });
  }

  serveStaticFile(req, res);
});

initDataDragon().then(() => {
  server.listen(PORT, () => {
    console.log('==============================================================');
    console.log(`⚡ Babilônia rodando em: http://localhost:${PORT}`);
    console.log('==============================================================');
  });
});
