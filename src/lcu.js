/**
 * Conector LCU (League Client Update API)
 * Detecta automaticamente o cliente do League of Legends aberto no Windows,
 * identifica automaticamente a Rota (Lane) que você caiu, os Banimentos e o Time Inimigo.
 */

const https = require('https');
const fs = require('fs');
const { exec } = require('child_process');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

let cachedCredentials = null;
let lastScanTime = 0;

const COMMON_LOCKFILE_PATHS = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'E:\\Riot Games\\League of Legends\\lockfile'
];

// Converte a posição interna da Riot (LCU) para nossa Rota padrão
function normalizeRiotPosition(pos) {
  if (!pos) return null;
  const p = String(pos).toUpperCase().trim();
  if (p === 'TOP') return 'TOP';
  if (p === 'JUNGLE') return 'JUNGLE';
  if (p === 'MIDDLE' || p === 'MID') return 'MID';
  if (p === 'BOTTOM' || p === 'BOT' || p === 'ADC') return 'ADC';
  if (p === 'UTILITY' || p === 'SUPPORT' || p === 'SUP') return 'SUPPORT';
  return null;
}

function parseLockfile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      const parts = content.split(':');
      if (parts.length >= 5) {
        return {
          port: parts[2],
          token: parts[3],
          protocol: parts[4] || 'https'
        };
      }
    }
  } catch (_) {}
  return null;
}

function discoverLCUCredentials() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (cachedCredentials && now - lastScanTime < 5000) {
      return resolve(cachedCredentials);
    }
    lastScanTime = now;

    for (const lockPath of COMMON_LOCKFILE_PATHS) {
      const creds = parseLockfile(lockPath);
      if (creds) {
        cachedCredentials = creds;
        return resolve(creds);
      }
    }

    const cmd = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = \'LeagueClientUx.exe\'\\" | Select-Object -ExpandProperty CommandLine"';
    exec(cmd, { timeout: 3500 }, (err, stdout) => {
      if (err || !stdout) {
        cachedCredentials = null;
        return resolve(null);
      }
      const portMatch = stdout.match(/--app-port=([0-9]+)/);
      const tokenMatch = stdout.match(/--remoting-auth-token=([\w_-]+)/);
      if (portMatch && tokenMatch) {
        cachedCredentials = {
          port: portMatch[1],
          token: tokenMatch[1],
          protocol: 'https'
        };
        return resolve(cachedCredentials);
      }
      cachedCredentials = null;
      return resolve(null);
    });
  });
}

