/**
 * Babilonia Buff — Frontend Principal
 * Inclui:
 * 1) Recomendador Pós-Banimentos com 6 Opções de Campeões Fortes no Meta Atual
 * 2) Gerador de 3 Opções de Build (Maior Winrate, Alternativa e Anti-Time Inimigo)
 * 3) Dicas Proativas em Popup: a IA observa a partida (porta 2999) e avisa o que fazer, sem chat e sem voz
 */

let ddragonVersion = '16.20.1';
let allChampions = [];
// Tudo começa vazio: só é preenchido pela Seleção de Campeões, pela partida ao vivo ou quando você escolhe um campeão
let selectedChampionId = '';
let currentRole = 'TOP';
let bannedChampions = [];
let enemyTeam = [];
let currentGuide = null;
let activeBuildIndex = 0; // 0 = Maior Winrate | 1 = Alternativa | 2 = Anti-Time Inimigo
let activeTagFilter = 'ALL';
let activeLaneFilter = 'ALL';
let shownPopupIds = new Set();
let lastSeenTipId = null; // null = ainda não sincronizou com o servidor
let lastAutoImportedChamp = '';

const PERK_NAMES_PT = {
  8010: '⚡ Conquistador (Runa Essencial)',
  8008: '⚡ Ritmo Fatal (Runa Essencial)',
  8021: '⚡ Agilidade nos Pés (Essencial)',
  8112: '⚡ Eletrocutar (Runa Essencial)',
  8369: '⚡ Primeiro Ataque (Essencial)',
  8229: '⚡ Cometa Arcano (Runa Essencial)',
  8437: '⚡ Aperto dos Mortos-Vivos (Essencial)',
  8214: '⚡ Invocar Aery (Runa Essencial)',
  8439: '⚡ Pós-Choque (Runa Essencial)',
  9111: 'Triunfo',
  8009: 'Presença de Espírito',
  9104: 'Lenda: Espontaneidade',
  9103: 'Lenda: Linhagem',
  8299: 'Até a Morte',
  8014: 'Golpe de Misericórdia',
  8444: 'Ventos Revigorantes',
  8451: 'Crescimento Excessivo',
  8304: 'Calçados Mágicos',
  8345: 'Entrega de Biscoitos',
  8143: 'Impacto Repentino',
  8138: 'Globos Oculares',
  8106: 'Caçador Supremo',
  8226: 'Faixa de Fluxo de Mana',
  8210: 'Transcendência',
  8237: 'Chamuscar',
  8347: 'Perspicácia Cósmica',
  8446: 'Demolir',
  8429: 'Condicionamento',
  8473: 'Osso Revestido',
  8453: 'Revitalizar',
  8463: 'Fonte da Vida',
  8242: 'Inabalável',
  8306: 'Flashtração Hextec',
  5005: '+10% Velocidade de Ataque',
  5008: '+9 Força Adaptativa',
  5007: '+8 Aceleração de Habilidade',
  5001: '+Vida Escalável'
};

// =========================================================================
// MOTOR DE POPUPS TÁTICOS EM TEMPO REAL (SILENCIOSO / VISUAL)
// =========================================================================
function showTacticalPopup({ id, type = 'MACRO', badge = 'DICA TÁTICA', title, message, force = false }) {
  const popupsEnabled = document.getElementById('chkPopupsEnabled')?.checked !== false;
  if (!popupsEnabled && !force) return;

  if (!force && id && shownPopupIds.has(id)) {
    return;
  }
  if (id) shownPopupIds.add(id);

  const container = document.getElementById('tacticalPopupContainer');
  if (!container) return;

  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }

  const popup = document.createElement('div');
  popup.className = `tactical-popup ${type}`;
  popup.innerHTML = `
    <div class="popup-top">
      <span class="popup-badge">${badge}</span>
      <button class="popup-close" title="Fechar">✕</button>
    </div>
    <div class="popup-title">${title}</div>
    <div class="popup-msg">${message}</div>
    <div class="popup-progress"></div>
  `;

  popup.querySelector('.popup-close').addEventListener('click', () => popup.remove());
  container.appendChild(popup);

  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 9000);
}

// =========================================================================
// NAVEGAÇÃO LATERAL ESTILO BLITZ
// =========================================================================
function switchTab(tabId) {
  document.querySelectorAll('.side-link').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach((p) => {
    p.classList.toggle('active', p.id === tabId);
  });
}

document.querySelectorAll('.side-link').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// =========================================================================
// CARREGAMENTO DE TODOS OS CAMPEÕES & INICIALIZAÇÃO DO DRAFT
// =========================================================================
async function loadAllChampions() {
  try {
    const res = await fetch('/api/champions');
    const data = await res.json();
    ddragonVersion = data.ddragonVersion || ddragonVersion;
    allChampions = data.champions || [];

    document.getElementById('patchVersionLabel').textContent = ddragonVersion;
    document.getElementById('champCountBadge').textContent = allChampions.length;

    populateSelectors();
    renderChampionsGrid();
    await refreshDraftAndBuilds();
  } catch (err) {
    console.error('Erro ao carregar campeões:', err);
  }
}

function populateSelectors() {
  const mySelect = document.getElementById('selectMyChamp');
  const banSelect = document.getElementById('addBanSelect');

  if (mySelect) {
    mySelect.innerHTML = allChampions
      .map((c) => `<option value="${c.id}" ${c.id === selectedChampionId ? 'selected' : ''}>${c.name} (${c.role})</option>`)
      .join('');

    mySelect.onchange = async (e) => {
      selectedChampionId = e.target.value;
      await refreshDraftAndBuilds();
    };
  }

  if (banSelect) {
    banSelect.innerHTML =
      `<option value="">+ Banir Campeão...</option>` +
      allChampions.map((c) => `<option value="${c.id}">🚫 Banir ${c.name}</option>`).join('');

    banSelect.onchange = async (e) => {
      const val = e.target.value;
      e.target.value = '';
      if (val && !bannedChampions.includes(val)) {
        bannedChampions.push(val);
        await refreshDraftAndBuilds();
      }
    };
  }
}

// =========================================================================
// MOTOR DE DRAFT PÓS-BANIMENTOS (6 OPÇÕES DO META + 5 INIMIGOS + 3 BUILDS)
// =========================================================================
async function refreshDraftAndBuilds() {
  try {
    const res = await fetch('/api/draft/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: currentRole,
        myChampionId: selectedChampionId,
        bannedChampions
      })
    });
    const data = await res.json();

    if (data.recommendations?.detectedRole) {
      currentRole = data.recommendations.detectedRole;
    }

    syncRoleUI();
    renderBannedChips();
    renderEnemySlots();
    renderSplitSixRecommendations(data.recommendations);

    currentGuide = data.guide || null;
    document.getElementById('champBuildSection')?.classList.toggle('hidden', !currentGuide);
    if (currentGuide) {
      renderChampionAndThreeBuilds(currentGuide);
    }
  } catch (err) {
    console.error('Erro ao atualizar draft e builds:', err);
  }
}

function syncRoleUI() {
  const detectedLaneText = document.getElementById('detectedLaneText');
  if (detectedLaneText) detectedLaneText.textContent = currentRole;

  document.querySelectorAll('#draftRoleTabs .role-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.role === currentRole);
  });
}

function renderBannedChips() {
  const el = document.getElementById('bannedChipsList');
  if (!el) return;

  if (bannedChampions.length === 0) {
    el.innerHTML = `<span class="card-sub">Nenhum banimento registrado. Use "+ Banir Campeão..." acima.</span>`;
    return;
  }

  el.innerHTML = bannedChampions
    .map(
      (cid) => `
      <span class="ban-chip">
        <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${cid}.png" onerror="this.style.display='none'" alt="${cid}" />
        <span>${cid}</span>
        <button onclick="removeBan('${cid}')" title="Remover banimento">✕</button>
      </span>
    `
    )
    .join('');
}

window.removeBan = async function (cid) {
  bannedChampions = bannedChampions.filter((b) => b !== cid);
  await refreshDraftAndBuilds();
};

