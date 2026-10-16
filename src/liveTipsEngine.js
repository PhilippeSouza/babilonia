/**
 * Motor de Dicas Proativas em Tempo Real (Live Client Data API - Porta 2999)
 *
 * Observa a partida a cada leitura (ouro, KDA, CS, vida, itens, objetivos,
 * eventos de abate/dragão/barão e quem está morto) e decide QUANDO mostrar
 * uma dica curta do que fazer agora. Não é um chat: ninguém pergunta nada,
 * a IA olha o jogo e avisa sozinha.
 *
 * Controle de frequência (para não poluir a tela):
 *  - No máximo 1 dica por leitura (a de maior prioridade vence).
 *  - Dicas normais respeitam um intervalo mínimo entre si (GAP_NORMAL_SEC).
 *  - Dicas urgentes (oportunidade de objetivo, inimigo de rota morto, perigo)
 *    só esperam GAP_URGENT_SEC.
 *  - Cada tipo de dica tem seu próprio cooldown e nunca repete a mesma situação.
 */

const PRIORITY = { LOW: 1, NORMAL: 2, URGENT: 3 };
const GAP_NORMAL_SEC = 25;
const GAP_URGENT_SEC = 6;
const EVENT_TIP_TTL_SEC = 15; // dica de evento que não saiu em 15s perde o sentido
const HISTORY_LIMIT = 20;

const CONTROL_WARD_ID = '2055';

