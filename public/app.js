/**
 * Babilonia Buff — Frontend Principal
 * Inclui:
 * 1) Recomendador Pós-Banimentos com 6 Opções de Campeões Fortes no Meta Atual
 * 2) Gerador de 3 Opções de Build (Maior Winrate, Alternativa e Anti-Time Inimigo)
 * 3) Popups Táticos Silenciosos em Tempo Real (Sem Voz)
 */

let ddragonVersion = '16.20.1';
let allChampions = [];
let selectedChampionId = 'Darius';
let currentRole = 'TOP';
let bannedChampions = ['Jax', 'Garen', 'Zed'];
let enemyTeam = ['Aatrox', 'LeeSin', 'Malzahar', 'Jinx', 'Leona'];
let currentGuide = null;
let activeBuildIndex = 0; // 0 = Maior Winrate | 1 = Alternativa | 2 = Anti-Time Inimigo
let activeTagFilter = 'ALL';
let shownPopupIds = new Set();
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
  }, 7000);
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
        bannedChampions,
        enemyTeam
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

    if (data.guide) {
      currentGuide = data.guide;
      renderChampionAndThreeBuilds(data.guide);
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
      const currentEnemy = enemyTeam[slotIdx] || 'Aatrox';
      const isMyLaneOpponent = roleCodes[slotIdx] === currentRole;
      const optionsHtml = allChampions
        .map((c) => `<option value="${c.id}" ${c.id === currentEnemy ? 'selected' : ''}>${c.name}</option>`)
        .join('');

      return `
        <div class="enemy-slot ${isMyLaneOpponent ? 'active-lane-slot' : ''}">
          <span class="slot-role-tag">${isMyLaneOpponent ? `🎯 ${roleLabels[slotIdx]} (SEU RIVAL)` : roleLabels[slotIdx]}</span>
          <img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${currentEnemy}.png" alt="${currentEnemy}" />
          <select onchange="updateEnemySlot(${slotIdx}, this.value)" title="Inimigo ${roleLabels[slotIdx]}">
            ${optionsHtml}
          </select>
        </div>
      `;
    })
    .join('');
}