function renderEnemySlots() {
  const container = document.getElementById('enemyDraftSlots');
  if (!container) return;

  const roleLabels = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
  const roleCodes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

  container.innerHTML = [0, 1, 2, 3, 4]
    .map((slotIdx) => {
      const currentEnemy = enemyTeam[slotIdx] || '';
      const isMyLaneOpponent = roleCodes[slotIdx] === currentRole;
      const enemyName = currentEnemy ? allChampions.find((c) => c.id === currentEnemy)?.name || currentEnemy : 'Aguardando pick';

      // Rota deduzida automaticamente pelo campeão: sem opção de escolher na mão
      return `
        <div class="enemy-slot ${isMyLaneOpponent ? 'active-lane-slot' : ''}">
          <span class="slot-role-tag">${isMyLaneOpponent ? `🎯 ${roleLabels[slotIdx]} (SEU RIVAL)` : roleLabels[slotIdx]}</span>
          <img src="${currentEnemy ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${currentEnemy}.png` : 'logo.png'}" alt="${currentEnemy || 'A definir'}" />
          <span class="enemy-slot-name" title="Rota deduzida automaticamente">${enemyName}</span>
        </div>
      `;
    })
    .join('');
}

// Seletor de Rota (também atualiza qual inimigo é seu oponente direto)
document.querySelectorAll('#draftRoleTabs .role-tab').forEach((btn) => {
  btn.addEventListener('click', async () => {
    currentRole = btn.dataset.role;
    syncRoleUI();
    await refreshDraftAndBuilds();
  });
});

// Renderiza 3 Counters do Oponente de Rota + 3 Mais Fortes do Meta Atual (Sem Repetição!)
function renderSplitSixRecommendations(rec) {
  if (!rec) return;

  const enemyLanerTitle = document.getElementById('enemyLanerTitle');
  const metaLaneTitle = document.getElementById('metaLaneTitle');
  if (enemyLanerTitle) enemyLanerTitle.textContent = rec.enemyLanerName ? `vs ${rec.enemyLanerName}` : 'oponente ainda não escolheu';
  if (metaLaneTitle) metaLaneTitle.textContent = rec.detectedRole || currentRole;

  const renderThreeCards = (list, isCounterGroup) =>
    (list || [])
      .map((p, idx) => {
        const isSelected = p.id.toLowerCase() === selectedChampionId.toLowerCase();
        return `
          <div class="meta-pick-card ${isSelected ? 'selected' : ''} ${isCounterGroup ? 'counter-highlight' : ''}" onclick="pickMetaChampion('${p.id}')">
            <div class="meta-pick-avatar-wrap">
              <img src="${p.iconUrl}" alt="${p.name}" />
              <span class="meta-pick-tier">${p.tier}</span>
            </div>
            <div class="meta-pick-name">#${idx + 1} ${p.name}</div>
            <div class="meta-pick-wr">${p.winRate} WR</div>
            <div class="meta-pick-reason">${p.reason}</div>
          </div>
        `;
      })
      .join('');

  const countersGrid = document.getElementById('top3CountersGrid');
  const metaGrid = document.getElementById('top3MetaGrid');
  if (countersGrid) {
    countersGrid.innerHTML = rec.counterPicks?.length
      ? renderThreeCards(rec.counterPicks, true)
      : '<div class="meta-pick-reason">Os counters aparecem assim que o seu oponente de rota escolher o campeão.</div>';
  }
  if (metaGrid) metaGrid.innerHTML = renderThreeCards(rec.metaPicks, false);
}

window.pickMetaChampion = async function (champId) {
  selectedChampionId = champId;
  const mySelect = document.getElementById('selectMyChamp');
  if (mySelect) mySelect.value = champId;
  await refreshDraftAndBuilds();

  showTacticalPopup({
    type: 'MACRO',
    badge: `⚡ PICK SELECIONADO: ${champId.toUpperCase()}`,
    title: `3 Opções de Build prontas para ${champId}!`,
    message: 'Alterne abaixo entre a Build de Maior Winrate, Build Alternativa ou a Build Anti-Time Inimigo.',
    force: true
  });
};

// =========================================================================
// RENDERIZAÇÃO DO CAMPEÃO E DAS 3 OPÇÕES DE BUILD
// =========================================================================
function renderChampionAndThreeBuilds(g) {
  document.getElementById('guideChampIcon').src = g.iconUrl;
  document.getElementById('guideChampName').textContent = g.name;
  document.getElementById('guideChampTitle').textContent = g.title;
  document.getElementById('guideTierBadge').textContent = g.tier || '—';
  document.getElementById('guideRoleBadge').textContent = g.role;
  document.getElementById('guideDamageBadge').textContent = g.damageType;
  document.getElementById('guideWinRate').textContent = g.winRate || 'Sem dados';
  document.getElementById('guidePickRate').textContent = g.pickRate || 'Sem dados';
  document.getElementById('guideBanRate').textContent = g.banRate || 'Sem dados';
  document.getElementById('guideDifficulty').textContent = g.difficulty || 'Média';

  const mySelect = document.getElementById('selectMyChamp');
  if (mySelect && mySelect.value !== g.id) mySelect.value = g.id;

  // Resumo da composição inimiga
  const compBar = document.getElementById('enemyCompSummaryBadge');
  if (compBar && g.enemyCompAnalysis) {
    compBar.textContent = `📊 Análise do Time Inimigo: ${g.enemyCompAnalysis.summaryText}`;
  }

  // Atualiza os cabeçalhos das 3 Abas de Build
  const builds = g.builds || [];
  const wrLabel = (b) => (b.winRate ? `${String(b.winRate).replace(/ WR$/, '')} WR` : '');
  if (builds[0]) document.getElementById('tab0Wr').textContent = wrLabel(builds[0]);
  if (builds[1]) document.getElementById('tab1Wr').textContent = wrLabel(builds[1]);
  if (builds[2]) {
    document.getElementById('tab2Wr').textContent = wrLabel(builds[2]);
    document.getElementById('tab2Sub').textContent = `Contra: ${enemyTeam.join(', ')}`;
  }

  // Ordem de Habilidades 1-18
  document.getElementById('guideSkillPriority').textContent = g.skillPriority || 'Q > E > W';
  document.getElementById('blitzSkillMatrix').innerHTML = renderSkillGridHtml(g.skillOrder, null, g.skillPriority);

  // Fases do Jogo
  document.getElementById('guideTipEarly').textContent = g.coachTips?.early || '';
  document.getElementById('guideTipMid').textContent = g.coachTips?.mid || '';
  document.getElementById('guideTipLate').textContent = g.coachTips?.late || '';

  // Matchups
  const renderMatchupPills = (list) =>
    (list || [])
      .map((cName) => {
        const cleanId = cName.replace(/[^a-zA-Z]/g, '');
        return `
          <div class="matchup-pill" onclick="selectChampionFromAnywhere('${cleanId}')">
            <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${cleanId}.png" onerror="this.style.display='none'" alt="${cName}" />
            <span>${cName}</span>
          </div>
        `;
      })
      .join('');

  document.getElementById('guideCountersList').innerHTML = renderMatchupPills(g.counters);
  document.getElementById('guideGoodAgainstList').innerHTML = renderMatchupPills(g.goodAgainst);

  // Renderiza os detalhes da Build Ativa (0, 1 ou 2)
  renderActiveBuildOption();
}

function renderStarterPackHtml(starterPack, ownedItemIds = new Set()) {
  if (!starterPack || !Array.isArray(starterPack.items)) return '';
  const itemsHtml = starterPack.items
    .map((st) => {
      const isOwned = ownedItemIds.has(String(st.id));
      return `
        <div class="starter-item-pill ${isOwned ? 'owned-item' : ''}">
          <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${st.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/1055.png'" alt="${st.name}" />
          <div class="starter-item-info">
            <strong>${st.name} ${isOwned ? '✅' : ''}</strong>
            <span>${st.role} • <b class="text-orange">${st.cost}</b></span>
          </div>
        </div>
      `;
    })
    .join('<span class="starter-plus">+</span>');

  return `
    <div class="starter-pack-header">
      <strong>🎒 ${starterPack.title}</strong>
      <span class="badge-bb green">Saída Nível 1 (500g)</span>
    </div>
    <p class="starter-pack-desc">${starterPack.summary}</p>
    <div class="starter-items-row">${itemsHtml}</div>
  `;
}

// Visão rápida: os 6 itens grandes em ícones grandes, na ordem de compra, com o próximo em destaque
function renderQuickItemsHtml(items, ownedItemIds = new Set()) {
  const list = items || [];
  if (list.length === 0) return '';
  const nextIdx = list.findIndex((it) => !ownedItemIds.has(String(it.id)));
  return `
    <div class="qv-items-row">
      ${list
        .map((it, idx) => {
          const owned = ownedItemIds.has(String(it.id));
          const isNext = idx === nextIdx;
          const tag = owned ? '✅ Feito' : isNext ? '👉 PRÓXIMO' : `${idx + 1}º`;
          return `
            <div class="qv-item ${owned ? 'owned' : ''} ${isNext ? 'next' : ''}" title="${it.name}">
              <span class="qv-item-tag">${tag}</span>
              <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${it.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/1036.png'" alt="${it.name}" />
              <span class="qv-item-name">${it.name}</span>
            </div>
          `;
        })
        .join('<span class="qv-arrow">›</span>')}
    </div>
  `;
}

// Grade de habilidades no estilo do Blitz: linhas Q/W/E/R e colunas do nível 1 ao 18
function renderSkillGridHtml(skillOrder, currentLevel = null, priorityText = '') {
  const order = (skillOrder || []).slice(0, 18);
  if (order.length === 0) return '';
  const keys = ['Q', 'W', 'E', 'R'];
  const live = Number.isFinite(currentLevel) && currentLevel >= 1;
  const nowSkill = live ? order[Math.min(currentLevel, order.length) - 1] : order[0];
  const nextSkill = live && currentLevel < order.length ? order[currentLevel] : null;

  const header = `
    <div class="qv-skill-now">
      <span class="qv-skill-key big ${nowSkill}">${nowSkill}</span>
      <div>
        <strong>${live ? `Nível ${currentLevel}: upe ${nowSkill}` : `Comece upando ${nowSkill}`}</strong>
        <small>${nextSkill ? `Depois, no nível ${currentLevel + 1}: ${nextSkill}` : ''}${priorityText ? `${nextSkill ? ' • ' : ''}Prioridade ${priorityText}` : ''}</small>
      </div>
    </div>
  `;

  const levelsRow = order
    .map((_, i) => `<span class="qv-lvl ${live && i + 1 === currentLevel ? 'now' : ''}">${i + 1}</span>`)
    .join('');
  const rows = keys
    .map(
      (k) => `
      <span class="qv-row-key ${k}">${k}</span>
      ${order
        .map((sk, i) => {
          const lvl = i + 1;
          if (sk !== k) return `<span class="qv-cell ${live && lvl === currentLevel ? 'now-col' : ''}"></span>`;
          const state = live ? (lvl < currentLevel ? 'done' : lvl === currentLevel ? 'now' : '') : '';
          return `<span class="qv-cell on ${k} ${state}">${lvl}</span>`;
        })
        .join('')}
    `
    )
    .join('');

  return `
    ${header}
    <div class="qv-skill-grid" style="grid-template-columns: 28px repeat(${order.length}, minmax(0, 1fr));">
      <span></span>${levelsRow}
      ${rows}
    </div>
  `;
}

function renderCoreItemsWithComponentsHtml(items, ownedItemIds = new Set()) {
  return (items || [])
    .map((item, idx) => {
      const isCompleted = ownedItemIds.has(String(item.id));
      const fc = item.firstComponent;
      const isFirstCompOwned = fc && ownedItemIds.has(String(fc.id));
      const comps = Array.isArray(item.components) ? item.components : [];

      const compsStepperHtml =
        comps.length > 0
          ? `
          <div class="item-components-flow">
            <span class="comp-flow-label">Ordem dos Componentes deste Item:</span>
            <div class="comp-steps-row">
              ${comps
                .map((c, cIdx) => {
                  const compOwned = ownedItemIds.has(String(c.id)) || isCompleted;
                  return `
                    <div class="comp-step-chip ${cIdx === 0 ? 'first-priority' : ''} ${compOwned ? 'owned-comp' : ''}">
                      <span class="comp-step-num">${cIdx === 0 ? '1º FAÇA PRIMEIRO' : `${cIdx + 1}º Depois`}</span>
                      <div class="comp-step-main">
                        <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${c.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/1036.png'" alt="${c.name}" />
                        <div>
                          <strong>${c.name} ${compOwned ? '✅' : ''}</strong>
                          <small>${c.cost}</small>
                        </div>
                      </div>
                    </div>
                  `;
                })
                .join('<span class="comp-arrow">➔</span>')}
            </div>
          </div>
        `
          : '';

      const firstCalloutHtml = fc
        ? `
          <div class="first-component-banner ${isFirstCompOwned || isCompleted ? 'done' : ''}">
            <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${fc.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/1036.png'" alt="${fc.name}" />
            <div class="fc-text">
              <div class="fc-title">
                <span class="fc-badge">🔨 QUAL FAZER PRIMEIRO:</span>
                <strong>${fc.name} (${fc.cost})</strong>
                ${isFirstCompOwned || isCompleted ? '<span class="badge-bb green">✅ JÁ COMPRADO</span>' : ''}
              </div>
              <div class="fc-reason">${fc.reason || ''}</div>
            </div>
          </div>
        `
        : '';

      return `
        <div class="blitz-item-card detailed-item-card ${isCompleted ? 'item-completed-live' : ''}">
          <div class="blitz-item-top-row">
            <img class="big-item-img" src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${item.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/3006.png'" alt="${item.name}" />
            <div class="blitz-item-meta">
              <div class="blitz-item-title">
                <span>${idx + 1}º Item Grande: <strong>${item.name}</strong> ${isCompleted ? '✅ FECHADO' : ''}</span>
                <div class="item-badges-right">
                  <span class="badge-bb cyan">💰 ${item.totalCost || '3000g'}</span>
                  <span class="badge-bb purple">⏱️ ${item.timing || `${(idx + 1) * 5} min`}</span>
                </div>
              </div>
              <div class="blitz-item-note">${item.note}</div>
            </div>
          </div>
          ${firstCalloutHtml}
          ${compsStepperHtml}
        </div>
      `;
    })
    .join('');
}

function renderActiveBuildOption() {
  if (!currentGuide || !Array.isArray(currentGuide.builds)) return;
  const b = currentGuide.builds[activeBuildIndex] || currentGuide.builds[0];
  if (!b) return;

  // Marca a aba ativa (tanto na aba Draft quanto na aba Partida Ao Vivo)
  document.querySelectorAll('#threeBuildsTabs .build-option-tab').forEach((tab) => {
    tab.classList.toggle('active', Number(tab.dataset.buildIdx) === activeBuildIndex);
  });
  document.querySelectorAll('#liveThreeBuildsSwitch button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.liveBuild) === activeBuildIndex);
  });

  // Atualiza Card de Runas e Feitiços da Build Ativa
  document.getElementById('activeBuildBadge').textContent = b.badge;
  document.getElementById('guideRuneName').textContent = b.runes?.name || 'Página Recomendada';
  document.getElementById('guideRuneSummary').textContent = b.runes?.summary || '';

  const perkIds = b.runes?.selectedPerkIds || [];
  const runesHtml = perkIds
    .map((pid, idx) => {
      const label = b.runes?.perkNames?.[pid] || PERK_NAMES_PT[pid] || `Runa #${pid}`;
      return `<div class="rune-node ${idx === 0 ? 'keystone' : ''}">${label}</div>`;
    })
    .join('');
  document.getElementById('visualRuneTree').innerHTML = runesHtml;

  document.getElementById('guideSpellsBox').innerHTML = (b.spells || ['Flash', 'Incendiar'])
    .map((s) => `<span class="spell-pill">✨ ${s}</span>`)
    .join('');

  // Atualiza Card de Itens Iniciais (500g) + 6 Itens Grandes com Componentes
  document.getElementById('activeBuildMainTitle').textContent = `🛒 ${b.title}`;
  document.getElementById('activeBuildDescription').textContent = b.description;
  document.getElementById('activeBuildWinrateBadge').textContent = b.winRate || 'Sem dados de WR';

  const starterEl = document.getElementById('guideStarterPack');
  if (starterEl) {
    starterEl.innerHTML = renderStarterPackHtml(b.starterPack || currentGuide.starterPack);
  }

  document.getElementById('guideCoreItems').innerHTML = renderCoreItemsWithComponentsHtml(b.items);
  const guideQuick = document.getElementById('guideQuickItems');
  if (guideQuick) guideQuick.innerHTML = renderQuickItemsHtml(b.items);

  // Também atualiza o painel da aba Partida Ao Vivo se estiver visível
  if (window.latestLiveStatusData) {
    renderLiveInGameBuildPanel(window.latestLiveStatusData);
  }
}

// Clique nas 3 Abas de Opções de Build (Aba Draft)
document.querySelectorAll('#threeBuildsTabs .build-option-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeBuildIndex = Number(btn.dataset.buildIdx);
    renderActiveBuildOption();
  });
});