function parseGold(value) {
  if (typeof value === 'number') return value;
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function cleanChampId(name) {
  return String(name || '').replace(/[^a-zA-Z]/g, '');
}

function playerNames(p) {
  if (!p) return [];
  return [p.summonerName, p.riotIdGameName, p.riotId, p.riotId && p.riotId.split('#')[0]]
    .filter(Boolean)
    .map((n) => String(n).toLowerCase());
}

class LiveTipsEngine {
  /**
   * @param {object} opts
   * @param {(champId: string, enemyIds: string[]) => object} opts.getGuide  guia do campeão (builds/itens)
   */
  constructor({ getGuide, isOverlayEnabled } = {}) {
    this.getGuide = getGuide || (() => null);
    // Dicas com `overlay` só aparecem se aquele overlay estiver ligado na tela Overlays
    this.isOverlayEnabled = isOverlayEnabled || (() => true);
    this.nextTipId = 1;
    this.history = [];
    this.rawEvents = [];
    this.reset();
  }

  reset() {
    this.lastEventId = -1;
    this.lastGameTime = -1;
    this.lastShownAt = -999;
    this.lastShownPriority = 0;
    this.keyLastShown = new Map(); // key -> gameTime
    this.pendingEvents = []; // dicas vindas de eventos aguardando vaga
    this.prevLevel = 0;
    this.fedAnnounced = new Set();
    this.inGame = false;
    this.inhibRespawns = []; // { at, ours } — inibidores derrubados e quando voltam
  }

  getHistory() {
    return this.history.slice();
  }

  /**
   * Processa uma leitura da porta 2999. Retorna a dica escolhida (ou null).
   */
  update(rawGame, matchState) {
    if (!rawGame || !matchState || !matchState.activePlayer) {
      if (this.inGame) this.reset();
      return null;
    }

    const t = matchState.gameTime;
    const events = rawGame.events?.Events || [];
    this.rawEvents = events;

    // Nova partida (tempo voltou ou lista de eventos encolheu) => zera o estado
    if (t + 5 < this.lastGameTime || (events.length > 0 && events[events.length - 1].EventID < this.lastEventId)) {
      this.reset();
    }
    // Primeira leitura de uma partida já em andamento: ignora eventos antigos
    if (!this.inGame) {
      this.inGame = true;
      this.lastEventId = events.length > 0 ? events[events.length - 1].EventID : -1;
      this.prevLevel = matchState.activePlayer.level;
    }
    this.lastGameTime = t;

    const ctx = this.buildContext(rawGame, matchState);

    // 1) Dicas de eventos novos (entram numa fila curta)
    const newEvents = events.filter((e) => e.EventID > this.lastEventId);
    if (newEvents.length > 0) this.lastEventId = newEvents[newEvents.length - 1].EventID;
    newEvents.forEach((ev) => {
      const tip = this.tipFromEvent(ev, ctx);
      if (tip) this.pendingEvents.push({ ...tip, createdAt: t });
    });
    this.pendingEvents = this.pendingEvents.filter((p) => t - p.createdAt <= EVENT_TIP_TTL_SEC);

    // 2) Dicas do estado atual
    const candidates = [...this.pendingEvents, ...this.stateTips(ctx)].filter(
      (c) => c && (!c.overlay || this.isOverlayEnabled(c.overlay))
    );
    this.prevLevel = ctx.me.level;

    // 3) Escolhe uma só, respeitando cooldowns e o intervalo global
    const sinceLast = t - this.lastShownAt;
    const eligible = candidates
      .filter((c) => {
        const last = this.keyLastShown.get(c.key);
        if (last !== undefined && t - last < (c.cooldown ?? Infinity)) return false;
        if (c.bypassGap) return true; // lembretes curtos (ordem de habilidade) não ocupam a vez das outras dicas
        const gap = c.priority >= PRIORITY.URGENT ? GAP_URGENT_SEC : GAP_NORMAL_SEC;
        return sinceLast >= gap;
      })
      .sort((a, b) => b.priority - a.priority);

    const chosen = eligible[0];
    if (!chosen) return null;

    if (typeof chosen.onShow === 'function') chosen.onShow();
    this.keyLastShown.set(chosen.key, t);
    if (!chosen.bypassGap) this.lastShownAt = t;
    this.pendingEvents = this.pendingEvents.filter((p) => p.key !== chosen.key);

    const tip = {
      id: this.nextTipId++,
      key: chosen.key,
      gameTime: t,
      formattedTime: fmt(t),
      priority: chosen.priority,
      type: chosen.priority >= PRIORITY.URGENT ? 'URGENT' : chosen.type || 'MACRO',
      badge: chosen.badge,
      title: chosen.title,
      message: chosen.message
    };
    this.history.push(tip);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    return tip;
  }

  buildContext(rawGame, matchState) {
    const me = matchState.activePlayer;
    const myNames = new Set(playerNames(rawGame.activePlayer).concat(playerNames(me)));

    // Mapa nome -> jogador (para resolver quem matou quem nos eventos)
    const byName = new Map();
    const rawPlayers = rawGame.allPlayers || [];
    const meRaw = rawPlayers.find((p) => playerNames(p).some((n) => myNames.has(n))) || null;
    const myTeam = meRaw?.team || 'ORDER';
    rawPlayers.forEach((p) => {
      const info = {
        champion: p.championName,
        team: p.team,
        isAlly: p.team === myTeam,
        isMe: p === meRaw,
        position: p.position
      };
      playerNames(p).forEach((n) => byName.set(n, info));
    });

    const enemies = matchState.enemies || [];
    const allies = matchState.allies || [];
    const myPosition = me.position || meRaw?.position || '';
    const enemyLaner =
      myPosition && myPosition !== 'NONE' ? enemies.find((e) => e.position === myPosition) || null : null;

    const meRow = allies.find((a) => playerNames(a).some((n) => myNames.has(n)));
    const isDead = Boolean(meRaw?.isDead ?? meRow?.isDead);
    const respawn = Math.ceil(meRaw?.respawnTimer || meRow?.respawnTimer || 0);

    const stats = me.stats || {};
    const hpPct = stats.maxHealth > 0 ? stats.currentHealth / stats.maxHealth : 1;

    // Próxima compra (componente do próximo item grande que ainda não tem)
    const enemyIds = enemies.map((e) => cleanChampId(e.championName)).filter(Boolean);
    let guide = null;
    try {
      guide = this.getGuide(me.championId, enemyIds);
    } catch (_) {}
    const owned = new Set((me.items || []).map((i) => String(i.itemID)));
    const core = guide?.coreItems || [];
    const nextItem = core.find((ci) => !owned.has(String(ci.id))) || null;
    const nextComp =
      nextItem && Array.isArray(nextItem.components) && nextItem.components.length > 0
        ? nextItem.components.find((c) => !owned.has(String(c.id))) || null
        : nextItem?.firstComponent || null;
    const nextItemCost = parseGold(nextItem?.totalCost);
    const nextCompCost = parseGold(nextComp?.cost);

    // Item situacional da build "Anti-Time Inimigo" que você ainda não tem
    const antiBuild = guide?.builds?.[2];
    const counterItem =
      (antiBuild?.items || []).find((it) => !owned.has(String(it.id)) && !core.slice(0, 2).some((c) => c.id === it.id)) ||
      (guide?.situationalItems || [])[0] ||
      null;

    return {
      t: matchState.gameTime,
      matchState,
      me,
      myNames,
      byName,
      myTeam,
      allies,
      enemies,
      enemyLaner,
      isDead,
      respawn,
      hpPct,
      owned,
      guide,
      nextItem,
      nextComp,
      nextItemCost,
      nextCompCost,
      counterItem,
      comp: guide?.enemyCompAnalysis || null
    };
  }

  resolve(name, ctx) {
    if (!name) return null;
    return ctx.byName.get(String(name).toLowerCase()) || null;
  }

  tipFromEvent(ev, ctx) {
    switch (ev.EventName) {
      case 'ChampionKill': {
        const victim = this.resolve(ev.VictimName, ctx);
        const killer = this.resolve(ev.KillerName, ctx);
        if (victim?.isMe) {
          const buy = this.buyAdvice(ctx, true);
          return {
            key: `death-${ev.EventID}`,
            priority: PRIORITY.NORMAL,
            type: 'BUILD',
            badge: '💀 VOCÊ MORREU',
            title: buy ? 'Aproveite para comprar' : 'Volte com calma',
            message: `${killer ? `${killer.champion} te pegou. ` : ''}${
              buy || 'Ao renascer, volte pela selva com visão e não force a mesma luta.'
            }`
          };
        }
        return null;
      }
      case 'DragonKill': {
        const killer = this.resolve(ev.KillerName, ctx);
        const ours = killer ? killer.isAlly : null;
        const stolen = String(ev.Stolen).toLowerCase() === 'true';
        const next = fmt(ev.EventTime + 300);
        const enemyDrakes = this.countObjective(ctx, 'DragonKill', false);
        if (ours === false) {
          return {
            key: `dragon-${ev.EventID}`,
          overlay: 'objectives',
            priority: enemyDrakes >= 3 ? PRIORITY.URGENT : PRIORITY.NORMAL,
            badge: `🐉 DRAGÃO INIMIGO (${enemyDrakes})`,
            title: enemyDrakes >= 3 ? 'Inimigo perto da Alma!' : 'Eles pegaram o dragão',
            message:
              enemyDrakes >= 3
                ? `Próximo dragão às ${next} pode dar a Alma. Chegue antes com visão e o time inteiro.`
                : `Troque o mapa: pegue placas, torre ou Vastilarvas do outro lado. Próximo dragão às ${next}.`
          };
        }
        if (ours === true) {
          return {
            key: `dragon-${ev.EventID}`,
          overlay: 'objectives',
            priority: PRIORITY.LOW,
            badge: '🐉 DRAGÃO NOSSO',
            title: stolen ? 'Roubo de dragão!' : 'Dragão garantido',
            message: `Use a vantagem: empurre a wave mais perto e reset na base. Próximo às ${next}.`
          };
        }
        return null;
      }
      case 'BaronKill': {
        const killer = this.resolve(ev.KillerName, ctx);
        if (!killer) return null;
        return killer.isAlly
          ? {
              key: `baron-${ev.EventID}`,
          overlay: 'objectives',
              priority: PRIORITY.URGENT,
              badge: '👑 BARÃO NOSSO',
              title: 'Empurre com o Barão',
              message: 'Agrupe e empurre a rota com mais minions perto da torre deles. Não persiga na selva.'
            }
          : {
              key: `baron-${ev.EventID}`,
          overlay: 'objectives',
              priority: PRIORITY.URGENT,
              badge: '👑 BARÃO INIMIGO',
              title: 'Defenda sem lutar aberto',
              message: 'Limpe as waves debaixo da torre e espere o buff acabar. Não aceite luta fora da base.'
            };
      }
      case 'HeraldKill':
      case 'HordeKill': {
        const killer = this.resolve(ev.KillerName, ctx);
        if (!killer || killer.isAlly) return null;
        return {
          key: `pit-${ev.EventID}`,
          overlay: 'objectives',
          priority: PRIORITY.LOW,
          badge: '👾 OBJETIVO INIMIGO',
          title: 'Eles foram no topo',
          message: 'Responda do outro lado: placas no bot ou preparar o próximo dragão.'
        };
      }
      case 'InhibKilled': {
        // Barracks_T1_* pertence ao time ORDER (azul), Barracks_T2_* ao CHAOS (vermelho)
        const ourInhibDown = /_T1_/.test(String(ev.InhibKilled || '')) === (ctx.myTeam === 'ORDER');
        this.inhibRespawns.push({ at: ev.EventTime + 300, ours: ourInhibDown, id: ev.EventID });
        if (!ourInhibDown) return null;
        return {
          key: `inhib-${ev.EventID}`,
          priority: PRIORITY.NORMAL,
          badge: '🏰 INIBIDOR CAIU',
          title: 'Super minions vindo',
          message: 'Alguém precisa segurar essa rota. Não lute longe da base enquanto o inibidor renasce.'
        };
      }
      case 'Ace': {
        const ourAce = String(ev.AcingTeam || '') === ctx.myTeam;
        if (!ourAce || ctx.isDead) return null;
        const target = this.bestObjective(ctx);
        return {
          key: `ace-${ev.EventID}`,
          priority: PRIORITY.URGENT,
          badge: '🔥 ACE!',
          title: `Todos mortos: ${target.short}`,
          message: target.message
        };
      }
      default:
        return null;
    }
  }

  countObjective(ctx, eventName, ours) {
    let count = 0;
    (this.rawEvents || []).forEach((e) => {
      if (e.EventName !== eventName) return;
      const k = this.resolve(e.KillerName, ctx);
      if (k && k.isAlly === ours) count++;
    });
    return count;
  }

  bestObjective(ctx) {
    const { objectives } = ctx.matchState;
    if (ctx.t >= 1200 && objectives.baron.secondsRemaining === 0) {
      return { short: 'Barão!', message: 'Barão está vivo e não tem ninguém para contestar. Vá agora com o time.' };
    }
    if (objectives.dragon.secondsRemaining === 0) {
      return { short: 'Dragão!', message: 'Dragão está vivo e o inimigo não consegue contestar. Pegue agora.' };
    }
    // O timer do topo do rio não acompanha todas as abates de Vastilarvas/Arauto,
    // então só sugere quando nenhum desses eventos aconteceu ainda nesta fase.
    const pitEvent = ctx.t < 840 ? 'HordeKill' : 'HeraldKill';
    const pitTaken = (this.rawEvents || []).some((e) => e.EventName === pitEvent);
    if (ctx.t < 1200 && !pitTaken && objectives.heraldOrGrubs.secondsRemaining === 0 && ctx.t >= 360) {
      return {
        short: objectives.heraldOrGrubs.name,
        message: `${objectives.heraldOrGrubs.name} está livre. Pegue rápido e empurre uma rota.`
      };
    }
    return { short: 'empurre torres', message: 'Nenhum objetivo vivo: derrube torres e placas na rota mais avançada.' };
  }

  buyAdvice(ctx, dead) {
    const gold = ctx.me.currentGold;
    if (ctx.nextItem && ctx.nextItemCost > 0 && gold >= ctx.nextItemCost) {
      return `Você tem ${gold}g: dá para fechar ${ctx.nextItem.name}${dead ? ' agora na base' : ''}.`;
    }
    if (ctx.nextComp && ctx.nextCompCost > 0 && gold >= ctx.nextCompCost) {
      return `Você tem ${gold}g: compre ${ctx.nextComp.name} (${ctx.nextComp.cost}) para ${ctx.nextItem?.name || 'o próximo item'}.`;
    }
    return null;
  }

  stateTips(ctx) {
    const tips = [];
    const { t, me, matchState } = ctx;
    const { objectives } = matchState;

    // ---------- Perigo: vida baixa ----------
    if (!ctx.isDead && ctx.hpPct > 0 && ctx.hpPct < 0.3 && t > 90) {
      tips.push({
        key: 'low-hp',
        cooldown: 60,
        priority: PRIORITY.URGENT,
        badge: `❤️ VIDA ${Math.round(ctx.hpPct * 100)}%`,
        title: 'Vida baixa',
        message: 'Recue para trás da wave ou volte para a base. Não vale arriscar morte agora.'
      });
    }

    // ---------- Inimigo de rota morto: pressione ----------
    const laner = ctx.enemyLaner;
    if (laner && laner.isDead && laner.respawnTimer >= 10 && !ctx.isDead && t < 1500) {
      tips.push({
        key: `laner-dead-${laner.deaths}`,
        cooldown: Infinity,
        priority: PRIORITY.URGENT,
        badge: `⚔️ ${String(laner.championName).toUpperCase()} MORTO (${laner.respawnTimer}s)`,
        title: 'Seu oponente de rota morreu',
        message:
          t < 840
            ? 'Empurre a wave para a torre e pegue placas. Se tiver ouro, volte depois do empurrão.'
            : 'Empurre a wave e bata na torre, ou ajude no objetivo mais próximo.'
      });
    }

    // ---------- Vantagem / desvantagem numérica ----------
    const deadEnemies = ctx.enemies.filter((e) => e.isDead && e.respawnTimer >= 12);
    const deadAllies = ctx.allies.filter((a) => a.isDead && a.respawnTimer >= 12);
    if (!ctx.isDead && deadEnemies.length >= 2 && deadEnemies.length > deadAllies.length && deadEnemies.length < 5) {
      const target = this.bestObjective(ctx);
      const totalEnemyDeaths = ctx.enemies.reduce((acc, e) => acc + e.deaths, 0);
      tips.push({
        key: `numbers-${totalEnemyDeaths}`,
        cooldown: Infinity,
        priority: PRIORITY.URGENT,
        badge: `🔥 ${deadEnemies.length} INIMIGOS MORTOS`,
        title: `Vantagem numérica: ${target.short}`,
        message: target.message
      });
    }
    if (!ctx.isDead && deadAllies.length >= 2 && deadAllies.length > deadEnemies.length) {
      const totalAllyDeaths = ctx.allies.reduce((acc, a) => acc + a.deaths, 0);
      tips.push({
        key: `outnumbered-${totalAllyDeaths}`,
        cooldown: Infinity,
        priority: PRIORITY.URGENT,
        badge: `⚠️ ${deadAllies.length} ALIADOS MORTOS`,
        title: 'Vocês estão em desvantagem',
        message: 'Não conteste objetivo agora. Recue para perto da torre até o time renascer.'
      });
    }

    // ---------- Objetivos chegando ----------
    const drag = objectives.dragon;
    if (drag.secondsRemaining > 0 && drag.secondsRemaining <= 60) {
      tips.push({
        key: `dragon-soon-${Math.round(t + drag.secondsRemaining)}`,
          overlay: 'objectives',
        cooldown: Infinity,
        priority: PRIORITY.URGENT,
        badge: `🐉 DRAGÃO EM ${fmt(drag.secondsRemaining)}`,
        title: 'Prepare o dragão',
        message: ['MIDDLE', 'BOTTOM', 'UTILITY', 'JUNGLE'].includes(me.position)
          ? 'Empurre sua wave agora, chegue primeiro no rio e coloque visão.'
          : 'Empurre o top e segure Teleporte para o dragão, ou troque pegando placas.'
      });
    }
    const baron = objectives.baron;
    if (t >= 1080 && baron.secondsRemaining > 0 && baron.secondsRemaining <= 60) {
      tips.push({
        key: `baron-soon-${Math.round(t + baron.secondsRemaining)}`,
          overlay: 'objectives',
        cooldown: Infinity,
        priority: PRIORITY.URGENT,
        badge: `👑 BARÃO EM ${fmt(baron.secondsRemaining)}`,
        title: 'Prepare o Barão',
        message: 'Empurre as rotas laterais, compre Sentinela de Controle e faça visão no topo do rio.'
      });
    }
    const pit = objectives.heraldOrGrubs;
    if (t < 1200 && pit.secondsRemaining > 0 && pit.secondsRemaining <= 45 && ['TOP', 'JUNGLE', 'MIDDLE'].includes(me.position)) {
      tips.push({
        key: `pit-soon-${Math.round(t + pit.secondsRemaining)}`,
          overlay: 'objectives',
        cooldown: Infinity,
        priority: PRIORITY.NORMAL,
        badge: `👾 ${String(pit.name).toUpperCase()} EM ${fmt(pit.secondsRemaining)}`,
        title: `${pit.name} chegando`,
        message: 'Empurre a wave e ajude o caçador no topo do rio.'
      });
    }

    // ---------- Ouro no bolso: hora de voltar ----------
    if (!ctx.isDead && t > 150) {
      const buy = this.buyAdvice(ctx, false);
      if (buy && me.currentGold >= 900) {
        tips.push({
          key: `recall-${ctx.nextItem?.id || 'x'}-${ctx.nextComp?.id || 'x'}`,
          cooldown: 120,
          priority: me.currentGold >= 1500 ? PRIORITY.NORMAL : PRIORITY.LOW,
          type: 'BUILD',
          badge: `💰 ${me.currentGold} OURO`,
          title: 'Hora de dar recall',
          message: `${buy} Empurre a wave antes de voltar.`
        });
      }
    }

    // ---------- Ordem de habilidades recomendada ----------
    const order = ctx.guide?.skillOrder;
    if (Array.isArray(order) && me.level > this.prevLevel && me.level <= order.length) {
      const skill = order[me.level - 1];
      this.pendingEvents.push({
        key: `skill-${me.level}`,
        overlay: 'skillOrder',
        bypassGap: true,
        cooldown: Infinity,
        priority: PRIORITY.LOW,
        createdAt: t,
        badge: `📈 NÍVEL ${me.level}`,
        title: `Suba o ${skill}`,
        message: `Ordem recomendada para ${ctx.guide.name || 'seu campeão'}: ${ctx.guide.skillPriority || order.slice(0, 6).join(' > ')}.`
      });
    }

    // ---------- Timers de inibidor ----------
    this.inhibRespawns
      .filter((i) => i.at - t > 0 && i.at - t <= 30)
      .forEach((i) => {
        tips.push({
          key: `inhib-back-${i.id}`,
          overlay: 'minimapTimers',
          cooldown: Infinity,
          priority: PRIORITY.NORMAL,
          badge: `🏰 INIBIDOR EM ${fmt(i.at - t)}`,
          title: i.ours ? 'Nosso inibidor vai voltar' : 'Inibidor deles vai voltar',
          message: i.ours
            ? 'Segure mais um pouco: os super minions param quando ele renascer.'
            : 'Se quiserem fechar o jogo, a janela está acabando. Empurrem agora ou peguem outro objetivo.'
        });
      });

    // ---------- Pico de poder no nível ----------
    if ([6, 11, 16].includes(me.level) && this.prevLevel < me.level && !ctx.isDead) {
      tips.push({
        key: `level-${me.level}`,
        cooldown: Infinity,
        priority: PRIORITY.LOW,
        badge: `⭐ NÍVEL ${me.level}`,
        title: me.level === 6 ? 'Ultimate liberada' : 'Ultimate mais forte',
        message:
          me.level === 6
            ? `Você ganhou pico de poder. Procure troca ou abate no ${laner ? laner.championName : 'oponente'} se o caçador dele não estiver perto.`
            : 'Sua ultimate subiu de nível: bom momento para forçar luta ou objetivo.'
      });
    }

    // ---------- Inimigo ficou forte: adapte a build ----------
    ctx.enemies
      .filter((e) => e.isFed && !this.fedAnnounced.has(e.championName))
      .forEach((e) => {
        const item = ctx.counterItem;
        tips.push({
          key: `fed-${e.championName}`,
          cooldown: Infinity,
          priority: PRIORITY.NORMAL,
          type: 'BUILD',
          badge: `⚠️ ${String(e.championName).toUpperCase()} ${e.kills}/${e.deaths}/${e.assists}`,
          title: `${e.championName} está forte`,
          message: `Não lute 1x1 com ele.${item ? ` Considere ${item.name} na próxima compra.` : ''}`,
          onShow: () => this.fedAnnounced.add(e.championName)
        });
      });

    // ---------- Leitura da composição inimiga (uma vez, começo de jogo) ----------
    if (t >= 45 && t <= 150 && ctx.comp) {
      const c = ctx.comp;
      let msg = null;
      if (c.healers?.length > 0) msg = `Eles têm muita cura (${c.healers.join(', ')}): faça um item de Feridas Dolorosas cedo.`;
      else if (c.apCount >= 3) msg = `Time inimigo tem ${c.apCount} campeões AP: botas de resistência mágica ajudam muito.`;
      else if (c.adCount >= 4) msg = 'Time inimigo é quase todo AD: armadura vale mais que vida pura.';
      else if (c.ccThreats?.length >= 2) msg = `Muito controle de grupo (${c.ccThreats.join(', ')}): Passos de Mercúrio são boa escolha.`;
      if (msg) {
        tips.push({
          key: 'comp-read',
          overlay: 'loadingScreen',
          cooldown: Infinity,
          priority: PRIORITY.LOW,
          type: 'BUILD',
          badge: '🧩 COMPOSIÇÃO INIMIGA',
          title: 'Adapte sua build',
          message: msg
        });
      }
    }

    // ---------- Farm abaixo do ideal (checa aos 10, 15 e 20 min) ----------
    const checkpoint = [600, 900, 1200].find((cp) => t >= cp && t < cp + 60);
    if (checkpoint && me.position !== 'UTILITY' && me.csPerMin < 6) {
      tips.push({
        key: `cs-${checkpoint}`,
        overlay: 'benchmark',
        cooldown: Infinity,
        priority: PRIORITY.LOW,
        badge: `🌾 ${me.csPerMin} CS/MIN`,
        title: 'Farm abaixo do ideal',
        message: 'Entre lutas, pegue as waves das rotas laterais. Cada wave perdida é quase um componente.'
      });
    }

    // ---------- Visão: sem Sentinela de Controle ----------
    if (t >= 480 && !ctx.owned.has(CONTROL_WARD_ID) && ctx.isDead && me.currentGold >= 75) {
      tips.push({
        key: 'control-ward',
        overlay: 'trinket',
        cooldown: 300,
        priority: PRIORITY.LOW,
        badge: '👁️ VISÃO',
        title: 'Leve uma Sentinela de Controle',
        message: 'Você está sem Sentinela de Controle. Compre uma agora, custa só 75g.'
      });
    }

    return tips;
  }
}

module.exports = { LiveTipsEngine, PRIORITY };