window.updateEnemySlot = async function (slotIdx, newChampId) {
  enemyTeam[slotIdx] = newChampId;
  await refreshDraftAndBuilds();
  showTacticalPopup({
    type: 'BUILD',
    badge: '🎯 COUNTERS & BUILD 3 ATUALIZADOS',
    title: `Inimigo Alterado para ${newChampId}`,
    message: 'Os 3 Counters de Rota, os 3 Mais Fortes do Meta (sem repetição) e a 3ª Build foram recalculados!',
    force: true
  });
};

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
  if (enemyLanerTitle) enemyLanerTitle.textContent = `vs ${rec.enemyLanerName || 'Oponente'}`;
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
  if (countersGrid) countersGrid.innerHTML = renderThreeCards(rec.counterPicks, true);
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
  document.getElementById('guideTierBadge').textContent = g.tier;
  document.getElementById('guideRoleBadge').textContent = g.role;
  document.getElementById('guideDamageBadge').textContent = g.damageType;
  document.getElementById('guideWinRate').textContent = g.winRate;
  document.getElementById('guidePickRate').textContent = g.pickRate || '9.5%';
  document.getElementById('guideBanRate').textContent = g.banRate || '6.2%';
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
  if (builds[0]) document.getElementById('tab0Wr').textContent = builds[0].winRate;
  if (builds[1]) document.getElementById('tab1Wr').textContent = builds[1].winRate;
  if (builds[2]) {
    document.getElementById('tab2Wr').textContent = builds[2].winRate;
    document.getElementById('tab2Sub').textContent = `Contra: ${enemyTeam.join(', ')}`;
  }

  // Ordem de Habilidades 1-18
  document.getElementById('guideSkillPriority').textContent = g.skillPriority || 'Q > E > W';
  document.getElementById('blitzSkillMatrix').innerHTML = (g.skillOrder || [])
    .map(
      (sk, idx) => `
      <div class="skill-cell ${sk}">
        <span class="lvl-num">${idx + 1}</span>
        <span class="key-letter">${sk}</span>
      </div>
    `
    )
    .join('');

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
      <span class="badge-dracula green">Saída Nível 1 (500g)</span>
    </div>
    <p class="starter-pack-desc">${starterPack.summary}</p>
    <div class="starter-items-row">${itemsHtml}</div>
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
                ${isFirstCompOwned || isCompleted ? '<span class="badge-dracula green">✅ JÁ COMPRADO</span>' : ''}
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
                  <span class="badge-dracula cyan">💰 ${item.totalCost || '3000g'}</span>
                  <span class="badge-dracula purple">⏱️ ${item.timing || `${(idx + 1) * 5} min`}</span>
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
      const label = PERK_NAMES_PT[pid] || `Runa #${pid}`;
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
  document.getElementById('activeBuildWinrateBadge').textContent = b.winRate;

  const starterEl = document.getElementById('guideStarterPack');
  if (starterEl) {
    starterEl.innerHTML = renderStarterPackHtml(b.starterPack || currentGuide.starterPack);
  }

  document.getElementById('guideCoreItems').innerHTML = renderCoreItemsWithComponentsHtml(b.items);

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
          <div style="font-size:11px;color:#6272a4;">${c.role} • Tier ${c.tier} (${c.winRate})</div>
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
// MONITORAMENTO EM TEMPO REAL + TRANSIÇÃO AUTOMÁTICA PARA JOGO EM ANDAMENTO
// =========================================================================
let lastAutoPhaseState = 'INIT';

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    window.latestLiveStatusData = data;

    document.getElementById('aiModeLabel').textContent = data.hasGeminiKey
      ? 'Google Gemini AI Ativo'
      : 'Motor Tático Local Ativo';

    const lcuBox = document.getElementById('lcuStatusCard');
    const lcuTitle = document.getElementById('lcuStatusTitle');
    const lcuSub = document.getElementById('lcuStatusSub');
    const topPhaseLabel = document.getElementById('topPhaseLabel');

    const homeClientBadge = document.getElementById('homeClientBadge');
    const homePhaseBadge = document.getElementById('homePhaseBadge');
    const homeSummonerName = document.getElementById('homeSummonerName');
    const homeSummonerSub = document.getElementById('homeSummonerSub');
    const homeProfileIcon = document.getElementById('homeProfileIcon');
    const homeRankedTier = document.getElementById('homeRankedTier');
    const homeRankedWL = document.getElementById('homeRankedWL');
    const homeSummonerLevel = document.getElementById('homeSummonerLevel');

    const rawPhase = data.lcu?.phase || 'Disconnected';
    const isLiveMatchNow = Boolean(data.inLiveGame || rawPhase === 'InProgress' || rawPhase === 'GameStart');

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
      const sumName = sum ? `${sum.gameName}#${sum.tagLine}` : 'Invocador';
      lcuTitle.textContent = `LoL Conectado: ${sum ? sum.gameName : 'Invocador'}`;
      lcuSub.textContent = isLiveMatchNow ? '🔥 Jogo em Andamento' : `Fase: ${data.lcu.phase}`;

      // Atualiza Card de Perfil Real na Home
      if (homeClientBadge) {
        homeClientBadge.className = 'badge-dracula green';
        homeClientBadge.textContent = '🟢 CLIENTE DO LOL CONECTADO';
      }
      if (homePhaseBadge) homePhaseBadge.textContent = isLiveMatchNow ? '🔥 Em Partida Ao Vivo' : `Fase: ${data.lcu.phase}`;
      if (homeSummonerName) homeSummonerName.textContent = sumName;
      if (homeSummonerSub) {
        homeSummonerSub.textContent = isLiveMatchNow
          ? `Você está em partida de ${data.activeChampionId}! Veja seu Guia de Jogo em Andamento na aba Partida Ao Vivo.`
          : 'Conectado em tempo real ao seu League of Legends! Quando achar partida, o Babilonia Buff muda de tela sozinho.';
      }
      if (homeProfileIcon && sum?.profileIconId) {
        homeProfileIcon.src = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${sum.profileIconId}.png`;
      }
      if (homeSummonerLevel && sum?.summonerLevel) {
        homeSummonerLevel.textContent = `Nível ${sum.summonerLevel}`;
      }
      if (sum?.rankedSolo && sum.rankedSolo.tier && sum.rankedSolo.tier !== 'UNRANKED' && sum.rankedSolo.tier !== 'NONE') {
        const r = sum.rankedSolo;
        if (homeRankedTier) homeRankedTier.textContent = `${r.tier} ${r.division} (${r.leaguePoints} PDL)`;
        if (homeRankedWL) homeRankedWL.textContent = `${r.wins}V / ${r.losses}D`;
      } else {
        if (homeRankedTier) homeRankedTier.textContent = 'Sem Ranque / MD5';
        if (homeRankedWL) homeRankedWL.textContent = '-- / --';
      }

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
          const liveEnemies = (cs.theirTeam || []).map((p) => p.championId).filter(Boolean);
          if (liveEnemies.length > 0 && JSON.stringify(liveEnemies) !== JSON.stringify(enemyTeam)) {
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

      if (homeClientBadge) {
        homeClientBadge.className = 'badge-dracula cyan';
        homeClientBadge.textContent = '🔌 AGUARDANDO CLIENTE DO LOL';
      }
      if (homePhaseBadge) homePhaseBadge.textContent = 'Fora de Jogo';
      if (homeSummonerName) homeSummonerName.textContent = 'Abra o League of Legends';
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
    processCoachingPopups(data.coaching, isLiveMatchNow);
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
  }
}

function renderLiveInGameBuildPanel(data) {
  const guideToUse = data.coaching?.championGuide || currentGuide;
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
        <span class="badge-dracula ${canAffordNow ? 'green' : 'purple'}">
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

  const liveSkillMatrix = document.getElementById('liveSkillMatrix');
  if (liveSkillMatrix) {
    liveSkillMatrix.innerHTML = (guideToUse.skillOrder || [])
      .map((sk, idx) => {
        const lvl = idx + 1;
        const isCurrentLvl = m && lvl === currentLevel;
        const isPastLvl = m && lvl < currentLevel;
        return `
          <div class="skill-cell ${sk} ${isCurrentLvl ? 'current-live-lvl' : ''} ${isPastLvl ? 'past-live-lvl' : ''}" title="Nível ${lvl}: Upar ${sk}">
            <span class="lvl-num">${isCurrentLvl ? `Nv.${lvl} AGORA` : lvl}</span>
            <span class="key-letter">${sk}</span>
          </div>
        `;
      })
      .join('');
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
        .map((pid, idx) => `<div class="rune-node ${idx === 0 ? 'keystone' : ''}">${PERK_NAMES_PT[pid] || `Runa #${pid}`}</div>`)
        .join('');
  }
}

function renderLiveMatchView(data) {
  const m = data.matchState;
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

      return `
        <div class="player-row">
          <div class="player-row-left">
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

function processCoachingPopups(coaching, isMatchActive) {
  if (!coaching) return;
  const stack = document.getElementById('coachPriorityCards');
  if (stack) {
    stack.innerHTML = (coaching.priorityCards || [])
      .map(
        (c) => `
        <div class="live-alert-item ${c.type}">
          <strong>[${c.badge}] ${c.title}:</strong> ${c.message}
        </div>
      `
      )
      .join('');
  }

  if (isMatchActive && Array.isArray(coaching.priorityCards)) {
    coaching.priorityCards.forEach((card) => {
      if (card.type === 'URGENT' || card.type === 'BUILD') {
        showTacticalPopup(card);
      }
    });
  }
}

// =========================================================================
// TIER LIST (TODOS OS 173 CAMPEÕES)
// =========================================================================
function renderChampionsGrid() {
  const searchVal = (document.getElementById('champSearchInput')?.value || '').toLowerCase().trim();
  const grid = document.getElementById('championsGrid');
  const homeGrid = document.getElementById('homeMetaHighlightsGrid');

  if (homeGrid && allChampions.length > 0 && !homeGrid.innerHTML) {
    const featuredIds = ['Darius', 'Aatrox', 'Yasuo', 'Ahri', 'Yone', 'Syndra', 'Viego', 'LeeSin', 'Jinx', 'Kaisa', 'Thresh', 'Lulu'];
    const featured = featuredIds
      .map((id) => allChampions.find((c) => c.id === id))
      .filter(Boolean);
    homeGrid.innerHTML = featured
      .map(
        (c) => `
        <div class="champ-card" onclick="selectChampionFromAnywhere('${c.id}')">
          <img src="${c.iconUrl}" alt="${c.name}" loading="lazy" />
          <div class="champ-card-name">${c.name}</div>
          <div class="champ-card-role">${c.role}</div>
          <span class="badge-dracula purple">Tier ${c.tier} • ${c.winRate}</span>
        </div>
      `
      )
      .join('');
  }

  if (!grid) return;

  const filtered = allChampions.filter((c) => {
    const matchesSearch =
      !searchVal ||
      c.name.toLowerCase().includes(searchVal) ||
      c.id.toLowerCase().includes(searchVal) ||
      c.role.toLowerCase().includes(searchVal);
    const matchesTag = activeTagFilter === 'ALL' || (c.tags && c.tags.includes(activeTagFilter));
    return matchesSearch && matchesTag;
  });

  grid.innerHTML = filtered
    .map(
      (c) => `
      <div class="champ-card" onclick="selectChampionFromAnywhere('${c.id}')">
        <img src="${c.iconUrl}" alt="${c.name}" loading="lazy" />
        <div class="champ-card-name">${c.name}</div>
        <div class="champ-card-role">${c.role}</div>
        <span class="badge-dracula purple">Tier ${c.tier} • ${c.winRate}</span>
      </div>
    `
    )
    .join('');
}

document.getElementById('champSearchInput')?.addEventListener('input', renderChampionsGrid);

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTagFilter = btn.dataset.tag;
    renderChampionsGrid();
  });
});