// Clique nos 3 Botões de Build dentro da aba Partida Ao Vivo
document.querySelectorAll('#liveThreeBuildsSwitch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeBuildIndex = Number(btn.dataset.liveBuild);
    renderActiveBuildOption();
  });
});

// Busca Global na Topbar
const globalSearch = document.getElementById('globalChampSearch');
const searchDropdown = document.getElementById('searchDropdown');

globalSearch?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    searchDropdown.classList.add('hidden');
    return;
  }
  const matches = allChampions
    .filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    .slice(0, 8);

  if (matches.length === 0) {
    searchDropdown.classList.add('hidden');
    return;
  }

  searchDropdown.innerHTML = matches
    .map(
      (c) => `
      <div class="search-item" onclick="selectChampionFromAnywhere('${c.id}')">
        <img src="${c.iconUrl}" alt="${c.name}" />
        <div>
          <strong>${c.name}</strong>
          <div style="font-size:11px;color:#6272a4;">${c.role}${c.ranked ? ` • Tier ${c.ranked.tier} (${c.ranked.winRate})` : ''}</div>
        </div>
      </div>
    `
    )
    .join('');
  searchDropdown.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.topbar-search-wrapper')) {
    searchDropdown?.classList.add('hidden');
  }
});

window.selectChampionFromAnywhere = async function (champId) {
  searchDropdown?.classList.add('hidden');
  if (globalSearch) globalSearch.value = '';
  selectedChampionId = champId;
  await refreshDraftAndBuilds();
  switchTab('champ-build-tab');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// =========================================================================
// EXPORTAR RUNAS PARA O CLIENTE DO LOL (SUPORTA QUALQUER UMA DAS 3 BUILDS)
// =========================================================================
async function exportRunesForChamp(champId, buildIdx = activeBuildIndex) {
  const feedback = document.getElementById('runeExportFeedback');
  if (feedback) {
    feedback.className = 'export-toast';
    feedback.textContent = '⏳ Enviando página de runas da Build selecionada para o LoL...';
  }

  try {
    const res = await fetch('/api/lcu/export-runes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ championId: champId, buildIndex: buildIdx })
    });
    const data = await res.json();
    if (data.ok) {
      if (feedback) {
        feedback.className = 'export-toast success';
        feedback.textContent = `✅ ${data.message}`;
      }
      showTacticalPopup({
        type: 'MACRO',
        badge: '⚡ RUNAS EXPORTADAS',
        title: 'Página Ativada no Cliente do LoL!',
        message: data.message,
        force: true
      });
    } else if (feedback) {
      feedback.className = 'export-toast error';
      feedback.textContent = `⚠️ ${data.message}`;
    }
  } catch (err) {
    if (feedback) {
      feedback.className = 'export-toast error';
      feedback.textContent = '⚠️ Erro ao conectar ao servidor local.';
    }
  }
}

