/**
 * Conector Live Client Data API (Porta 2999)
 * Lê os dados da partida em andamento a cada segundo (Ouro, KDA, CS, Itens, Eventos de Dragão/Barão).
 */

const https = require('https');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

function fetchLiveGameData() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        method: 'GET',
        agent: httpsAgent,
        timeout: 1200
      },
      (res) => {
        if (res.statusCode !== 200) {
          return resolve(null);
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.activePlayer && parsed.allPlayers) {
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (_) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Normaliza os dados da Live Client Data API em um resumo tático limpo
 * para a interface e para o Coach de IA.
 */
function parseLiveMatchState(rawGame, championNameMap = {}) {
  if (!rawGame || !rawGame.activePlayer || !rawGame.allPlayers) {
    return null;
  }

  const gameTime = Math.floor(rawGame.gameData?.gameTime || 0);
  const activeName = rawGame.activePlayer.summonerName || rawGame.activePlayer.riotIdGameName || '';

  // Identifica o jogador ativo na lista de 10 jogadores
  let me =
    rawGame.allPlayers.find(
      (p) =>
        p.summonerName === activeName ||
        p.riotIdGameName === activeName ||
        (activeName && p.summonerName && p.summonerName.includes(activeName))
    ) || rawGame.allPlayers[0];

  const myTeamId = me?.team || 'ORDER';
  const allies = rawGame.allPlayers.filter((p) => p.team === myTeamId);
  const enemies = rawGame.allPlayers.filter((p) => p.team !== myTeamId);

  const teamKills = allies.reduce((acc, p) => acc + (p.scores?.kills || 0), 0);
  const enemyKills = enemies.reduce((acc, p) => acc + (p.scores?.kills || 0), 0);

  const myKills = me?.scores?.kills || 0;
  const myDeaths = me?.scores?.deaths || 0;
  const myAssists = me?.scores?.assists || 0;
  const myCS = me?.scores?.creepScore || 0;
  const minutes = Math.max(gameTime / 60, 1);
  const csPerMin = Number((myCS / minutes).toFixed(1));
  const killParticipation =
    teamKills > 0 ? Math.round(((myKills + myAssists) / teamKills) * 100) : 0;

  // Calcula temporizadores dos objetivos baseado nos eventos da partida
  const events = rawGame.events?.Events || [];
  const objectives = computeObjectiveTimers(gameTime, events);

  // Encontra a maior ameaça inimiga (quem tem mais abates no time adversário)
  const sortedEnemies = [...enemies].sort(
    (a, b) => (b.scores?.kills || 0) - (a.scores?.kills || 0)
  );
  const biggestThreat = sortedEnemies[0] || null;

  // Normaliza o nome/ID do campeão
  const rawChampName = me?.championName || 'Yasuo';
  const resolvedChampId = championNameMap[rawChampName.toLowerCase()] || rawChampName.replace(/[^a-zA-Z]/g, '');

  return {
    gameTime,
    formattedTime: formatSeconds(gameTime),
    gameMode: rawGame.gameData?.gameMode || 'CLASSIC',
    teamScore: {
      allies: teamKills,
      enemies: enemyKills
    },
    activePlayer: {
      summonerName: me?.summonerName || activeName || 'Você',
      championName: rawChampName,
      championId: resolvedChampId,
      position: me?.position || 'MIDDLE',
      level: rawGame.activePlayer.level || me?.level || 1,
      currentGold: Math.floor(rawGame.activePlayer.currentGold || 0),
      kills: myKills,
      deaths: myDeaths,
      assists: myAssists,
      kdaRatio: Number(((myKills + myAssists) / Math.max(1, myDeaths)).toFixed(2)),
      cs: myCS,
      csPerMin,
      killParticipation,
      wardScore: Number((me?.scores?.wardScore || 0).toFixed(1)),
      items: (me?.items || []).map((it) => ({
        itemID: it.itemID,
        displayName: it.displayName,
        count: it.count || 1
      })),
      stats: rawGame.activePlayer.championStats || {}
    },
    allies: allies.map(formatPlayerRow),
    enemies: enemies.map(formatPlayerRow),
    biggestThreat: biggestThreat ? formatPlayerRow(biggestThreat) : null,
    objectives
  };
}

function formatPlayerRow(p) {
  const k = p.scores?.kills || 0;
  const d = p.scores?.deaths || 0;
  const a = p.scores?.assists || 0;
  return {
    summonerName: p.summonerName || p.riotIdGameName || p.championName,
    championName: p.championName,
    position: p.position || 'NONE',
    level: p.level || 1,
    kills: k,
    deaths: d,
    assists: a,
    cs: p.scores?.creepScore || 0,
    isDead: Boolean(p.isDead),
    respawnTimer: Math.ceil(p.respawnTimer || 0),
    items: (p.items || []).map((i) => ({ itemID: i.itemID, displayName: i.displayName })),
    isFed: k >= 4 && k > d * 1.5,
    isVulnerable: d >= 4 && d > k
  };
}

function computeObjectiveTimers(gameTime, events) {
  // Dragão: nasce aos 5:00 (300s), renasce 5 min (300s) após ser abatido
  const dragonKills = events.filter((e) => e.EventName === 'DragonKill');
  let dragonNextSpawn = 300;
  if (dragonKills.length > 0) {
    const lastKill = dragonKills[dragonKills.length - 1].EventTime;
    dragonNextSpawn = Math.floor(lastKill + 300);
  }
  const dragonRemaining = Math.max(0, dragonNextSpawn - gameTime);

  // Vastilarvas / Arauto: Vastilarvas aos 6:00 (360s), Arauto aos 14:00 (840s)
  let pitLabel = gameTime < 800 ? 'Vastilarvas' : 'Arauto do Vale';
  let pitSpawn = gameTime < 800 ? 360 : 840;
  const heraldKills = events.filter((e) => e.EventName === 'HeraldKill');
  if (heraldKills.length > 0 && gameTime >= 840) {
    pitSpawn = 1200;
    pitLabel = 'Barão Nashor';
  }
  const pitRemaining = Math.max(0, pitSpawn - gameTime);

  // Barão Nashor: nasce aos 20:00 (1200s), renasce 6 min (360s) após ser abatido
  const baronKills = events.filter((e) => e.EventName === 'BaronKill');
  let baronNextSpawn = 1200;
  if (baronKills.length > 0) {
    const lastBaron = baronKills[baronKills.length - 1].EventTime;
    baronNextSpawn = Math.floor(lastBaron + 360);
  }
  const baronRemaining = Math.max(0, baronNextSpawn - gameTime);

  return {
    dragon: {
      name: 'Dragão Elemental',
      killsCount: dragonKills.length,
      secondsRemaining: dragonRemaining,
      statusText: dragonRemaining === 0 ? 'VIVO NO MAPA' : formatSeconds(dragonRemaining),
      isUrgent: dragonRemaining > 0 && dragonRemaining <= 60
    },
    heraldOrGrubs: {
      name: pitLabel,
      secondsRemaining: gameTime >= 1200 ? 0 : pitRemaining,
      statusText:
        gameTime >= 1200
          ? 'Substituído pelo Barão'
          : pitRemaining === 0
          ? 'VIVO NO MAPA'
          : formatSeconds(pitRemaining),
      isUrgent: gameTime < 1200 && pitRemaining > 0 && pitRemaining <= 60
    },
    baron: {
      name: 'Barão Nashor',
      killsCount: baronKills.length,
      secondsRemaining: baronRemaining,
      statusText: baronRemaining === 0 ? 'VIVO NO MAPA' : formatSeconds(baronRemaining),
      isUrgent: baronRemaining > 0 && baronRemaining <= 75
    }
  };
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  fetchLiveGameData,
  parseLiveMatchState
};