// =========================================================================
// ASSISTENTE TÁTICO IA (CHAT SILENCIOSO)
// =========================================================================
async function askCoachQuestion(questionText) {
  if (!questionText.trim()) return;
  const chatBox = document.getElementById('chatMessages');

  const userDiv = document.createElement('div');
  userDiv.className = 'chat-bubble user';
  userDiv.textContent = questionText;
  chatBox.appendChild(userDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-bubble assistant';
  loadingDiv.innerHTML = `<div class="bubble-author">⚡ Babilonia Buff AI</div><div class="bubble-text">⏳ Analisando dados...</div>`;
  chatBox.appendChild(loadingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch('/api/coach/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: questionText,
        championId: selectedChampionId,
        enemyChampionId: enemyTeam[0] || 'Malzahar'
      })
    });
    const data = await res.json();

    loadingDiv.innerHTML = `
      <div class="bubble-author">⚡ ${data.source || 'Babilonia Buff AI'}</div>
      <div class="bubble-text">${formatSimpleMarkdown(data.answer || '')}</div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    loadingDiv.innerHTML = `<div class="bubble-author">⚠️ Erro</div><div class="bubble-text">Falha ao consultar o assistente.</div>`;
  }
}

function formatSimpleMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<strong>$1</strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

document.getElementById('chatForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const q = input.value;
  input.value = '';
  askCoachQuestion(q);
});

document.querySelectorAll('.chip-dracula').forEach((chip) => {
  chip.addEventListener('click', () => {
    askCoachQuestion(chip.dataset.prompt);
  });
});

// Janela Flutuante (Mini Overlay)
document.getElementById('btnFloatingOverlay')?.addEventListener('click', () => {
  window.open(
    window.location.origin + '/?overlay=1',
    'BlitzDraculaOverlay',
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

// Inicialização
loadAllChampions().then(() => {
  pollStatus();
  setInterval(pollStatus, 2500);
});