document.getElementById('btnExportRunes')?.addEventListener('click', () => {
  exportRunesForChamp(selectedChampionId, activeBuildIndex);
});

// =========================================================================
// TELAS POR FASE: Draft só na Seleção de Campeões, Partida Ao Vivo só em partida
// =========================================================================
let lastPhaseWasActive = false;

async function applyPhaseVisibility(rawPhase, isLiveMatchNow) {
  const inChampSelect = rawPhase === 'ChampSelect';
  const isActive = inChampSelect || isLiveMatchNow || rawPhase === 'ReadyCheck';

  const draftDot = document.getElementById('sidebarDraftDot');
  if (draftDot) {
    draftDot.className = inChampSelect ? 'live-mini-badge on' : 'live-mini-badge';
    draftDot.textContent = inChampSelect ? 'ON' : 'OFF';
  }
  document.getElementById('draftIdleBanner')?.classList.toggle('hidden', inChampSelect);
  document.getElementById('draftLiveSection')?.classList.toggle('hidden', !inChampSelect);
  document.getElementById('liveMatchContent')?.classList.toggle('hidden', !isLiveMatchNow);

  // A partida acabou (ou o lobby foi desfeito): limpa tudo para não parecer que ainda está em jogo
  if (lastPhaseWasActive && !isActive) {
    selectedChampionId = '';
    bannedChampions = [];
    enemyTeam = [];
    lastAutoImportedChamp = '';
    await refreshDraftAndBuilds();
    switchTab('home-tab');
    setTimeout(() => loadProfile(true), 15000); // dá tempo do cliente registrar a partida no histórico
  }
  lastPhaseWasActive = isActive;
}

// =========================================================================
// MONITORAMENTO EM TEMPO REAL + TRANSIÇÃO AUTOMÁTICA PARA JOGO EM ANDAMENTO
// =========================================================================
let lastAutoPhaseState = 'INIT';

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // Servidor reiniciado com versão nova: recarrega a tela para não ficar com a versão antiga na memória
    if (data.serverBuild) {
      if (window.loadedServerBuild && window.loadedServerBuild !== data.serverBuild) {
        location.reload();
        return;
      }
      window.loadedServerBuild = data.serverBuild;
    }
    window.latestLiveStatusData = data;

    const aiModeLabel = document.getElementById('aiModeLabel');
    if (aiModeLabel) {
      aiModeLabel.textContent = data.hasGeminiKey ? 'Motor Local + Gemini' : 'Motor Tático Local';
    }

    const lcuBox = document.getElementById('lcuStatusCard');
    const lcuTitle = document.getElementById('lcuStatusTitle');
    const lcuSub = document.getElementById('lcuStatusSub');
    const topPhaseLabel = document.getElementById('topPhaseLabel');


    const rawPhase = data.lcu?.phase || 'Disconnected';
    const isLiveMatchNow = Boolean(data.inLiveGame || rawPhase === 'InProgress' || rawPhase === 'GameStart');
    await applyPhaseVisibility(rawPhase, isLiveMatchNow);

    if (topPhaseLabel) {
      if (isLiveMatchNow) {
        topPhaseLabel.textContent = `🔥 EM PARTIDA AO VIVO (${data.matchState?.formattedTime || 'Ativa'})`;
        topPhaseLabel.className = 'text-green';
      } else if (rawPhase === 'ChampSelect') {
        topPhaseLabel.textContent = '⚡ NA SELEÇÃO DE CAMPEÕES';
        topPhaseLabel.className = 'text-purple';
      } else if (rawPhase === 'Matchmaking' || rawPhase === 'ReadyCheck') {
        topPhaseLabel.textContent = '🎯 BUSCANDO / PARTIDA ENCONTRADA!';
        topPhaseLabel.className = 'text-pink';
      } else if (data.lcu?.connected) {
        topPhaseLabel.textContent = `🟢 Conectado (${rawPhase})`;
        topPhaseLabel.className = 'text-cyan';
      } else {
        topPhaseLabel.textContent = 'Aguardando LoL...';
        topPhaseLabel.className = '';
      }
    }

    if (data.lcu && data.lcu.connected) {
      lcuBox.className = 'client-status-box connected';
      const sum = data.lcu.summoner;
      lcuTitle.textContent = `LoL Conectado: ${sum ? sum.gameName : 'Invocador'}`;
      lcuSub.textContent = isLiveMatchNow ? '🔥 Jogo em Andamento' : `Fase: ${data.lcu.phase}`;

      // 1) QUANDO ACHAR PARTIDA / ENTRAR NA SELEÇÃO DE CAMPEÕES -> MUDA SOZINHO PARA ABA DE DRAFT & BUILDS!
      const cs = data.lcu.champSelect;
      if (rawPhase === 'ReadyCheck' && lastAutoPhaseState !== 'ReadyCheck') {
        lastAutoPhaseState = 'ReadyCheck';
        switchTab('champ-build-tab');
        showTacticalPopup({
          id: 'match-found-readycheck',
          type: 'URGENT',
          badge: '🔥 PARTIDA ENCONTRADA!',
          title: 'Preparando Draft & 6 Recomendações',
          message: 'Já mudamos para a tela de Seleção de Campeões! Assim que entrar no lobby, sua rota será detectada automaticamente.'
        });
      } else if (rawPhase === 'ChampSelect') {
        if (lastAutoPhaseState !== 'ChampSelect') {
          lastAutoPhaseState = 'ChampSelect';
          switchTab('champ-build-tab');
          showTacticalPopup({
            id: 'entered-champ-select',
            type: 'MACRO',
            badge: '⚡ SELEÇÃO DE CAMPEÕES ATIVA',
            title: 'Modo Draft Ativado Automaticamente!',
            message: 'Acompanhe os 3 Counters da sua rota + 3 Top Meta e as 3 opções de Build com Itens Iniciais e Componentes.'
          });
        }

        if (cs) {
          let shouldRefreshDraft = false;
          if (cs.detectedRole && cs.detectedRole !== currentRole) {
            currentRole = cs.detectedRole;
            syncRoleUI();
            shouldRefreshDraft = true;
            showTacticalPopup({
              id: `lane-detected-${cs.detectedRole}`,
              type: 'MACRO',
              badge: `📍 ROTA RECONHECIDA: ${cs.detectedRole}`,
              title: `Você caiu na rota ${cs.detectedRole}!`,
              message: `Listamos automaticamente 3 Counters contra seu rival de ${cs.detectedRole} + 3 Mais Fortes do Meta atual.`
            });
          }
          if (Array.isArray(cs.bannedChampions) && cs.bannedChampions.length !== bannedChampions.length) {
            bannedChampions = cs.bannedChampions;
            shouldRefreshDraft = true;
          }
          // Rotas dos inimigos já deduzidas pelo servidor (pelo campeão, não pela ordem de pick)
          const liveEnemies = data.draftState?.enemyTeam || [];
          if (liveEnemies.some(Boolean) && JSON.stringify(liveEnemies) !== JSON.stringify(enemyTeam)) {
            enemyTeam = liveEnemies;
            shouldRefreshDraft = true;
          }
          if (cs.myChampionId && cs.myChampionId !== selectedChampionId) {
            selectedChampionId = cs.myChampionId;
            shouldRefreshDraft = true;

            const autoImport = document.getElementById('chkAutoImportRunes')?.checked;
            if (autoImport && lastAutoImportedChamp !== cs.myChampionId) {
              lastAutoImportedChamp = cs.myChampionId;
              exportRunesForChamp(cs.myChampionId, activeBuildIndex);
            }
          }
          if (shouldRefreshDraft) {
            await refreshDraftAndBuilds();
          }
        }
      }
    } else {
      lcuBox.className = 'client-status-box disconnected';
      lcuTitle.textContent = 'Cliente LoL Offline';
      lcuSub.textContent = 'Aguardando abertura do jogo';

    }

    // 2) QUANDO A PARTIDA COMEÇAR (PORTA 2999 OU FASE INPROGRESS) -> VIRA AUTOMATICAMENTE PARA O MODO JOGO EM ANDAMENTO!
    if (isLiveMatchNow) {
      const liveChamp = data.matchState?.activePlayer?.championId || data.activeChampionId;
      const liveEnemies = data.draftState?.enemyTeam || [];
      let needsSync = false;

      if (liveChamp && liveChamp !== selectedChampionId) {
        selectedChampionId = liveChamp;
        needsSync = true;
      }
      if (liveEnemies.length > 0 && JSON.stringify(liveEnemies) !== JSON.stringify(enemyTeam)) {
        enemyTeam = liveEnemies;
        needsSync = true;
      }
      if (needsSync) {
        await refreshDraftAndBuilds();
      }

      if (lastAutoPhaseState !== 'InProgress') {
        lastAutoPhaseState = 'InProgress';
        switchTab('live-game-tab');
        showTacticalPopup({
          id: `live-match-started-${selectedChampionId}`,
          type: 'URGENT',
          badge: `⚔️ JOGO EM ANDAMENTO (${selectedChampionId.toUpperCase()})`,
          title: 'Modo Partida Ao Vivo Ativado Automaticamente!',
          message: `Carregamos os Itens Iniciais, o 1º Componente de cada Item Grande e os alertas em tempo real para ${selectedChampionId}!`,
          force: true
        });
      }
    } else if (rawPhase !== 'ChampSelect' && rawPhase !== 'ReadyCheck') {
      lastAutoPhaseState = rawPhase;
    }

    const sidebarLiveDot = document.getElementById('sidebarLiveDot');
    const idleBanner = document.getElementById('idleLiveBanner');

    if (isLiveMatchNow) {
      sidebarLiveDot.className = 'live-mini-badge on';
      sidebarLiveDot.textContent = 'AO VIVO';
      idleBanner?.classList.add('hidden');
    } else {
      sidebarLiveDot.className = 'live-mini-badge';
      sidebarLiveDot.textContent = 'OFF';
      idleBanner?.classList.remove('hidden');
    }

    renderLiveMatchView(data);
    renderLiveInGameBuildPanel(data);
    processLiveTips(data.liveTips, isLiveMatchNow);
    renderItemValue(isLiveMatchNow ? data.itemValue : null);
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
  }
}