function lcuRequest(method, endpoint, body = null, creds = null) {
  return new Promise(async (resolve, reject) => {
    const credentials = creds || (await discoverLCUCredentials());
    if (!credentials) {
      return reject(new Error('Cliente do League of Legends não detectado.'));
    }

    const auth = Buffer.from(`riot:${credentials.token}`).toString('base64');
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: credentials.port,
      path: endpoint,
      method,
      agent: httpsAgent,
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${auth}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 2500
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (_) {
            resolve(raw);
          }
        } else {
          reject(new Error(`LCU HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });

    req.on('error', (err) => {
      cachedCredentials = null;
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao comunicar com LCU'));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function getLCUState(championKeyMap = {}) {
  const creds = await discoverLCUCredentials();
  if (!creds) {
    return { connected: false, phase: 'Disconnected' };
  }

  try {
    const [summoner, phase, rankedRaw] = await Promise.all([
      lcuRequest('GET', '/lol-summoner/v1/current-summoner', null, creds).catch(() => null),
      lcuRequest('GET', '/lol-gameflow/v1/gameflow-phase', null, creds).catch(() => 'None'),
      lcuRequest('GET', '/lol-ranked/v1/current-ranked-stats', null, creds).catch(() => null)
    ]);

    const readQueue = (q) =>
      q
        ? {
            tier: q.tier || 'UNRANKED',
            division: q.division || '',
            leaguePoints: q.leaguePoints || 0,
            wins: q.wins || 0,
            losses: q.losses || 0
          }
        : null;
    const rankedSolo = readQueue(rankedRaw?.queueMap?.RANKED_SOLO_5x5);
    const rankedFlex = readQueue(rankedRaw?.queueMap?.RANKED_FLEX_SR);

    let champSelect = null;
    if (phase === 'ChampSelect') {
      try {
        const session = await lcuRequest('GET', '/lol-champ-select/v1/session', null, creds);
        if (session && Array.isArray(session.myTeam)) {
          const localCellId = session.localPlayerCellId;
          const me = session.myTeam.find((p) => p.cellId === localCellId) || {};
          const myChampKey = String(me.championId || me.championPickIntent || 0);
          const detectedRole = normalizeRiotPosition(me.assignedPosition);

          const bannedSet = new Set();
          if (session.bans) {
            [...(session.bans.myTeamBans || []), ...(session.bans.theirTeamBans || [])].forEach((k) => {
              const cid = championKeyMap[String(k)];
              if (cid) bannedSet.add(cid);
            });
          }
          if (Array.isArray(session.actions)) {
            session.actions.flat().forEach((act) => {
              if (act && act.type === 'ban' && act.completed && act.championId) {
                const cid = championKeyMap[String(act.championId)];
                if (cid) bannedSet.add(cid);
              }
            });
          }

          champSelect = {
            subphase: session.timer?.phase || 'BAN_PICK',
            myChampionId: championKeyMap[myChampKey] || null,
            assignedPosition: me.assignedPosition || '',
            detectedRole,
            bannedChampions: Array.from(bannedSet),
            myTeam: session.myTeam.map((p) => ({
              cellId: p.cellId,
              position: normalizeRiotPosition(p.assignedPosition) || '',
              championId: championKeyMap[String(p.championId || p.championPickIntent || 0)] || null
            })),
            theirTeam: (session.theirTeam || []).map((p) => ({
              cellId: p.cellId,
              position: normalizeRiotPosition(p.assignedPosition) || '',
              championId: championKeyMap[String(p.championId || p.championPickIntent || 0)] || null
            }))
          };
        }
      } catch (_) {}
    }

    return {
      connected: true,
      phase: typeof phase === 'string' ? phase : 'Lobby',
      summoner: summoner
        ? {
            gameName: summoner.gameName || summoner.displayName || 'Invocador',
            tagLine: summoner.tagLine || 'BR1',
            summonerLevel: summoner.summonerLevel || 1,
            profileIconId: summoner.profileIconId || 29,
            puuid: summoner.puuid || '',
            rankedSolo,
            rankedFlex
          }
        : null,
      champSelect
    };
  } catch (_) {
    return { connected: false, phase: 'Disconnected' };
  }
}

const QUEUE_NAMES = {
  420: 'Ranqueada Solo/Duo',
  440: 'Ranqueada Flex',
  400: 'Normal (Escolha)',
  430: 'Normal (Às Cegas)',
  490: 'Partida Rápida',
  450: 'ARAM',
  1700: 'Arena',
  1900: 'URF'
};

/**
 * Histórico de partidas recentes do jogador logado (somente leitura, via LCU).
 * Devolve as partidas já resumidas para a tela de perfil.
 */
async function getMatchHistory(championKeyMap = {}, count = 20) {
  const creds = await discoverLCUCredentials();
  if (!creds) return null;
  try {
    const summoner = await lcuRequest('GET', '/lol-summoner/v1/current-summoner', null, creds);
    const raw = await lcuRequest(
      'GET',
      `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`,
      null,
      creds
    );
    const games = raw?.games?.games || [];
    const myPuuid = summoner?.puuid;

    return games.map((g) => {
      const identities = g.participantIdentities || [];
      const nameOf = (pid) => {
        const pl = identities.find((i) => i.participantId === pid)?.player || {};
        return { name: pl.gameName || pl.summonerName || '', tag: pl.tagLine || '', puuid: pl.puuid || '' };
      };
      const participants = (g.participants || []).map((p) => ({
        ...nameOf(p.participantId),
        teamId: p.teamId,
        championId: championKeyMap[String(p.championId)] || String(p.championId)
      }));
      const myIdentity = identities.find((i) => i.player?.puuid === myPuuid) || identities[0];
      const me = (g.participants || []).find((p) => p.participantId === myIdentity?.participantId) || g.participants?.[0] || {};
      const st = me.stats || {};
      const minutes = Math.max(1, (g.gameDuration || 0) / 60);
      const cs = (st.totalMinionsKilled || 0) + (st.neutralMinionsKilled || 0);
      return {
        gameId: g.gameId,
        queueId: g.queueId,
        queueName: QUEUE_NAMES[g.queueId] || 'Outro modo',
        isRanked: g.queueId === 420 || g.queueId === 440,
        createdAt: g.gameCreation,
        durationSec: g.gameDuration || 0,
        remake: (g.gameDuration || 0) < 300,
        win: Boolean(st.win),
        championId: championKeyMap[String(me.championId)] || String(me.championId || ''),
        teamId: me.teamId,
        kills: st.kills || 0,
        deaths: st.deaths || 0,
        assists: st.assists || 0,
        cs,
        csPerMin: Number((cs / minutes).toFixed(1)),
        goldPerMin: Math.round((st.goldEarned || 0) / minutes),
        items: [st.item0, st.item1, st.item2, st.item3, st.item4, st.item5, st.item6].map((i) => i || 0),
        participants
      };
    });
  } catch (_) {
    return null;
  }
}

async function exportRunePageToLCU(runePageData) {
  const creds = await discoverLCUCredentials();
  if (!creds) {
    throw new Error('O Cliente do League of Legends não está aberto no momento.');
  }

  const pages = await lcuRequest('GET', '/lol-perks/v1/pages', null, creds);
  if (Array.isArray(pages)) {
    const ownPagePrefixes = ['Babilonia Buff', 'Babilônia:', 'Blitz:', 'Blitz Anti-Comp:'];
    const existingBaronPage = pages.find((p) => p.name && ownPagePrefixes.some((prefix) => p.name.startsWith(prefix)));
    if (existingBaronPage && existingBaronPage.isDeletable !== false) {
      await lcuRequest('DELETE', `/lol-perks/v1/pages/${existingBaronPage.id}`, null, creds).catch(() => {});
    } else {
      const currentEditable = pages.find((p) => p.current && p.isEditable);
      if (currentEditable && pages.filter((p) => p.isEditable).length >= 2) {
        await lcuRequest('DELETE', `/lol-perks/v1/pages/${currentEditable.id}`, null, creds).catch(() => {});
      }
    }
  }

  const payload = {
    name: runePageData.name || 'Babilonia Buff: Página Recomendada',
    primaryStyleId: runePageData.primaryStyleId,
    subStyleId: runePageData.subStyleId,
    selectedPerkIds: runePageData.selectedPerkIds,
    current: true
  };

  return await lcuRequest('POST', '/lol-perks/v1/pages', payload, creds);
}

module.exports = {
  getMatchHistory,
  discoverLCUCredentials,
  getLCUState,
  exportRunePageToLCU
};