function renderLiveInGameBuildPanel(data) {
  if (!data.matchState) return;
  const guideToUse = data.coaching?.championGuide;
  if (!guideToUse || !Array.isArray(guideToUse.builds)) return;

  const b = guideToUse.builds[activeBuildIndex] || guideToUse.builds[0];
  if (!b) return;

  const m = data.matchState;
  const p = m?.activePlayer;
  const ownedIds = new Set((p?.items || []).map((i) => String(i.itemID)));
  const currentGold = p?.currentGold ?? 500;
  const currentLevel = p?.level ?? 1;

  const headerTitle = document.getElementById('liveBuildHeaderTitle');
  if (headerTitle) {
    headerTitle.textContent = `⚔️ Guia em Partida: ${guideToUse.name} — ${b.title}`;
  }

  const enemySum = document.getElementById('liveBuildEnemySummary');
  if (enemySum && guideToUse.enemyCompAnalysis) {
    enemySum.textContent = `📊 Time Inimigo da Partida: ${guideToUse.enemyCompAnalysis.summaryText}`;
  }

  // Calcula qual é o PRÓXIMO ITEM/COMPONENTE EXATO que o jogador deve comprar agora na base
  const nextBigItem = (b.items || []).find((it) => !ownedIds.has(String(it.id))) || b.items[0];
  const nextSubComp =
    nextBigItem && Array.isArray(nextBigItem.components)
      ? nextBigItem.components.find((c) => !ownedIds.has(String(c.id))) || nextBigItem.firstComponent
      : nextBigItem?.firstComponent;

  const nextBanner = document.getElementById('liveNextBuyBanner');
  if (nextBanner && nextBigItem) {
    const targetComp = nextSubComp || { id: nextBigItem.id, name: nextBigItem.name, cost: nextBigItem.totalCost || '1100g' };
    const numericCost = parseInt(String(targetComp.cost).replace(/[^0-9]/g, ''), 10) || 1000;
    const canAffordNow = currentGold >= numericCost;
    const missingGold = Math.max(0, numericCost - currentGold);

    nextBanner.innerHTML = `
      <div class="next-buy-left">
        <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${targetComp.id}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/1036.png'" alt="${targetComp.name}" />
        <div>
          <span class="next-buy-tag">${canAffordNow ? '🟢 OURO SUFICIENTE PARA COMPRAR AGORA!' : `⏳ FALTAM ${missingGold} DE OURO (VOCÊ TEM ${currentGold}g)`}</span>
          <h3>👉 Próxima Compra na Base: <span class="text-orange">${targetComp.name} (${targetComp.cost})</span></h3>
          <p>1º passo para fechar <strong>${nextBigItem.name} (${nextBigItem.totalCost || '3000g'})</strong> • ${nextBigItem.firstComponent?.reason || nextBigItem.note}</p>
        </div>
      </div>
      <div class="next-buy-right">
        <span class="badge-bb ${canAffordNow ? 'green' : 'purple'}">
          ${canAffordNow ? '⚡ DÊ RECALL APÓS EMPURRAR A WAVE!' : `Farme mais ~${Math.ceil(missingGold / 21)} minions`}
        </span>
      </div>
    `;
  }

  // Renderiza Itens Iniciais (marcando com ✅ se já comprou na partida)
  const liveStarterEl = document.getElementById('liveStarterPackBox');
  if (liveStarterEl) {
    liveStarterEl.innerHTML = renderStarterPackHtml(b.starterPack || guideToUse.starterPack, ownedIds);
  }

  // Renderiza os 6 Itens Grandes + Qual Componente Fazer Primeiro de cada um (marcando com ✅ o que já comprou)
  const liveCoreEl = document.getElementById('liveCoreItemsTimeline');
  if (liveCoreEl) {
    liveCoreEl.innerHTML = renderCoreItemsWithComponentsHtml(b.items, ownedIds);
  }

  // Renderiza Matriz de Habilidades destacando o Nível Atual na partida!
  const skillPrioEl = document.getElementById('liveSkillPriorityText');
  if (skillPrioEl) skillPrioEl.textContent = guideToUse.skillPriority || 'Q > E > W';

  // Visão rápida no topo: itens grandes na ordem de compra + grade de habilidades com o nível atual
  const liveQuickItems = document.getElementById('liveQuickItems');
  if (liveQuickItems) liveQuickItems.innerHTML = renderQuickItemsHtml(b.items, ownedIds);
  const liveSkillMatrix = document.getElementById('liveSkillMatrix');
  if (liveSkillMatrix) {
    liveSkillMatrix.innerHTML = renderSkillGridHtml(guideToUse.skillOrder, m ? currentLevel : null, guideToUse.skillPriority);
  }

  // Runas & Feitiços compactos
  const liveRunesBox = document.getElementById('liveRunesCompactBox');
  if (liveRunesBox) {
    const perkIds = b.runes?.selectedPerkIds || [];
    const spellsHtml = (b.spells || ['Flash', 'Teleporte'])
      .map((s) => `<span class="spell-pill">✨ ${s}</span>`)
      .join(' ');
    liveRunesBox.innerHTML =
      `<div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong class="text-purple">${b.runes?.name || 'Runas Ativas'}</strong>
        <div>${spellsHtml}</div>
      </div>` +
      perkIds
        .slice(0, 6)
        .map((pid, idx) => `<div class="rune-node ${idx === 0 ? 'keystone' : ''}">${b.runes?.perkNames?.[pid] || PERK_NAMES_PT[pid] || `Runa #${pid}`}</div>`)
        .join('');
  }
}

function renderLiveMatchView(data) {
  const m = data.matchState;
  if (!m) return; // fora de partida a tela fica vazia (só o aviso de aguardando)
  const g = data.coaching?.championGuide || currentGuide;
  const champId = m?.activePlayer?.championId || data.activeChampionId || selectedChampionId;

  document.getElementById('hudChampIcon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champId}.png`;
  document.getElementById('hudChampName').textContent = g?.name || champId;

  if (!m) {
    document.getElementById('hudSummonerName').textContent = 'Aguardando início da partida no LoL • Guia abaixo já carregado!';
    document.getElementById('hudGameTime').textContent = '00:00';
    document.getElementById('hudGoldValue').textContent = '500g';
    document.getElementById('hudGoldHint').textContent = 'Compre seus Itens Iniciais abaixo';
    document.getElementById('hudGoldBox').classList.remove('urgent-gold');
    document.getElementById('hudCsPerMin').textContent = '0.0 /min';
    document.getElementById('hudCsValue').textContent = 'Total: 0 CS';
    document.getElementById('hudKdaValue').textContent = '0 / 0 / 0';
    document.getElementById('hudKdaRatio').textContent = 'KP: 0%';
    renderEmptyTables();
    return;
  }

  const p = m.activePlayer;
  document.getElementById('hudSummonerName').textContent = `🔥 EM JOGO: ${p.summonerName} • Nível ${p.level}`;
  document.getElementById('hudGameTime').textContent = m.formattedTime;

  document.getElementById('hudGoldValue').textContent = `${p.currentGold}g`;
  const goldBox = document.getElementById('hudGoldBox');
  if (p.currentGold >= 1100) {
    goldBox.classList.add('urgent-gold');
    document.getElementById('hudGoldHint').textContent = '⚠️ Ouro para fechar 1º Componente! Veja abaixo';
  } else {
    goldBox.classList.remove('urgent-gold');
    document.getElementById('hudGoldHint').textContent = 'Acumulando para 1º componente abaixo';
  }

  document.getElementById('hudCsPerMin').textContent = `${p.csPerMin} /min`;
  document.getElementById('hudCsValue').textContent = `Total: ${p.cs} CS (Meta: 7.5/m)`;
  document.getElementById('hudKdaValue').textContent = `${p.kills} / ${p.deaths} / ${p.assists}`;
  document.getElementById('hudKdaRatio').textContent = `KDA ${p.kdaRatio} • KP: ${p.killParticipation}%`;

  document.getElementById('teamScoreBadge').textContent = `Placar: ${m.teamScore.allies} x ${m.teamScore.enemies}`;
  const { dragon, heraldOrGrubs, baron } = m.objectives;

  document.getElementById('objDragonTimer').textContent = dragon.statusText;
  document.getElementById('objDragonCard').classList.toggle('urgent', Boolean(dragon.isUrgent));

  document.getElementById('objPitName').textContent = heraldOrGrubs.name;
  document.getElementById('objPitTimer').textContent = heraldOrGrubs.statusText;
  document.getElementById('objPitCard').classList.toggle('urgent', Boolean(heraldOrGrubs.isUrgent));

  document.getElementById('objBaronTimer').textContent = baron.statusText;
  document.getElementById('objBaronCard').classList.toggle('urgent', Boolean(baron.isUrgent));

  renderTeamTable('allyTeamList', m.allies, false);
  renderTeamTable('enemyTeamList', m.enemies, true);
}

function renderTeamTable(containerId, players, isEnemy) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = (players || [])
    .map((p) => {
      const cleanChamp = (p.championName || 'Renekton').replace(/[^a-zA-Z]/g, '');
      const itemsHtml = (p.items || [])
        .slice(0, 6)
        .map(
          (it) =>
            `<img class="mini-item-icon" src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${it.itemID}.png" title="${it.displayName}" />`
        )
        .join('');

      let tagHtml = '';
      if (isEnemy && p.isFed) {
        tagHtml = `<span class="threat-tag fed">🔥 PERIGO (${p.kills}/${p.deaths})</span>`;
      } else if (isEnemy && p.isVulnerable) {
        tagHtml = `<span class="threat-tag vuln">🎯 ALVO FÁCIL</span>`;
      }

      const laneLabel = { TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP' }[p.position] || '';

      return `
        <div class="player-row">
          <div class="player-row-left">
            ${laneLabel ? `<span class="slot-role-tag">${laneLabel}</span>` : ''}
            <img class="player-row-avatar" src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${cleanChamp}.png" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/Renekton.png'" alt="${p.championName}" />
            <div>
              <div class="player-row-name">${p.championName} <small>Nv.${p.level}</small></div>
              <div class="player-row-sub">${p.summonerName}</div>
            </div>
          </div>
          ${tagHtml}
          <div class="player-row-kda">${p.kills}/${p.deaths}/${p.assists} <small>(${p.cs} CS)</small></div>
          <div class="player-row-items">${itemsHtml}</div>
        </div>
      `;
    })
    .join('');
}

function renderEmptyTables() {
  const msg = `<div class="player-row"><span class="player-row-sub">Assim que a partida iniciar no League of Legends, os 10 jogadores aparecerão aqui automaticamente!</span></div>`;
  document.getElementById('allyTeamList').innerHTML = msg;
  document.getElementById('enemyTeamList').innerHTML = msg;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Dicas geradas pelo servidor observando a partida. Cada dica nova vira um popup;
// o servidor já controla a frequência para não poluir a tela.
function processLiveTips(tips, isMatchActive) {
  const list = Array.isArray(tips) ? tips : [];
  const stack = document.getElementById('coachPriorityCards');
  if (stack) {
    stack.innerHTML = list.length
      ? list
          .slice()
          .reverse()
          .slice(0, 6)
          .map(
            (t) => `
        <div class="live-alert-item ${escapeHtml(t.type)}">
          <strong>[${escapeHtml(t.formattedTime)}] ${escapeHtml(t.title)}:</strong> ${escapeHtml(t.message)}
        </div>
      `
          )
          .join('')
      : `<div class="live-alert-item MACRO">${
          isMatchActive
            ? 'A IA está observando a partida. As dicas aparecem aqui e em popup quando algo importante acontecer.'
            : 'Quando a partida começar, a IA passa a observar ouro, objetivos, mortes e itens e avisa o que fazer.'
        }</div>`;
  }

  const maxId = list.reduce((acc, t) => Math.max(acc, t.id || 0), 0);
  // Primeira leitura (ou servidor reiniciado): não mostra dicas antigas de uma vez
  if (lastSeenTipId === null || maxId < lastSeenTipId) {
    lastSeenTipId = maxId;
    return;
  }
  if (!isMatchActive) return;

  list
    .filter((t) => t.id > lastSeenTipId)
    .forEach((t) =>
      showTacticalPopup({
        id: `tip-${t.id}`,
        type: t.type,
        badge: escapeHtml(t.badge),
        title: escapeHtml(t.title),
        message: escapeHtml(t.message)
      })
    );
  lastSeenTipId = Math.max(lastSeenTipId, maxId);
}

// =========================================================================
// TIER LIST (TODOS OS 173 CAMPEÕES)
// =========================================================================
function renderChampionsGrid() {
  const searchVal = (document.getElementById('champSearchInput')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('championsGrid');

  if (!grid) return;

  const filtered = allChampions.filter((c) => {
    const matchesSearch =
      !searchVal ||
      c.name.toLowerCase().includes(searchVal) ||
      c.id.toLowerCase().includes(searchVal) ||
      c.role.toLowerCase().includes(searchVal);
    const matchesLane = activeLaneFilter === 'ALL' || (c.lanes || []).includes(activeLaneFilter);
    const matchesTag = activeTagFilter === 'ALL' || (c.tags && c.tags.includes(activeTagFilter));
    return matchesSearch && matchesLane && matchesTag;
  });

  grid.innerHTML = filtered
    .map(
      (c) => `
      <div class="champ-card" onclick="selectChampionFromAnywhere('${c.id}')">
        <img src="${c.iconUrl}" alt="${c.name}" loading="lazy" />
        <div class="champ-card-name">${c.name}</div>
        <div class="champ-card-role">${(c.lanes || []).map((l) => LANE_LABELS[l]).join(' • ') || c.role}</div>
        ${
          c.ranked
            ? `<span class="badge-bb purple">Tier ${c.ranked.tier} • ${c.ranked.winRate} WR</span>`
            : '<span class="badge-bb muted">Sem dados de ranqueada</span>'
        }
      </div>
    `
    )
    .join('');
}

const LANE_LABELS = { TOP: 'Top', JUNGLE: 'Jungle', MID: 'Mid', ADC: 'ADC', SUPPORT: 'Suporte' };

document.getElementById('champSearchInput')?.addEventListener('input', renderChampionsGrid);

// Filtro 1: Rota | Filtro 2: Estilo do campeão (cada grupo tem seu próprio botão ativo)
document.querySelectorAll('#laneFilterGroup .filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#laneFilterGroup .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    activeLaneFilter = btn.dataset.lane;
    renderChampionsGrid();
  });
});

document.querySelectorAll('#styleFilterGroup .filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#styleFilterGroup .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    activeTagFilter = btn.dataset.tag;
    renderChampionsGrid();
  });
});

// =========================================================================
// ASSISTENTE TÁTICO IA: PERGUNTAS PRONTAS (SEM CHAT LIVRE)
// =========================================================================
document.querySelectorAll('.quick-q-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const box = document.getElementById('quickAnswerBox');
    document.querySelectorAll('.quick-q-btn').forEach((b) => b.classList.toggle('active', b === btn));
    box.classList.remove('hidden');
    box.textContent = '⏳ Lendo a partida...';
    try {
      const res = await fetch('/api/coach/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: btn.dataset.q })
      });
      const data = await res.json();
      box.innerHTML = `<strong>${escapeHtml(data.title || btn.textContent)}</strong><br />${escapeHtml(data.message || '')}`;
    } catch (_) {
      box.textContent = '⚠️ Não foi possível ler a partida agora.';
    }
  });
});

// Janela Flutuante (Mini Overlay)
document.getElementById('btnFloatingOverlay')?.addEventListener('click', () => {
  window.open(
    window.location.origin + '/?overlay=1',
    'BabiloniaBuffOverlay',
    'width=460,height=780,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
});

// Modal de Configurações
const settingsModal = document.getElementById('settingsModal');
document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});
document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
  const key = document.getElementById('inputGeminiKey').value;
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geminiApiKey: key })
  });
  const msg = document.getElementById('settingsSavedMsg');
  msg.classList.remove('hidden');
  setTimeout(() => {
    msg.classList.add('hidden');
    settingsModal.classList.add('hidden');
  }, 1000);
  pollStatus();
});

// =========================================================================
// INÍCIO: PERFIL DO JOGADOR (ELO, PDL, PARTIDAS, CAMPEÕES E QUEM JOGOU COM VOCÊ)
// =========================================================================
const TIER_PT = {
  IRON: 'Ferro', BRONZE: 'Bronze', SILVER: 'Prata', GOLD: 'Ouro', PLATINUM: 'Platina', EMERALD: 'Esmeralda',
  DIAMOND: 'Diamante', MASTER: 'Mestre', GRANDMASTER: 'Grão-Mestre', CHALLENGER: 'Desafiante'
};
let profileData = null;
let matchFilter = 'ranked';

function champIcon(id) {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${id}.png`;
}
function itemIcon(id) {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${id}.png`;
}
function rankText(q) {
  if (!q || !q.tier || q.tier === 'UNRANKED' || q.tier === 'NONE') return null;
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(q.tier);
  return `${TIER_PT[q.tier] || q.tier}${apex ? '' : ` ${q.division}`}`;
}
function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `há ${Math.max(1, Math.floor(diff / 60000))} min`;
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}
function fmtDuration(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

async function loadProfile(force = false) {
  try {
    const res = await fetch(`/api/profile${force ? '?refresh=1' : ''}`);
    profileData = await res.json();
    renderProfile();
  } catch (_) {}
}

function renderProfile() {
  const d = profileData;
  const status = document.getElementById('profileStatus');
  if (!d || !d.connected) {
    document.getElementById('profileName').textContent = 'Abra o League of Legends';
    document.getElementById('profileTag').textContent = '';
    document.getElementById('profileLevel').textContent = '--';
    status.textContent = 'Quando o cliente do LoL estiver aberto, seu perfil, elo e partidas aparecem aqui sozinhos.';
    document.getElementById('matchHistoryList').innerHTML = '<div class="empty-box">Nenhuma partida para mostrar ainda.</div>';
    ['champPerfList', 'playedWithList'].forEach((id) => (document.getElementById(id).innerHTML = ''));
    document.getElementById('lpHistoryChart').innerHTML = '';
    return;
  }

  const sum = d.summoner;
  document.getElementById('profileName').textContent = sum.gameName;
  document.getElementById('profileTag').textContent = `#${sum.tagLine}`;
  document.getElementById('profileLevel').textContent = sum.summonerLevel;
  document.getElementById('profileIcon').src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${sum.profileIconId}.png`;
  status.textContent = d.matchHistoryAvailable
    ? `Últimas ${d.matches.length} partidas lidas do seu cliente do LoL.`
    : 'Não foi possível ler o histórico de partidas do cliente agora.';

  // Ranqueada Solo/Duo
  const solo = sum.rankedSolo;
  const soloName = rankText(solo);
  document.getElementById('soloTier').textContent = soloName || 'Sem ranque';
  document.getElementById('soloLp').textContent = soloName ? `${solo.leaguePoints} PDL` : '';
  document.getElementById('soloLpBar').style.width = soloName ? `${Math.min(100, solo.leaguePoints)}%` : '0%';
  const games = solo ? solo.wins + solo.losses : 0;
  document.getElementById('soloWr').textContent = games ? `${((solo.wins / games) * 100).toFixed(1)}% de vitórias` : 'Sem partidas na temporada';
  document.getElementById('soloWl').textContent = games ? `${solo.wins}V - ${solo.losses}D` : '';
  const emblem = document.getElementById('soloEmblem');
  if (soloName) {
    emblem.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${solo.tier.toLowerCase()}.svg`;
    emblem.classList.remove('hidden');
  } else {
    emblem.classList.add('hidden');
  }
  const flex = sum.rankedFlex;
  document.getElementById('flexRank').textContent = rankText(flex) ? `${rankText(flex)} • ${flex.leaguePoints} PDL` : 'Sem ranque';

  renderLpHistory(d.lpHistory || []);

  // Desempenho por campeão
  document.getElementById('champPerfList').innerHTML = d.championPerformance.length
    ? d.championPerformance
        .slice(0, 6)
        .map(
          (c) => `
      <div class="side-row" onclick="selectChampionFromAnywhere('${c.championId}')">
        <img src="${champIcon(c.championId)}" alt="" />
        <div class="side-row-main"><strong>${escapeHtml(c.championId)}</strong><span>${c.kda} KDA</span></div>
        <div class="side-row-end"><strong class="${c.winRate >= 50 ? 'text-green' : 'text-red'}">${c.winRate}% WR</strong><span>${c.wins}V - ${c.losses}D</span></div>
      </div>`
        )
        .join('')
    : '<div class="empty-box">Nenhuma ranqueada nas partidas recentes.</div>';

  // Jogou recentemente com
  document.getElementById('playedWithList').innerHTML = d.recentlyPlayedWith.length
    ? d.recentlyPlayedWith
        .map(
          (p) => `
      <div class="side-row">
        <img src="${champIcon(p.championId)}" alt="" />
        <div class="side-row-main"><strong>${escapeHtml(p.name)}${p.tag ? `#${escapeHtml(p.tag)}` : ''}</strong><span>${p.games} partidas</span></div>
        <div class="side-row-end"><strong class="${p.winRate >= 50 ? 'text-green' : 'text-red'}">${p.winRate}% WR</strong><span>${p.wins}V - ${p.losses}D</span></div>
      </div>`
        )
        .join('')
    : '<div class="empty-box">Ninguém repetiu com você nas partidas recentes.</div>';

  renderMatchHistory();
}

function renderLpHistory(points) {
  const box = document.getElementById('lpHistoryChart');
  if (points.length < 2) {
    box.innerHTML = '<div class="empty-box">O app guarda seu PDL a cada vez que abre. O gráfico aparece depois de algumas partidas.</div>';
    return;
  }
  // Converte elo + PDL numa escala contínua para o gráfico
  const order = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
  const div = { IV: 0, III: 1, II: 2, I: 3 };
  const val = (p) => order.indexOf(p.tier) * 400 + (div[p.division] ?? 0) * 100 + p.lp;
  const vals = points.map(val);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 300;
  const h = 80;
  const xy = vals.map((v, i) => [10 + (i * (w - 20)) / (vals.length - 1), h - 10 - ((v - min) / Math.max(1, max - min)) * (h - 20)]);
  const last = points[points.length - 1];
  box.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="lp-svg" role="img" aria-label="Histórico de PDL">
      <polyline points="${xy.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--bb-cyan)" stroke-width="2" />
      ${xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--bb-cyan)" />`).join('')}
    </svg>
    <div class="lp-last">${rankText({ tier: last.tier, division: last.division })} • ${last.lp} PDL</div>`;
}

function renderMatchHistory() {
  const list = document.getElementById('matchHistoryList');
  const all = profileData?.matches || [];
  const matches = matchFilter === 'ranked' ? all.filter((m) => m.isRanked) : all;
  if (!matches.length) {
    list.innerHTML = `<div class="empty-box">${matchFilter === 'ranked' ? 'Nenhuma ranqueada nas últimas partidas.' : 'Nenhuma partida encontrada.'}</div>`;
    return;
  }
  const myPuuid = profileData.summoner.puuid;
  list.innerHTML = matches
    .map((m) => {
      const result = m.remake ? 'Refeita' : m.win ? 'Vitória' : 'Derrota';
      const cls = m.remake ? 'remake' : m.win ? 'win' : 'loss';
      const kda = ((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(1);
      const team = (id) =>
        m.participants
          .filter((p) => p.teamId === id)
          .map(
            (p) => `<div class="mp ${p.puuid && p.puuid === myPuuid ? 'me' : ''}"><img src="${champIcon(p.championId)}" alt="" /><span>${escapeHtml(p.name || p.championId)}</span></div>`
          )
          .join('');
      const items = m.items
        .map((id) => (id ? `<img src="${itemIcon(id)}" alt="" />` : '<span class="item-empty"></span>'))
        .join('');
      return `
      <div class="match-card ${cls}">
        <img class="match-champ" src="${champIcon(m.championId)}" alt="${escapeHtml(m.championId)}" />
        <div class="match-body">
          <div class="match-top"><strong class="match-result">${result}</strong><span>${m.queueName}</span><span>${fmtDuration(m.durationSec)}</span><span>${timeAgo(m.createdAt)}</span></div>
          <div class="match-stats">
            <div><strong>${kda} KDA</strong><span>${m.kills} / ${m.deaths} / ${m.assists}</span></div>
            <div><strong>${m.csPerMin} CS/min</strong><span>${m.cs} CS</span></div>
            <div><strong>${m.goldPerMin} ouro/min</strong></div>
            <div class="match-items">${items}</div>
          </div>
        </div>
        ${m.participants.length > 1 ? `<div class="match-teams"><div>${team(100)}</div><div>${team(200)}</div></div>` : ''}
      </div>`;
    })
    .join('');
}

document.querySelectorAll('[data-match-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-match-filter]').forEach((b) => b.classList.toggle('active', b === btn));
    matchFilter = btn.dataset.matchFilter;
    renderMatchHistory();
  });
});
document.getElementById('btnRefreshProfile')?.addEventListener('click', () => loadProfile(true));

// =========================================================================
// TIER LIST: SÓ RANQUEADA SOLO/DUO, FAIXAS S / A / B / C
// =========================================================================
let tlLane = 'ALL';
let tlStyle = 'ALL';
const TIER_BAND = { 'S+': 'S', S: 'S', 'A+': 'A', A: 'A', 'B+': 'B', B: 'B', C: 'C' };

function renderTierList() {
  const box = document.getElementById('tierBands');
  if (!box) return;
  const search = (document.getElementById('tlSearch')?.value || '').toLowerCase().trim();
  const patch = document.getElementById('tlPatch');
  if (patch) patch.textContent = ddragonVersion;

  const rows = [];
  allChampions.forEach((c) => {
    if (!c.ranked) return;
    if (tlStyle !== 'ALL' && !(c.tags || []).includes(tlStyle)) return;
    if (search && !c.name.toLowerCase().includes(search) && !c.id.toLowerCase().includes(search)) return;
    if (tlLane !== 'ALL' && !(c.ranked.lanes || []).includes(tlLane)) return;
    rows.push(c);
  });
  rows.sort((a, b) => parseFloat(b.ranked.winRate) - parseFloat(a.ranked.winRate));

  box.innerHTML = ['S', 'A', 'B', 'C']
    .map((band) => {
      const list = rows.filter((c) => TIER_BAND[c.ranked.tier] === band);
      return `
      <div class="tier-band band-${band}">
        <div class="tier-letter">${band}</div>
        <div class="tier-champs">
          ${
            list.length
              ? list
                  .map(
                    (c) => `
            <div class="tier-champ" onclick="selectChampionFromAnywhere('${c.id}')">
              <img src="${c.iconUrl}" alt="" loading="lazy" />
              <div><strong>${c.name}</strong><span>${c.ranked.winRate} • ${(c.ranked.lanes || []).map((l) => LANE_LABELS[l]).join('/')}</span></div>
            </div>`
                  )
                  .join('')
              : '<div class="empty-box">Nenhum campeão nesta faixa com os filtros atuais.</div>'
          }
        </div>
      </div>`;
    })
    .join('');
}

document.getElementById('tlSearch')?.addEventListener('input', renderTierList);
document.querySelectorAll('#tlLaneGroup .filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tlLaneGroup .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    tlLane = btn.dataset.lane;
    renderTierList();
  });
});
document.querySelectorAll('#tlStyleGroup .filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tlStyleGroup .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    tlStyle = btn.dataset.tag;
    renderTierList();
  });
});

// =========================================================================
// OVERLAYS: O JOGADOR LIGA/DESLIGA CADA UM (SALVO NO SERVIDOR)
// =========================================================================
async function loadOverlays() {
  try {
    const res = await fetch('/api/overlays');
    const data = await res.json();
    renderOverlayToggles(data.overlays || {});
  } catch (_) {}
}

function renderOverlayToggles(state) {
  document.querySelectorAll('.overlay-card[data-overlay]').forEach((card) => {
    const key = card.dataset.overlay;
    const btn = card.querySelector('.overlay-toggle');
    const on = state[key] !== false;
    btn.textContent = on ? 'Ligado' : 'Desligado';
    btn.classList.toggle('on', on);
  });
}

document.querySelectorAll('.overlay-card[data-overlay] .overlay-toggle').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const key = btn.closest('.overlay-card').dataset.overlay;
    const turnOn = !btn.classList.contains('on');
    const res = await fetch('/api/overlays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: turnOn })
    });
    const data = await res.json();
    renderOverlayToggles(data.overlays || {});
  });
});

// Diferença de valor de itens (Partida Ao Vivo)
function renderItemValue(iv) {
  const box = document.getElementById('itemValueBox');
  if (!box) return;
  box.classList.toggle('hidden', !iv);
  if (!iv) return;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  box.innerHTML = `
    <span class="meter-label">⚖️ VALOR DOS ITENS</span>
    <strong class="meter-val ${iv.diff >= 0 ? 'text-green' : 'text-red'}">${sign(iv.diff)}g</strong>
    <span class="meter-sub">Seu time ${iv.allies}g x ${iv.enemies}g${
      iv.lane ? ` • Rota: ${sign(iv.lane.me - iv.lane.enemy)}g vs ${escapeHtml(iv.lane.enemyChampion)}` : ''
    }</span>`;
}

// Inicialização
loadAllChampions().then(() => {
  renderTierList();
  pollStatus();
  setInterval(pollStatus, 2500);
});
loadProfile();
setInterval(loadProfile, 60 * 1000);
loadOverlays();
