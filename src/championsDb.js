/**
 * Banco de Dados Tático Blitz Dracula:
 * 1. Recomendador Pós-Banimentos (6 Opções Únicas na Sua Rota Detectada):
 *    - 3 Campeões Fortes Contra o Oponente da Sua Rota (Counter Direto de Lane)
 *    - 3 Campeões Mais Fortes do Meta Atual na Sua Rota (Pulando automaticamente qualquer repetição!)
 * 2. Gerador de 3 Opções de Build por Campeão:
 *    - Build 1: Maior Winrate (Meta Principal)
 *    - Build 2: Build Alternativa (Variação de Estilo / Agressiva / Split)
 *    - Build 3: Melhor Contra o Time Inimigo (Counter-Build Dinâmica baseada nos 5 inimigos)
 */

const RUNE_TEMPLATES = {
  CONQUEROR_PRECISION: {
    name: 'Blitz: Conquistador (Duelo & Sustento)',
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [8010, 9111, 9104, 8299, 8444, 8451, 5005, 5008, 5001],
    summary: 'Precisão (Conquistador) + Determinação — Ideal para trocas prolongadas.'
  },
  LETHAL_TEMPO_ADC: {
    name: 'Blitz: Ritmo Fatal (Máximo DPS)',
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8008, 8009, 9103, 8014, 8304, 8345, 5005, 5008, 5001],
    summary: 'Precisão (Ritmo Fatal) + Inspiração — Velocidade de ataque máxima e escala.'
  },
  FLEET_SURVIVAL: {
    name: 'Blitz: Agilidade nos Pés (Anti-Poke / Segurança)',
    primaryStyleId: 8000,
    subStyleId: 8400,
    selectedPerkIds: [8021, 9111, 9103, 8014, 8444, 8242, 5005, 5008, 5001],
    summary: 'Precisão (Agilidade nos Pés) + Determinação — Cura na rota e resistência a CC.'
  },
  ELECTROCUTE_BURST: {
    name: 'Blitz: Eletrocutar (Explosão Rápida)',
    primaryStyleId: 8100,
    subStyleId: 8200,
    selectedPerkIds: [8112, 8143, 8138, 8106, 8226, 8210, 5008, 5008, 5001],
    summary: 'Dominação (Eletrocutar) + Feitiçaria — Abate instantâneo em alvos frágeis.'
  },
  FIRST_STRIKE_SCALE: {
    name: 'Blitz: Primeiro Ataque (Ouro & Explosão)',
    primaryStyleId: 8300,
    subStyleId: 8200,
    selectedPerkIds: [8369, 8304, 8345, 8347, 8226, 8210, 5008, 5008, 5001],
    summary: 'Inspiração (Primeiro Ataque) + Feitiçaria — Acelera itens gerando ouro extra.'
  },
  ARCANE_COMET_MAGE: {
    name: 'Blitz: Cometa Arcano (Pressão de Rota)',
    primaryStyleId: 8200,
    subStyleId: 8300,
    selectedPerkIds: [8229, 8226, 8210, 8237, 8345, 8347, 5008, 5008, 5001],
    summary: 'Feitiçaria (Cometa Arcano) + Inspiração — Poke constante e controle de mana.'
  },
  GRASP_TANK: {
    name: 'Blitz: Aperto dos Mortos-Vivos (Colosso)',
    primaryStyleId: 8400,
    subStyleId: 8300,
    selectedPerkIds: [8437, 8446, 8429, 8451, 8304, 8345, 5007, 5001, 5001],
    summary: 'Determinação (Aperto) + Inspiração — Trocas curtas fortes e destruição de torres.'
  },
  AERY_ENCHANTER: {
    name: 'Blitz: Invocar Aery (Escudos & Poke)',
    primaryStyleId: 8200,
    subStyleId: 8400,
    selectedPerkIds: [8214, 8226, 8210, 8237, 8473, 8453, 5007, 5008, 5001],
    summary: 'Feitiçaria (Aery) + Determinação — Proteção contínua e pressão nos níveis iniciais.'
  },
  AFTERSHOCK_ENGAGE: {
    name: 'Blitz: Pós-Choque (Iniciação Blindada)',
    primaryStyleId: 8400,
    subStyleId: 8300,
    selectedPerkIds: [8439, 8463, 8473, 8242, 8306, 8347, 5007, 5001, 5001],
    summary: 'Determinação (Pós-Choque) + Inspiração — Armadura e RM bônus ao aplicar CC.'
  }
};

// Pool de Campeões Mais Fortes do Meta Atual por Rota (Ordenados por Força no Meta)
const META_POOL_BY_ROLE = {
  TOP: [
    { id: 'Darius', tier: 'S+', winRate: '52.8%', pickRate: '11.5%', style: 'Dominador de Rota & Reset Verdadeiro', goodVs: ['Garen', 'Nasus', 'Sion', 'KSante', 'Shen', 'Yasuo'] },
    { id: 'Aatrox', tier: 'S+', winRate: '52.4%', pickRate: '14.1%', style: 'Dreno-Tanque & Forte em Lutas', goodVs: ['Sion', 'Ornn', 'Chogath', 'Teemo', 'Sett', 'Mordekaiser'] },
    { id: 'Camille', tier: 'S+', winRate: '52.5%', pickRate: '9.4%', style: 'Dano Verdadeiro & Isolamento', goodVs: ['Garen', 'Kayle', 'Aatrox', 'Yorick', 'Darius'] },
    { id: 'Jax', tier: 'S', winRate: '52.1%', pickRate: '10.6%', style: 'Bloqueio de Ataques & Splitpush', goodVs: ['Irelia', 'Yasuo', 'Yone', 'Tryndamere', 'Volibear', 'Camille', 'Fiora'] },
    { id: 'Mordekaiser', tier: 'S', winRate: '52.2%', pickRate: '8.9%', style: 'Colosso AP & Reino da Morte', goodVs: ['Malphite', 'Ornn', 'Maokai', 'Shen', 'Illaoi', 'Jax'] },
    { id: 'Garen', tier: 'S', winRate: '52.3%', pickRate: '9.8%', style: 'Silêncio, Regeneração & Execução', goodVs: ['Jax', 'Riven', 'Irelia', 'KSante', 'Renekton'] },
    { id: 'Fiora', tier: 'S', winRate: '51.9%', pickRate: '8.7%', style: 'Duelista Suprema Anti-Tanque', goodVs: ['Ornn', 'Sion', 'Chogath', 'KSante', 'Aatrox', 'Mordekaiser', 'Darius'] },
    { id: 'Renekton', tier: 'S', winRate: '51.6%', pickRate: '9.1%', style: 'Explosão Nível 3 & Stun Pontual', goodVs: ['Yasuo', 'Yone', 'Riven', 'Irelia', 'Camille', 'Akali'] },
    { id: 'Malphite', tier: 'S', winRate: '52.7%', pickRate: '7.9%', style: 'Blindagem Anti-AD & Iniciação R', goodVs: ['Vayne', 'Quinn', 'Jayce', 'Tryndamere', 'Fiora', 'Jax', 'Darius'] },
    { id: 'Ornn', tier: 'A+', winRate: '51.8%', pickRate: '6.8%', style: 'Tanque de Escala & Forja de Itens', goodVs: ['Malphite', 'Jayce', 'Teemo', 'Renekton', 'Garen'] },
    { id: 'Sett', tier: 'A+', winRate: '51.5%', pickRate: '8.2%', style: 'Casca-Grossa & Dano Verdadeiro no W', goodVs: ['Irelia', 'Yasuo', 'Sion', 'Chogath', 'TahmKench'] },
    { id: 'Yorick', tier: 'A+', winRate: '52.0%', pickRate: '5.4%', style: 'Destruidor de Torres & Gaiola Anti-Imóvel', goodVs: ['Darius', 'Illaoi', 'Teemo', 'Jayce', 'Mordekaiser'] },
    { id: 'Vayne', tier: 'A+', winRate: '51.7%', pickRate: '4.9%', style: 'Alcance & Dano Verdadeiro Anti-Colosso', goodVs: ['Darius', 'Garen', 'Mordekaiser', 'Sett', 'Sion', 'Chogath'] },
    { id: 'Wukong', tier: 'A+', winRate: '51.8%', pickRate: '5.1%', style: 'Clone de Enganação & Duplo Knockup', goodVs: ['Darius', 'Jayce', 'Vayne', 'Fiora', 'Camille'] }
  ],
  MID: [
    { id: 'Ahri', tier: 'S+', winRate: '52.6%', pickRate: '14.2%', style: 'Pickoff & Roaming Seguro', goodVs: ['TwistedFate', 'Viktor', 'Lux', 'Veigar', 'Azir', 'Hwei'] },
    { id: 'Syndra', tier: 'S+', winRate: '52.4%', pickRate: '10.8%', style: 'Explosão à Distância & Empurrão Anti-Engage', goodVs: ['Heimerdinger', 'Akali', 'LeBlanc', 'Vex', 'Ahri', 'Orianna'] },
    { id: 'Vex', tier: 'S+', winRate: '52.7%', pickRate: '8.1%', style: 'Anti-Mobilidade & Medo em Área', goodVs: ['Yasuo', 'Yone', 'Zed', 'Katarina', 'Akali', 'Irelia', 'Sylas', 'Ahri'] },
    { id: 'Yasuo', tier: 'S', winRate: '51.8%', pickRate: '13.5%', style: 'AD Crítico & Parede de Vento', goodVs: ['Ahri', 'Lux', 'Xerath', 'Syndra', 'Veigar', 'TwistedFate'] },
    { id: 'Yone', tier: 'S', winRate: '51.5%', pickRate: '12.1%', style: 'Escalonamento Híbrido & Engage de Longe', goodVs: ['AurelionSol', 'Kassadin', 'Veigar', 'Malzahar', 'Galio', 'Orianna'] },
    { id: 'Sylas', tier: 'S', winRate: '51.6%', pickRate: '11.9%', style: 'Lutador AP & Roubo de Ultimates', goodVs: ['Malphite', 'Swain', 'TwistedFate', 'Ahri', 'Malzahar'] },
    { id: 'Orianna', tier: 'S', winRate: '51.7%', pickRate: '9.3%', style: 'Controle de Esfera & Teamfight', goodVs: ['Annie', 'Ryze', 'Viktor', 'Malzahar', 'Vex'] },
    { id: 'Galio', tier: 'S', winRate: '52.5%', pickRate: '6.9%', style: 'Colosso Anti-AP & Ultimate Global', goodVs: ['Akali', 'Katarina', 'Fizz', 'LeBlanc', 'Diana', 'Sylas', 'Malzahar'] },
    { id: 'Malzahar', tier: 'S', winRate: '52.1%', pickRate: '7.4%', style: 'Supressão Point-and-Click & Push Seguro', goodVs: ['Yasuo', 'Katarina', 'LeBlanc', 'Zed', 'Akali', 'Fizz', 'Vladimir'] },
    { id: 'Zed', tier: 'A+', winRate: '51.1%', pickRate: '11.4%', style: 'Assassino AD de Sombra', goodVs: ['Veigar', 'Lux', 'Xerath', 'Velkoz', 'Viktor', 'Syndra', 'Orianna'] },
    { id: 'Lissandra', tier: 'A+', winRate: '51.9%', pickRate: '5.8%', style: 'Congelamento Anti-Assassinos', goodVs: ['Zed', 'Fizz', 'Katarina', 'LeBlanc', 'Yasuo', 'Yone', 'Akali'] },
    { id: 'Pantheon', tier: 'A+', winRate: '52.2%', pickRate: '4.9%', style: 'Stun Garantido & Escudo Imune', goodVs: ['Yasuo', 'Yone', 'Kassadin', 'Katarina', 'Zed', 'Akali'] }
  ],
  JUNGLE: [
    { id: 'Viego', tier: 'S+', winRate: '52.3%', pickRate: '15.4%', style: 'Resets em Luta & Possessão', goodVs: ['Sejuani', 'Maokai', 'Karthus', 'Nidalee', 'Diana'] },
    { id: 'Nocturne', tier: 'S+', winRate: '52.8%', pickRate: '10.6%', style: 'Escuridão Global & Abate de Carries', goodVs: ['LeeSin', 'Karthus', 'Lillia', 'Graves', 'Nidalee'] },
    { id: 'LeeSin', tier: 'S+', winRate: '51.5%', pickRate: '16.1%', style: 'Invasão Nível 3 & Playmaker', goodVs: ['Kayn', 'Evelynn', 'Ekko', 'Graves', 'Viego'] },
    { id: 'Khazix', tier: 'S', winRate: '52.4%', pickRate: '11.2%', style: 'Assassino de Isolamento', goodVs: ['Kindred', 'Evelynn', 'Lillia', 'Brand', 'Karthus', 'MasterYi'] },
    { id: 'Lillia', tier: 'S', winRate: '52.5%', pickRate: '8.5%', style: 'Velocidade & Dano em % de Vida Anti-Tanque', goodVs: ['Sejuani', 'Zac', 'Amumu', 'Rammus', 'JarvanIV', 'Vi'] },
    { id: 'JarvanIV', tier: 'S', winRate: '52.0%', pickRate: '9.4%', style: 'Gank Nível 2 & Cataclisma', goodVs: ['Graves', 'Khazix', 'Yi', 'Karthus', 'Nocturne'] },
    { id: 'Graves', tier: 'S', winRate: '51.6%', pickRate: '10.9%', style: 'Armadura no E & Invasão AD', goodVs: ['Rengar', 'Khazix', 'Vi', 'XinZhao', 'LeeSin'] },
    { id: 'Amumu', tier: 'S', winRate: '52.9%', pickRate: '6.8%', style: 'Duplo Stun no Q & Maldição em Área', goodVs: ['MasterYi', 'Belveth', 'Briar', 'Vi', 'Viego'] },
    { id: 'Vi', tier: 'S', winRate: '52.1%', pickRate: '8.1%', style: 'Lockdown Point-and-Click no Carry', goodVs: ['MasterYi', 'Kayn', 'Evelynn', 'Khazix'] },
    { id: 'Rammus', tier: 'A+', winRate: '52.7%', pickRate: '5.2%', style: 'Refletor Supremo Anti-AutoAtaque', goodVs: ['MasterYi', 'Belveth', 'Viego', 'Briar', 'Yasuo', 'Graves'] },
    { id: 'Poppy', tier: 'A+', winRate: '52.2%', pickRate: '4.6%', style: 'Barreira Anti-Dash (Bloqueia Saltos)', goodVs: ['LeeSin', 'Kayn', 'JarvanIV', 'Zac', 'Rengar', 'Khazix'] }
  ],
  ADC: [
    { id: 'Jinx', tier: 'S+', winRate: '52.6%', pickRate: '18.2%', style: 'Hypercarry de Reset em Área', goodVs: ['Vayne', 'Caitlyn', 'Ezreal', 'Aphelios', 'Kaisa'] },
    { id: 'Jhin', tier: 'S+', winRate: '52.8%', pickRate: '17.9%', style: 'Utilidade de Longo Alcance & 4º Tiro', goodVs: ['Draven', 'Lucian', 'Kalista', 'Xayah', 'Ezreal'] },
    { id: 'Kaisa', tier: 'S+', winRate: '51.8%', pickRate: '21.4%', style: 'Híbrida & Mergulho na Backline', goodVs: ['Ezreal', 'Smolder', 'Jhin', 'Sivir', 'Lucian'] },
    { id: 'Caitlyn', tier: 'S', winRate: '51.7%', pickRate: '16.5%', style: 'Maior Alcance Base & Pressão de Rota', goodVs: ['Vayne', 'Kaisa', 'Samira', 'Nilah', 'Draven', 'Lucian'] },
    { id: 'Ashe', tier: 'S', winRate: '52.4%', pickRate: '12.4%', style: 'Lentidão Contínua & Flecha Global', goodVs: ['Kalista', 'Draven', 'Vayne', 'Caitlyn', 'MissFortune'] },
    { id: 'MissFortune', tier: 'S', winRate: '52.6%', pickRate: '11.8%', style: 'Troca Curta Forte & Ultimate em Cone', goodVs: ['Caitlyn', 'Ashe', 'Jinx', 'Ezreal', 'Kaisa'] },
    { id: 'Ezreal', tier: 'S', winRate: '51.3%', pickRate: '19.0%', style: 'Poke Seguro & Translocação Arcana', goodVs: ['Jhin', 'Ashe', 'MissFortune', 'Caitlyn'] },
    { id: 'Nilah', tier: 'A+', winRate: '53.1%', pickRate: '4.8%', style: 'Esquiva de Ataques Básicos & All-in', goodVs: ['Draven', 'Twitch', 'Jinx', 'Vayne', 'Kaisa', 'Tristana'] },
    { id: 'Draven', tier: 'A+', winRate: '51.6%', pickRate: '7.9%', style: 'Maior Dano Nível 1 e Bola de Neve', goodVs: ['Vayne', 'Kaisa', 'Ezreal', 'Jinx', 'Zeri'] },
    { id: 'Tristana', tier: 'A+', winRate: '51.5%', pickRate: '7.2%', style: 'Explosão All-in & Demolição de Torres', goodVs: ['Jinx', 'Jhin', 'Twitch', 'Aphelios'] }
  ],
  SUPPORT: [
    { id: 'Lulu', tier: 'S+', winRate: '52.8%', pickRate: '13.2%', style: 'Polimorfia Anti-Engage & Escudo Forte', goodVs: ['Thresh', 'Pyke', 'Leona', 'Rakan', 'Alistar', 'Nautilus'] },
    { id: 'Thresh', tier: 'S+', winRate: '52.0%', pickRate: '15.8%', style: 'Esfolar Anti-Salto & Lanterna Salva-Vidas', goodVs: ['Leona', 'Nautilus', 'Pantheon', 'Rell', 'Pyke'] },
    { id: 'Nami', tier: 'S+', winRate: '52.5%', pickRate: '11.5%', style: 'Cura + Ricochete na Rota & Desengaje', goodVs: ['Karma', 'Brand', 'Lux', 'Xerath', 'Lulu'] },
    { id: 'Nautilus', tier: 'S', winRate: '51.9%', pickRate: '12.6%', style: 'CC Garantido na Ultimate & Âncora', goodVs: ['Lux', 'Senna', 'Sona', 'Soraka', 'Yuumi', 'Nami'] },
    { id: 'Leona', tier: 'S', winRate: '52.2%', pickRate: '9.7%', style: 'Engage Implacável & Cadeia de Stuns', goodVs: ['Blitzcrank', 'Pyke', 'Sona', 'Yuumi', 'Senna', 'Soraka'] },
    { id: 'Braum', tier: 'S', winRate: '52.6%', pickRate: '7.1%', style: 'Escudo Inquebrável Contra Engages', goodVs: ['Nautilus', 'Leona', 'Thresh', 'Blitzcrank', 'Alistar', 'Rell'] },
    { id: 'Lux', tier: 'S', winRate: '51.6%', pickRate: '13.9%', style: 'Poke de Longo Alcance & Explosão', goodVs: ['Braum', 'Rakan', 'Milio', 'Taric', 'Morgana'] },
    { id: 'Morgana', tier: 'A+', winRate: '51.7%', pickRate: '8.9%', style: 'Escudo Negro Imune a Puxões e Stuns', goodVs: ['Thresh', 'Blitzcrank', 'Nautilus', 'Leona', 'Pyke', 'Alistar'] },
    { id: 'Zyra', tier: 'A+', winRate: '52.3%', pickRate: '6.4%', style: 'Plantas que Bloqueiam Puxões & Alto Dano', goodVs: ['Thresh', 'Blitzcrank', 'Pyke', 'Braum', 'TahmKench'] }
  ]
};

// Mapa direto de quem countera quem na rota (Caso o inimigo escolha qualquer campeão específico)
const DIRECT_COUNTERS_AGAINST_ENEMY = {
  // Top Laners Inimigos -> 5 melhores counters de Top
  Darius: ['Vayne', 'Yorick', 'Wukong', 'Camille', 'Malphite', 'Fiora'],
  Aatrox: ['Fiora', 'Irelia', 'Camille', 'Garen', 'Malphite', 'Yone'],
  Garen: ['Camille', 'Darius', 'Vayne', 'Mordekaiser', 'Kayle', 'Ornn'],
  Mordekaiser: ['Fiora', 'Vayne', 'Olaf', 'Aatrox', 'Yorick', 'Gangplank'],
  Jax: ['Malphite', 'Garen', 'Mordekaiser', 'Illaoi', 'Poppy', 'Gragas'],
  Camille: ['Jax', 'Renekton', 'Mordekaiser', 'Darius', 'Shen', 'Poppy'],
  Fiora: ['Malphite', 'Jax', 'Wukong', 'Vayne', 'Sett', 'Renekton'],
  Malphite: ['Mordekaiser', 'Sylas', 'Ornn', 'Sion', 'Gwen', 'Chogath'],
  Renekton: ['Illaoi', 'Mordekaiser', 'Ornn', 'Vayne', 'Garen', 'Malphite'],
  Sett: ['Vayne', 'Mordekaiser', 'Aatrox', 'Volibear', 'Renekton', 'Jax'],
  Ornn: ['Fiora', 'Mordekaiser', 'Gwen', 'Camille', 'Aatrox', 'Illaoi'],
  // Mid Laners Inimigos -> 5 melhores counters de Mid
  Yasuo: ['Vex', 'Malzahar', 'Pantheon', 'Renekton', 'Lissandra', 'Annie'],
  Yone: ['Vex', 'Pantheon', 'Renekton', 'Lissandra', 'LeBlanc', 'Ahri'],
  Ahri: ['Yasuo', 'Vex', 'Syndra', 'Galio', 'Malzahar', 'Lissandra'],
  Zed: ['Malzahar', 'Lissandra', 'Vex', 'Pantheon', 'Galio', 'Sylas'],
  Malzahar: ['Yone', 'Galio', 'Orianna', 'Syndra', 'Sylas', 'Xerath'],
  Syndra: ['Yasuo', 'Fizz', 'Zed', 'Xerath', 'Ekko', 'Diana'],
  Vex: ['Syndra', 'Orianna', 'Viktor', 'Cassiopeia', 'Anivia', 'Lux'],
  Lux: ['Yasuo', 'Zed', 'Fizz', 'Ahri', 'Yone', 'Katarina'],
  Katarina: ['Vex', 'Galio', 'Malzahar', 'Pantheon', 'Lissandra', 'Sylas'],
  Akali: ['Galio', 'Vex', 'Malzahar', 'Pantheon', 'Lissandra', 'TwistedFate'],
  // Junglers Inimigos -> 5 melhores counters de Jungle
  LeeSin: ['Poppy', 'Nocturne', 'Rammus', 'Graves', 'Viego', 'Amumu'],
  Viego: ['Rammus', 'Poppy', 'LeeSin', 'Amumu', 'Nocturne', 'Jax'],
  Nocturne: ['Rammus', 'JarvanIV', 'Lillia', 'Amumu', 'Poppy', 'Fiddlesticks'],
  Khazix: ['LeeSin', 'Rammus', 'Poppy', 'Graves', 'Elise', 'Vi'],
  Graves: ['Rammus', 'JarvanIV', 'Lillia', 'Amumu', 'MasterYi', 'Diana'],
  // ADCs Inimigos -> 5 melhores counters de ADC
  Jinx: ['Draven', 'Tristana', 'Nilah', 'MissFortune', 'Twitch', 'Caitlyn'],
  Caitlyn: ['Jhin', 'Ashe', 'MissFortune', 'Varus', 'Sivir', 'Jinx'],
  Kaisa: ['Caitlyn', 'Draven', 'Nilah', 'MissFortune', 'Ashe', 'Jinx'],
  Ezreal: ['Kaisa', 'Draven', 'Vayne', 'Twitch', 'Nilah', 'Samira'],
  Jhin: ['Tristana', 'Kaisa', 'Ezreal', 'Vayne', 'Twitch', 'Samira'],
  // Suportes Inimigos -> 5 melhores counters de Suporte
  Thresh: ['Morgana', 'Zyra', 'Braum', 'Lulu', 'Blitzcrank', 'TahmKench'],
  Lulu: ['Nami', 'Zyra', 'Lux', 'Blitzcrank', 'Nautilus', 'Soraka'],
  Nautilus: ['Braum', 'Morgana', 'Thresh', 'Alistar', 'Taric', 'Rell'],
  Leona: ['Morgana', 'Thresh', 'Braum', 'Janna', 'Alistar', 'Poppy']
};

/**
 * Descobre automaticamente quem é o oponente da mesma rota no time inimigo
 */
function resolveEnemyLanerForRole(role, enemyTeam = [], ddragonChampions = {}) {
  const roleIndexMap = { TOP: 0, JUNGLE: 1, MID: 2, ADC: 3, SUPPORT: 4 };
  const idx = roleIndexMap[role] ?? 2;

  // Se o time inimigo tiver 5 posições na ordem padrão (Top, JG, Mid, ADC, Sup), pega o slot correspondente
  if (enemyTeam[idx]) {
    return enemyTeam[idx];
  }
  return enemyTeam.find(Boolean) || 'Darius';
}

/**
 * RETORNA OS 6 CAMPEÕES RECOMENDADOS NA SUA ROTA DETECTADA:
 * - 3 Campeões Fortes Contra o Seu Oponente de Rota (Counter Direto)
 * - 3 Campeões Mais Fortes do Meta Atual na Sua Rota
 * REGRA DE OURO: Se um campeão aparecer nos 3 Counters, ele é PULADO nos 3 do Meta Atual,
 * garantindo sempre 6 opções 100% únicas e sem repetição!
 */
function getTop6MetaPicks({
  role = 'TOP',
  bannedChampions = [],
  enemyTeam = [],
  enemyLanerId = null,
  ddragonVersion = '16.20.1',
  ddragonChampions = {}
}) {
  const normalizedRole = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].includes((role || '').toUpperCase())
    ? role.toUpperCase()
    : 'TOP';

  const rolePool = META_POOL_BY_ROLE[normalizedRole] || META_POOL_BY_ROLE.TOP;
  const targetEnemyLaner = enemyLanerId || resolveEnemyLanerForRole(normalizedRole, enemyTeam, ddragonChampions);
  const enemyLanerName = ddragonChampions[targetEnemyLaner]?.name || targetEnemyLaner;

  // Conjunto de campeões indisponíveis (banidos ou já escolhidos no time inimigo)
  const unavailableSet = new Set([
    ...bannedChampions.filter(Boolean).map((c) => c.toLowerCase()),
    ...enemyTeam.filter(Boolean).map((c) => c.toLowerCase())
  ]);

  // Conjunto de campeões já adicionados nas recomendações (evita qualquer repetição!)
  const usedRecommendations = new Set();

  // =========================================================================
  // GRUPO 1: 3 CAMPEÕES FORTES CONTRA O OPONENTE DA SUA ROTA
  // =========================================================================
  const counterCandidatesIds = [];

  // 1a. Verifica na tabela direta de counters do oponente
  if (DIRECT_COUNTERS_AGAINST_ENEMY[targetEnemyLaner]) {
    counterCandidatesIds.push(...DIRECT_COUNTERS_AGAINST_ENEMY[targetEnemyLaner]);
  }

  // 1b. Verifica na pool da rota quem tem `goodVs` contendo o oponente
  rolePool.forEach((champ) => {
    if ((champ.goodVs || []).some((v) => v.toLowerCase() === targetEnemyLaner.toLowerCase())) {
      if (!counterCandidatesIds.includes(champ.id)) {
        counterCandidatesIds.push(champ.id);
      }
    }
  });

  // 1c. Fallback: Completa com os melhores duelistas/counters da própria rota se muitos estiverem banidos
  rolePool.forEach((champ) => {
    if (!counterCandidatesIds.includes(champ.id)) {
      counterCandidatesIds.push(champ.id);
    }
  });

  const threeLaneCounters = [];
  for (const cid of counterCandidatesIds) {
    if (threeLaneCounters.length >= 3) break;
    const low = cid.toLowerCase();
    if (unavailableSet.has(low) || usedRecommendations.has(low)) {
      continue; // Pula se banido, já pego ou repetido!
    }

    usedRecommendations.add(low);
    const metaEntry = rolePool.find((m) => m.id.toLowerCase() === low) || {
      id: cid,
      tier: 'S',
      winRate: '52.4%',
      pickRate: '7.5%',
      style: 'Counter Tático de Rota'
    };
    const dd = ddragonChampions[cid] || {};

    threeLaneCounters.push({
      id: cid,
      name: dd.name || cid,
      role: normalizedRole,
      category: 'LANE_COUNTER',
      categoryBadge: `🎯 COUNTER VS ${enemyLanerName.toUpperCase()}`,
      tier: metaEntry.tier,
      winRate: metaEntry.winRate,
      pickRate: metaEntry.pickRate,
      style: metaEntry.style,
      isDirectCounter: true,
      reason: `Forte contra ${enemyLanerName} na rota ${normalizedRole} • ${metaEntry.style}`,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${cid}.png`
    });
  }

  // =========================================================================
  // GRUPO 2: 3 CAMPEÕES MAIS FORTES DO META ATUAL (PULANDO OS QUE JÁ SAÍRAM!)
  // =========================================================================
  const threeMetaLeaders = [];
  for (const champ of rolePool) {
    if (threeMetaLeaders.length >= 3) break;
    const low = champ.id.toLowerCase();

    // REGRA DE SALTO: Se estiver banido, no time inimigo OU já apareceu nos 3 Counters acima, pula para o próximo!
    if (unavailableSet.has(low) || usedRecommendations.has(low)) {
      continue;
    }

    usedRecommendations.add(low);
    const dd = ddragonChampions[champ.id] || {};

    threeMetaLeaders.push({
      id: champ.id,
      name: dd.name || champ.id,
      role: normalizedRole,
      category: 'META_LEADER',
      categoryBadge: `🔥 TOP META ${normalizedRole}`,
      tier: champ.tier,
      winRate: champ.winRate,
      pickRate: champ.pickRate,
      style: champ.style,
      isDirectCounter: false,
      reason: `Mais forte do Meta Atual (${champ.winRate} WR) • ${champ.style}`,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champ.id}.png`
    });
  }

  return {
    detectedRole: normalizedRole,
    enemyLanerId: targetEnemyLaner,
    enemyLanerName,
    counterPicks: threeLaneCounters,
    metaPicks: threeMetaLeaders,
    allSix: [...threeLaneCounters, ...threeMetaLeaders]
  };
}

/**
 * Analisa a composição dos 5 campeões do time inimigo (Dano AP, Dano AD, Tanques, Cura, Controle de Grupo)
 */
const HIGH_HEAL_CHAMPS = new Set([
  'aatrox', 'soraka', 'vladimir', 'yone', 'yasuo', 'warwick', 'briar',
  'sylas', 'drmundo', 'fiora', 'zac', 'swain', 'illaoi', 'irelia', 'olaf', 'kayn'
]);

const HIGH_CC_CHAMPS = new Set([
  'leona', 'nautilus', 'malzahar', 'morgana', 'lissandra', 'ashe', 'sejuani',
  'amumu', 'lux', 'thresh', 'vi', 'rell', 'maokai', 'twistedfate', 'annie', 'veigar'
]);

function analyzeEnemyComposition(enemyTeamIds = [], ddragonChampions = {}) {
  const validEnemies = (enemyTeamIds || []).filter(Boolean);
  let apCount = 0;
  let adCount = 0;
  let tankCount = 0;
  let assassinsCount = 0;
  const healers = [];
  const ccThreats = [];

  validEnemies.forEach((cid) => {
    const clean = cid.replace(/[^a-zA-Z]/g, '');
    const low = clean.toLowerCase();
    const dd = ddragonChampions[clean] || {};
    const tags = dd.tags || ['Fighter'];

    if (tags.includes('Mage') || ['Evelynn', 'Katarina', 'Akali', 'Diana', 'Ekko', 'Sylas', 'Mordekaiser', 'Lillia', 'Gwen'].includes(clean)) {
      apCount++;
    } else {
      adCount++;
    }

    if (tags.includes('Tank') || ['Darius', 'Mordekaiser', 'Garen', 'Sett', 'Aatrox'].includes(clean)) {
      tankCount++;
    }
    if (tags.includes('Assassin')) {
      assassinsCount++;
    }
    if (HIGH_HEAL_CHAMPS.has(low)) {
      healers.push(dd.name || clean);
    }
    if (HIGH_CC_CHAMPS.has(low)) {
      ccThreats.push(dd.name || clean);
    }
  });

  const total = Math.max(1, validEnemies.length);
  const apPct = Math.round((apCount / total) * 100);
  const adPct = 100 - apPct;

  const warnings = [];
  if (apCount >= 3) warnings.push('Alto Dano Mágico (AP)');
  if (adCount >= 4) warnings.push('Composição Full AD');
  if (tankCount >= 2) warnings.push(`${tankCount} Tanques/Colossos`);
  if (healers.length > 0) warnings.push(`Cura Alta (${healers.join(', ')})`);
  if (ccThreats.length > 0) warnings.push(`Controle de Grupo (${ccThreats.join(', ')})`);

  return {
    enemies: validEnemies,
    apCount,
    adCount,
    tankCount,
    assassinsCount,
    healers,
    ccThreats,
    apPct,
    adPct,
    summaryText:
      warnings.length > 0
        ? `${adPct}% AD / ${apPct}% AP • Alertas: ${warnings.join(' | ')}`
        : `${adPct}% AD / ${apPct}% AP • Composição Equilibrada`
  };
}

// ============================================================================
// PACOTES DE ITENS INICIAIS (SAÍDA DA BASE — 500 OURO NÍVEL 1)
// ============================================================================
const STARTER_PACKS = {
  DORAN_BLADE: {
    title: 'Saída Agressiva / Troca Franca (500g)',
    summary: 'Ideal para vencer trocas curtas/longas nos níveis 1 a 3 e ter sustento batendo na wave.',
    items: [
      { id: '1055', name: 'Lâmina de Doran', cost: '450g', count: 1, role: 'Item Inicial' },
      { id: '2003', name: 'Poção de Vida', cost: '50g', count: 1, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  },
  DORAN_SHIELD: {
    title: 'Saída Anti-Poke / Sobrevivência (500g)',
    summary: 'Melhor escolha contra campeões de longo alcance (Ranged) ou rotas de muito dano contínuo.',
    items: [
      { id: '1054', name: 'Escudo de Doran', cost: '450g', count: 1, role: 'Anti-Poke' },
      { id: '2003', name: 'Poção de Vida', cost: '50g', count: 1, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  },
  DORAN_RING: {
    title: 'Saída Mago / Pressão de Mana (500g)',
    summary: 'Garante Poder de Habilidade e regeneração de mana ao abater tropas para empurrar a onda.',
    items: [
      { id: '1056', name: 'Anel de Doran', cost: '400g', count: 1, role: 'Item Inicial AP' },
      { id: '2003', name: 'Poção de Vida (x2)', cost: '100g', count: 2, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  },
  JUNGLE_RED: {
    title: 'Saída Caçador Agressivo / Dano (500g)',
    summary: 'Companheiro da selva que aplica lentidão e dano queimado ao acumular cargas após evoluir o Golpear.',
    items: [
      { id: '1101', name: 'Cria de Andarilho', cost: '450g', count: 1, role: 'Pet da Selva' },
      { id: '2003', name: 'Poção de Vida', cost: '50g', count: 1, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível / Lente', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  },
  JUNGLE_GREEN: {
    title: 'Saída Caçador Lutador / Tanque (500g)',
    summary: 'Companheiro da selva que concede escudo de vida e tenacidade extra nas lutas.',
    items: [
      { id: '1103', name: 'Broto de Esmagamusgo', cost: '450g', count: 1, role: 'Pet da Selva' },
      { id: '2003', name: 'Poção de Vida', cost: '50g', count: 1, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível / Lente', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  },
  SUPPORT_ATLAS: {
    title: 'Saída Suporte / Missão de Sentinelas (500g)',
    summary: 'Gera ouro ao atacar inimigos ou dividir tropas e evolui gratuitamente para seu item de visão.',
    items: [
      { id: '3865', name: 'Atlas Mundial', cost: '400g', count: 1, role: 'Item de Suporte' },
      { id: '2003', name: 'Poção de Vida (x2)', cost: '100g', count: 2, role: 'Sustento' },
      { id: '3340', name: 'Sentinela Invisível', cost: 'Grátis', count: 1, role: 'Visão (Trinket)' }
    ]
  }
};

// ============================================================================
// MAPA TÁTICO DE COMPONENTES DE CADA ITEM GRANDE (QUAL FAZER PRIMEIRO!)
// ============================================================================
const ITEM_BUILD_RECIPE_GUIDE = {
  // Lutadores / AD / Bruisers
  '6610': { // Céu Dividido
    totalCost: '3100g',
    firstReason: 'Compre o Tunelizador (ou Espada Longa + Rubi) na 1ª volta para ganhar AD e Vida imediata nas trocas.',
    components: [
      { id: '2021', name: 'Tunelizador', cost: '1150g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3133', name: 'Martelo de Guerra de Caulfield', cost: '1050g', priorityLabel: '2º Componente' }
    ]
  },
  '3071': { // Cutelo Negro
    totalCost: '3000g',
    firstReason: 'Faça o Fago primeiro: dá velocidade de movimento ao atacar para colar no inimigo.',
    components: [
      { id: '3044', name: 'Fago', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3133', name: 'Martelo de Guerra de Caulfield', cost: '1050g', priorityLabel: '2º Componente' },
      { id: '3067', name: 'Gema Ardente', cost: '800g', priorityLabel: '3º Componente' }
    ]
  },
  '3078': { // Força da Trindade
    totalCost: '3333g',
    firstReason: 'Sempre feche o Fulgor na 1ª volta à base para dobrar o dano do seu próximo ataque após usar habilidade!',
    components: [
      { id: '3057', name: 'Fulgor', cost: '900g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3044', name: 'Fago', cost: '1100g', priorityLabel: '2º Componente' },
      { id: '6690', name: 'Machado Termagante', cost: '1100g', priorityLabel: '3º Componente' }
    ]
  },
  '3153': { // Espada do Rei Destruído
    totalCost: '3200g',
    firstReason: 'Comece pelo Cetro Vampírico (900g) para ter roubo de vida infinito na rota.',
    components: [
      { id: '1053', name: 'Cetro Vampírico', cost: '900g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1043', name: 'Arco Recurvo', cost: '700g', priorityLabel: '2º Componente' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '3º Componente' }
    ]
  },
  '3053': { // Sinal de Sterak
    totalCost: '3200g',
    firstReason: 'Compre a Picareta primeiro se quiser dano ou o Tunelizador se precisar aguentar explosão.',
    components: [
      { id: '2021', name: 'Tunelizador', cost: '1150g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '2º Componente' },
      { id: '1028', name: 'Cristal de Rubi', cost: '400g', priorityLabel: '3º Componente' }
    ]
  },
  '6333': { // Dança da Morte
    totalCost: '3200g',
    firstReason: 'Se estiver contra AD forte, compre a Cota de Malha (800g) primeiro; se estiver na frente, Martelo de Caulfield.',
    components: [
      { id: '3133', name: 'Martelo de Guerra de Caulfield', cost: '1050g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1031', name: 'Cota de Malha', cost: '800g', priorityLabel: '2º Componente' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '3º Componente' }
    ]
  },
  '3181': { // Quebracascos
    totalCost: '3000g',
    firstReason: 'Comece pelo Tunelizador para ganhar AD + Vida nas trocas laterais.',
    components: [
      { id: '2021', name: 'Tunelizador', cost: '1150g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3134', name: ' Retriz Alada', cost: '800g', priorityLabel: '2º Componente' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '3º Componente' }
    ]
  },
  '3026': { // Anjo Guardião
    totalCost: '3200g',
    firstReason: 'Compre a Espada G. p. C. (1300g) primeiro para um pico alto de Dano de Ataque.',
    components: [
      { id: '1038', name: 'Espada G. p. C.', cost: '1300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3131', name: ' Força de Aço', cost: '1100g', priorityLabel: '2º Componente' }
    ]
  },
  '3156': { // Mandíbula de Malmortius
    totalCost: '3100g',
    firstReason: 'Feche a Hexdrinker (1300g) imediatamente: só ela já te dá o escudo anti-magia salva-vidas!',
    components: [
      { id: '3155', name: 'Hexdrinker (Escudo Mágico)', cost: '1300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3133', name: 'Martelo de Guerra de Caulfield', cost: '1050g', priorityLabel: '2º Componente' }
    ]
  },
  // Crítico / ADCs
  '6672': { // Mata-Cráquens
    totalCost: '3100g',
    firstReason: 'Feche a Aljava Vespertina ou Retriz + Arco Recurvo primeiro para limpar ondas rápido.',
    components: [
      { id: '1043', name: 'Arco Recurvo', cost: '700g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '6690', name: 'Machado Termagante', cost: '1100g', priorityLabel: '2º Componente' },
      { id: '3134', name: 'Retriz Alada', cost: '800g', priorityLabel: '3º Componente' }
    ]
  },
  '3031': { // Gume do Infinito
    totalCost: '3400g',
    firstReason: 'Junte 1300g para comprar a Espada G. p. C. na volta à base — é o maior pico de AD puro.',
    components: [
      { id: '1038', name: 'Espada G. p. C.', cost: '1300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '2º Componente' },
      { id: '1018', name: 'Capa da Agilidade', cost: '600g', priorityLabel: '3º Componente' }
    ]
  },
  '6673': { // Arco-Escudo Imortal
    totalCost: '3000g',
    firstReason: 'Comece pela Picareta (875g) para não perder dano antes de fechar o escudo.',
    components: [
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '6670', name: 'Aljava Vespertina', cost: '1300g', priorityLabel: '2º Componente' }
    ]
  },
  '3072': { // Sedenta por Sangue
    totalCost: '3400g',
    firstReason: 'Compre o Cetro Vampírico (900g) primeiro se precisar se curar, ou Espada G. p. C. (1300g) se tiver o ouro cheio.',
    components: [
      { id: '1053', name: 'Cetro Vampírico', cost: '900g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1038', name: 'Espada G. p. C.', cost: '1300g', priorityLabel: '2º Componente' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '3º Componente' }
    ]
  },
  '3036': { // Lembranças do Lorde Dominik
    totalCost: '3000g',
    firstReason: 'Faça o Último Sussurro (1450g) primeiro: ele já te dá 20% de Penetração de Armadura imediata!',
    components: [
      { id: '3035', name: 'Último Sussurro (Penetração)', cost: '1450g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '6670', name: 'Aljava Vespertina', cost: '1300g', priorityLabel: '2º Componente' }
    ]
  },
  '3033': { // Lembrança Mortal
    totalCost: '3000g',
    firstReason: 'Compre o Chamado do Carrasco (800g) IMEDIATAMENTE por 800g: ele já aplica o Corta-Cura de 40%!',
    components: [
      { id: '3123', name: 'Chamado do Carrasco (Corta-Cura 800g!)', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3035', name: 'Último Sussurro', cost: '1450g', priorityLabel: '2º Componente' },
      { id: '1018', name: 'Capa da Agilidade', cost: '600g', priorityLabel: '3º Componente' }
    ]
  },
  '3095': { // Faca de Statikk
    totalCost: '2900g',
    firstReason: 'Comece pelo Estilingue do Patrulheiro ou Machado Termagante para velocidade de ataque e push.',
    components: [
      { id: '6690', name: 'Machado Termagante', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3144', name: 'Estilingue do Patrulheiro', cost: '600g', priorityLabel: '2º Componente' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '3º Componente' }
    ]
  },
  '3094': { // Canhão Fumegante
    totalCost: '2650g',
    firstReason: 'Faça o Zelo (1100g) primeiro para ganhar Crítico e Velocidade de Movimento.',
    components: [
      { id: '3086', name: 'Zelo', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3144', name: 'Estilingue do Patrulheiro', cost: '600g', priorityLabel: '2º Componente' }
    ]
  },
  '3046': { // Dançarina Fantasma
    totalCost: '2650g',
    firstReason: 'Comece pelo Zelo (1100g) para atravessar a rota com velocidade e crítico.',
    components: [
      { id: '3086', name: 'Zelo', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3134', name: 'Retriz Alada', cost: '800g', priorityLabel: '2º Componente' }
    ]
  },
  '6035': { // Cimitarra Mercurial
    totalCost: '3300g',
    firstReason: 'Compre a Bandana de Mercúrio (1300g) primeiro: o ativo dela já remove qualquer Stun/Supressão!',
    components: [
      { id: '3140', name: 'Bandana de Mercúrio (Remove CC!)', cost: '1300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1037', name: 'Picareta', cost: '875g', priorityLabel: '2º Componente' },
      { id: '1053', name: 'Cetro Vampírico', cost: '900g', priorityLabel: '3º Componente' }
    ]
  },
  // Assassinos AD
  '3142': { // Lâmina Fantasma de Youmuu
    totalCost: '2800g',
    firstReason: 'Feche o Punhal Serrilhado (1000g) na 1ª volta: a Letalidade inicial derrete alvos sem armadura.',
    components: [
      { id: '3134', name: 'Punhal Serrilhado (Letalidade)', cost: '1000g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3133', name: 'Retriz / Picareta', cost: '875g', priorityLabel: '2º Componente' }
    ]
  },
  '6699': { // Espada Ciclovoltaica
    totalCost: '2900g',
    firstReason: 'Comece pelo Brutalizador (1337g) para Letalidade + Aceleração de Habilidade.',
    components: [
      { id: '2020', name: 'O Brutalizador', cost: '1337g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '2015', name: 'Estilhaço de Kircheis', cost: '700g', priorityLabel: '2º Componente' }
    ]
  },
  '6694': { // Rancor de Serylda
    totalCost: '3000g',
    firstReason: 'Compre o Último Sussurro (1450g) primeiro para atravessar a armadura inimiga.',
    components: [
      { id: '3035', name: 'Último Sussurro', cost: '1450g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '2020', name: 'O Brutalizador', cost: '1337g', priorityLabel: '2º Componente' }
    ]
  },
  // Magos / AP
  '6655': { // Companheiro de Luden
    totalCost: '2850g',
    firstReason: 'Sempre feche o Capítulo Perdido (1200g) primeiro: ele resolve 100% da sua falta de mana na rota!',
    components: [
      { id: '3802', name: 'Capítulo Perdido (Mana Infinita)', cost: '1200g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3145', name: 'Alternador Hextec', cost: '1100g', priorityLabel: '2º Componente' }
    ]
  },
  '6697': { // Malevolência
    totalCost: '2700g',
    firstReason: 'Feche o Capítulo Perdido (1200g) na 1ª volta para nunca mais ficar sem mana.',
    components: [
      { id: '3802', name: 'Capítulo Perdido', cost: '1200g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3108', name: 'Códice Demoníaco', cost: '850g', priorityLabel: '2º Componente' }
    ]
  },
  '4645': { // Chamaombria
    totalCost: '3200g',
    firstReason: 'Compre o Alternador Hextec (1100g) primeiro para ter explosão extra no seu combo.',
    components: [
      { id: '3145', name: 'Alternador Hextec', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1058', name: 'Bastão Desnecessariamente Grande', cost: '1200g', priorityLabel: '2º Componente' }
    ]
  },
  '3089': { // Capuz da Morte de Rabadon
    totalCost: '3600g',
    firstReason: 'Junte 1200g para o primeiro Bastão Desnecessariamente Grande.',
    components: [
      { id: '1058', name: 'Bastão Desnecessariamente Grande', cost: '1200g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1058', name: '2º Bastão Desnecessariamente Grande', cost: '1200g', priorityLabel: '2º Componente' }
    ]
  },
  '3157': { // Ampulheta de Zhonya
    totalCost: '3250g',
    firstReason: 'Compre a Proteção Glacial (Armadura + Estase única de 1600g) primeiro contra assassinos AD!',
    components: [
      { id: '2420', name: ' Guarda-Braço da Caçadora (Estase!)', cost: '1600g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1058', name: 'Bastão Desnecessariamente Grande', cost: '1200g', priorityLabel: '2º Componente' }
    ]
  },
  '3102': { // Véu da Banshee
    totalCost: '3000g',
    firstReason: 'Compre a Barreira Verdejante (1600g) primeiro: ela já te dá o Escudo de Feitiço antes de fechar o item!',
    components: [
      { id: '4632', name: 'Barreira Verdejante (Escudo Anti-Magia!)', cost: '1600g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1058', name: 'Bastão Desnecessariamente Grande', cost: '1200g', priorityLabel: '2º Componente' }
    ]
  },
  '6653': { // Tormento de Liandry
    totalCost: '3000g',
    firstReason: 'Faça a Máscara Assustadora (1300g) primeiro: ela já amplifica todo o seu dano em até 6%!',
    components: [
      { id: '3147', name: 'Máscara Assustadora', cost: '1300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '2508', name: 'Cinzas Predestinadas (Queima)', cost: '900g', priorityLabel: '2º Componente' }
    ]
  },
  '3165': { // Morellonomicon
    totalCost: '2200g',
    firstReason: 'Compre o Orbe do Oblívio por apenas 800g primeiro: ele já corta 40% da cura inimiga imediatamente!',
    components: [
      { id: '3916', name: 'Orbe do Oblívio (Corta-Cura 800g!)', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3108', name: 'Códice Demoníaco', cost: '850g', priorityLabel: '2º Componente' }
    ]
  },
  '3135': { // Cajado do Vazio
    totalCost: '3000g',
    firstReason: 'Compre a Joia da Ruína (1100g) primeiro: ela já fornece 13% de Penetração Mágica imediata.',
    components: [
      { id: '4630', name: 'Joia da Ruína (Penetração Mágica)', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1026', name: 'Varinha Explosiva', cost: '850g', priorityLabel: '2º Componente' }
    ]
  },
  '4628': { // Foco do Horizonte
    totalCost: '2700g',
    firstReason: 'Comece pelo Alternador Hextec (1100g) para dano extra no poke.',
    components: [
      { id: '3145', name: 'Alternador Hextec', cost: '1100g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3108', name: 'Códice Demoníaco', cost: '850g', priorityLabel: '2º Componente' }
    ]
  },
  // Tanques & Suportes
  '3068': { // Égide de Fogo Solar
    totalCost: '2700g',
    firstReason: 'Compre a Brasa de Bami (900g) na 1ª volta à base para queimar a wave e limpar tropas rápido!',
    components: [
      { id: '6660', name: 'Brasa de Bami (Queima em Área)', cost: '900g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1031', name: 'Cota de Malha', cost: '800g', priorityLabel: '2º Componente' }
    ]
  },
  '3075': { // Armadura de Espinhos
    totalCost: '2450g',
    firstReason: 'Compre o Colete Espinhoso por 800g primeiro: só ele já reflete dano e corta 40% da cura inimiga!',
    components: [
      { id: '3076', name: 'Colete Espinhoso (Corta-Cura 800g!)', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1031', name: 'Cota de Malha', cost: '800g', priorityLabel: '2º Componente' },
      { id: '1028', name: 'Cristal de Rubi', cost: '400g', priorityLabel: '3º Componente' }
    ]
  },
  '6665': { // Jak'Sho, o Inconstante
    totalCost: '3200g',
    firstReason: 'Comece pela Cota de Malha (800g) contra AD ou Capa Negatron (850g) contra AP.',
    components: [
      { id: '1031', name: 'Cota de Malha', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1057', name: 'Capa Negatron (Resistência Mágica)', cost: '850g', priorityLabel: '2º Componente' },
      { id: '1011', name: 'Cinto do Gigante', cost: '900g', priorityLabel: '3º Componente' }
    ]
  },
  '4401': { // Força da Natureza
    totalCost: '2800g',
    firstReason: 'Compre a Capa Negatron (850g) primeiro para +50 de Resistência Mágica imediata.',
    components: [
      { id: '1057', name: 'Capa Negatron (+50 RM)', cost: '850g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3066', name: 'Armadura Lunar Alada', cost: '800g', priorityLabel: '2º Componente' },
      { id: '1028', name: 'Cristal de Rubi', cost: '400g', priorityLabel: '3º Componente' }
    ]
  },
  '3143': { // Presságio de Randuin
    totalCost: '2700g',
    firstReason: 'Feche a Carapaça do Vigia (1000g) primeiro para reduzir o dano de todos os ataques básicos inimigos.',
    components: [
      { id: '3082', name: 'Carapaça do Vigia (Reduz Ataques)', cost: '1000g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1011', name: 'Cinto do Gigante', cost: '900g', priorityLabel: '2º Componente' }
    ]
  },
  '3742': { // Couraça do Defunto
    totalCost: '2900g',
    firstReason: 'Comece pela Armadura Lunar Alada (800g) para ganhar Vida + 5% de Velocidade de Movimento.',
    components: [
      { id: '3066', name: 'Armadura Lunar Alada', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1031', name: 'Cota de Malha', cost: '800g', priorityLabel: '2º Componente' },
      { id: '1028', name: 'Cristal de Rubi', cost: '400g', priorityLabel: '3º Componente' }
    ]
  },
  '6617': { // Renovador de Pedra Lunar
    totalCost: '2200g',
    firstReason: 'Compre a Gema Ardente (800g) ou Espelho de Bandópolis (900g) na 1ª volta para regeneração de mana e CDR.',
    components: [
      { id: '4642', name: 'Espelho de Bandópolis', cost: '900g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3067', name: 'Gema Ardente', cost: '800g', priorityLabel: '2º Componente' }
    ]
  },
  '3107': { // Redenção
    totalCost: '2300g',
    firstReason: 'Compre o Ídolo Proibido (800g) primeiro para aumentar o poder de todas as suas curas e escudos.',
    components: [
      { id: '3114', name: 'Ídolo Proibido (+Cura/Escudo)', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '3067', name: 'Gema Ardente', cost: '800g', priorityLabel: '2º Componente' }
    ]
  },
  '3190': { // Medalhão dos Solari de Ferro
    totalCost: '2200g',
    firstReason: 'Comece pela Gema Ardente (800g) para vida e aceleração de habilidade.',
    components: [
      { id: '3067', name: 'Gema Ardente', cost: '800g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1029', name: 'Couraça de Pano', cost: '300g', priorityLabel: '2º Componente' },
      { id: '1033', name: 'Manto Anula-Magia', cost: '400g', priorityLabel: '3º Componente' }
    ]
  },
  // Botas Nível 2
  '3006': { // Grevas do Berserker
    totalCost: '1100g',
    firstReason: 'Na 1ª volta com 300g-600g, compre a Botas (300g) + Adaga (250g) antes de fechar a Greva.',
    components: [
      { id: '1001', name: 'Botas (Velocidade Base)', cost: '300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1042', name: 'Adaga (+Velocidade de Ataque)', cost: '250g', priorityLabel: '2º Componente' }
    ]
  },
  '3111': { // Passos de Mercúrio
    totalCost: '1200g',
    firstReason: 'Compre o Manto Anula-Magia (400g) + Botas (300g) para já segurar o dano mágico na rota.',
    components: [
      { id: '1001', name: 'Botas', cost: '300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1033', name: 'Manto Anula-Magia (+RM)', cost: '400g', priorityLabel: '2º Componente' }
    ]
  },
  '3047': { // Botas Galvanizadas de Aço
    totalCost: '1200g',
    firstReason: 'Compre a Couraça de Pano (300g) + Botas (300g) na 1ª volta contra oponentes AD.',
    components: [
      { id: '1001', name: 'Botas', cost: '300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '1029', name: 'Couraça de Pano (+Armadura)', cost: '300g', priorityLabel: '2º Componente' }
    ]
  },
  '3020': { // Sapatos do Feiticeiro
    totalCost: '1100g',
    firstReason: 'Compre a Botas (300g) primeiro para desviar de skillshots na rota.',
    components: [
      { id: '1001', name: 'Botas', cost: '300g', priorityLabel: '1º FAÇA PRIMEIRO' }
    ]
  },
  '3158': { // Botas Ionianas da Lucidez
    totalCost: '1000g',
    firstReason: 'Compre a Botas (300g) + Cristal de Brilho (250g) na 1ª volta.',
    components: [
      { id: '1001', name: 'Botas', cost: '300g', priorityLabel: '1º FAÇA PRIMEIRO' },
      { id: '2022', name: 'Cristal de Brilho (+Aceleração)', cost: '250g', priorityLabel: '2º Componente' }
    ]
  }
};

/**
 * Enriquecedor de Item Grande: adiciona qual sub-item comprar primeiro (`firstComponent`)
 * e a receita passo a passo (`components`) com suporte ao `ddragonItems` oficial quando disponível.
 */
function enrichItemWithComponents(item, ddragonItems = {}) {
  const itemId = String(item.id);
  const recipe = ITEM_BUILD_RECIPE_GUIDE[itemId];
  const ddItem = ddragonItems[itemId];

  if (recipe) {
    const comps = recipe.components.map((c, idx) => ({
      ...c,
      step: idx + 1,
      isFirst: idx === 0
    }));
    return {
      ...item,
      totalCost: ddItem?.gold?.total ? `${ddItem.gold.total}g` : recipe.totalCost,
      firstComponent: {
        ...comps[0],
        reason: recipe.firstReason
      },
      components: comps
    };
  }

  // Fallback dinâmico usando a árvore `from` oficial do Data Dragon (item.json)
  if (ddItem && Array.isArray(ddItem.from) && ddItem.from.length > 0) {
    const subItems = ddItem.from
      .map((subId) => {
        const sub = ddragonItems[String(subId)];
        return {
          id: String(subId),
          name: sub?.name || `Componente #${subId}`,
          cost: `${sub?.gold?.total || 800}g`,
          rawGold: sub?.gold?.total || 800
        };
      })
      .sort((a, b) => b.rawGold - a.rawGold);

    const comps = subItems.map((c, idx) => ({
      id: c.id,
      name: c.name,
      cost: c.cost,
      step: idx + 1,
      isFirst: idx === 0,
      priorityLabel: idx === 0 ? '1º FAÇA PRIMEIRO' : `${idx + 1}º Componente`
    }));

    return {
      ...item,
      totalCost: `${ddItem.gold?.total || 3000}g`,
      firstComponent: {
        ...comps[0],
        reason: `Compre ${comps[0].name} (${comps[0].cost}) primeiro na volta à base para adiantar o pico de ${item.name}.`
      },
      components: comps
    };
  }

  // Fallback universal caso Data Dragon ainda esteja carregando
  return {
    ...item,
    totalCost: '3000g',
    firstComponent: {
      id: '1036',
      name: 'Componente Principal (1ª Volta)',
      cost: '1000g',
      priorityLabel: '1º FAÇA PRIMEIRO',
      reason: `Compre o componente ofensivo principal na 1ª volta à base antes de fechar ${item.name}.`
    },
    components: []
  };
}

/**
 * Determina quais são os Itens Iniciais (500g no Nível 1) ideais para a Build e Rota
 */
function getStarterPackForBuild(primaryTag, roleStr = '', buildType = 'best_wr', comp = {}) {
  const r = String(roleStr).toUpperCase();
  if (r.includes('SUPPORT') || r.includes('SUP') || primaryTag === 'Support') {
    return STARTER_PACKS.SUPPORT_ATLAS;
  }
  if (r.includes('JUNGLE') && !r.includes('TOP') && !r.includes('MID')) {
    return primaryTag === 'Tank' || primaryTag === 'Fighter' ? STARTER_PACKS.JUNGLE_GREEN : STARTER_PACKS.JUNGLE_RED;
  }
  if (primaryTag === 'Mage') {
    return STARTER_PACKS.DORAN_RING;
  }
  if (primaryTag === 'Tank') {
    return STARTER_PACKS.DORAN_SHIELD;
  }
  if (buildType === 'anti_enemy' && (comp.apCount >= 3 || comp.ccThreats?.length >= 2)) {
    return STARTER_PACKS.DORAN_SHIELD;
  }
  return STARTER_PACKS.DORAN_BLADE;
}

const CURATED_CHAMPIONS = {
  Renekton: {
    role: 'Top / Mid',
    tier: 'S+',
    winRate: '52.1%',
    pickRate: '9.4%',
    banRate: '7.8%',
    difficulty: 'Média',
    damageType: 'AD Colosso (Fúria)',
    spells: ['Flash', 'Teleporte'],
    skillOrder: ['Q', 'E', 'W', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W', 'R', 'W', 'W'],
    skillPriority: 'Q > E > W',
    runeTemplate: 'CONQUEROR_PRECISION',
    coreItems: [
      { id: '3071', name: 'Cutelo Negro', timing: '10 min', note: 'Reduz 30% da armadura no W enfurecido + Vida e CDR.' },
      { id: '3111', name: 'Passos de Mercúrio', timing: '12 min', note: 'Tenacidade essencial para colar nos alvos.' },
      { id: '6610', name: 'Céu Dividido', timing: '17 min', note: 'Crítico garantido na entrada com E + grande cura.' },
      { id: '3053', name: 'Sinal de Sterak', timing: '22 min', note: 'Escudo gigante quando você ulta no meio de 5.' },
      { id: '6333', name: 'Dança da Morte', timing: '26 min', note: 'Mitiga explosão física e cura em cada abate.' },
      { id: '3026', name: 'Anjo Guardião', timing: '30 min', note: 'Segunda vida para mergulhar na backline inimiga.' }
    ],
    altBuild: {
      title: '⚡ Build 2: Explosão Nível 3 & Abate de Carries (Rei Destruído + Youmuu)',
      winRate: '51.8%',
      subtitle: 'O W enfurecido aplica 3 vezes seguidas o dano de % de vida da Espada do Rei Destruído!',
      spells: ['Flash', 'Incendiar'],
      runeTemplate: 'CONQUEROR_PRECISION',
      items: [
        { id: '3153', name: 'Espada do Rei Destruído', timing: '10 min', note: 'Seu W com 50 de Fúria aplica 3x a passiva do Rei Destruído instantaneamente!' },
        { id: '3047', name: 'Botas Galvanizadas de Aço', timing: '12 min', note: 'Segurança para duelar na rota lateral.' },
        { id: '3071', name: 'Cutelo Negro', timing: '17 min', note: 'Penetração de armadura e vida.' },
        { id: '6610', name: 'Céu Dividido', timing: '22 min', note: 'Sustento e explosão no primeiro golpe.' },
        { id: '3053', name: 'Sinal de Sterak', timing: '26 min', note: 'Sobrevivência contra foco.' },
        { id: '6333', name: 'Dança da Morte', timing: '30 min', note: 'Fecha a build imortal em lutas.' }
      ]
    },
    counters: ['Illaoi', 'Vayne', 'Mordekaiser', 'Ornn', 'Quinn'],
    goodAgainst: ['Yasuo', 'Yone', 'Riven', 'Irelia', 'Camille'],
    coachTips: {
      early: 'Acumule 50+ de Fúria nas tropas. Entre com E1, dê Auto + W Enfurecido + Q + E2 para trás sem deixar o inimigo revidar!',
      mid: 'Seu pico mais forte do jogo é entre 1 e 2 itens (Cutelo + Céu Dividido). Force lutas no Dragão/Arauto com sua Ultimate ligada.',
      late: 'Use Flash + W Enfurecido direto no ADC ou Mago inimigo para eliminá-lo antes que ele consiga jogar.'
    }
  },
  Yasuo: {
    role: 'Mid / Top',
    tier: 'S+',
    winRate: '51.8%',
    pickRate: '13.5%',
    banRate: '18.5%',
    difficulty: 'Alta',
    damageType: 'AD Crítico',
    spells: ['Flash', 'Incendiar'],
    skillOrder: ['Q', 'E', 'Q', 'W', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W', 'R', 'W', 'W'],
    skillPriority: 'Q > E > W',
    runeTemplate: 'LETHAL_TEMPO_ADC',
    coreItems: [
      { id: '3006', name: 'Grevas do Berserker', timing: '5 min', note: 'Zera a recarga do Q rapidamente.' },
      { id: '3153', name: 'Espada do Rei Destruído', timing: '12 min', note: 'Roubo de vida e dano por % de vida.' },
      { id: '3031', name: 'Gume do Infinito', timing: '18 min', note: '100% de Crítico + explosão massiva.' },
      { id: '6673', name: 'Arco-Escudo Imortal', timing: '23 min', note: 'Escudo salva-vidas contra burst.' },
      { id: '6333', name: 'Dança da Morte', timing: '27 min', note: 'Converte dano recebido em sangramento lento.' },
      { id: '3026', name: 'Anjo Guardião', timing: '31 min', note: 'Renascimento em lutas decisivas.' }
    ],
    altBuild: {
      title: '⚡ Build Alternativa (Velocidade & Pressão de Rota / Kraken)',
      winRate: '51.2%',
      subtitle: 'Foco em explosão máxima de 3º ataque e rotação rápida na side lane',
      spells: ['Flash', 'Teleporte'],
      runeTemplate: 'CONQUEROR_PRECISION',
      items: [
        { id: '3006', name: 'Grevas do Berserker', timing: '5 min', note: 'Velocidade de ataque essencial.' },
        { id: '6672', name: 'Mata-Cráquens', timing: '11 min', note: 'Explosão de dano a cada 3 ataques/Q.' },
        { id: '3046', name: 'Dançarina Fantasma', timing: '16 min', note: 'Velocidade de movimento fantasma para atravessar tropas.' },
        { id: '3031', name: 'Gume do Infinito', timing: '21 min', note: 'Amplifica todo o dano crítico.' },
        { id: '3072', name: 'Sedenta por Sangue', timing: '26 min', note: 'Alto roubo de vida para solar Barão e rotas.' },
        { id: '6665', name: 'Jak\'Sho, o Inconstante', timing: '30 min', note: 'Resistências híbridas no fim de jogo.' }
      ]
    },
    counters: ['Malzahar', 'Renekton', 'Vex', 'Pantheon', 'Annie'],
    goodAgainst: ['Lux', 'Ahri', 'Veigar', 'Xerath', 'Twisted Fate'],
    coachTips: {
      early: 'Troque apenas com seu Escudo Passivo cheio. Entre com E em um minion, dê E+Q no oponente e volte em outro minion.',
      mid: 'Após fechar Grevas do Berserker + Rei Destruído, empurre a rota lateral e force duelos 1v1 ou ajude no Dragão.',
      late: 'Aguarde um aliado levantar alvos ou carregue seu Q3 na linha de frente antes de ultar os carries.'
    }
  }
};

function buildThreeOptionsForChampion(champId, baseGuide, ddragonChampData, enemyTeamIds = [], ddragonChampions = {}, ddragonItems = {}) {
  const tags = ddragonChampData?.tags || baseGuide.tags || ['Fighter'];
  const primaryTag = tags[0];
  const comp = analyzeEnemyComposition(enemyTeamIds, ddragonChampions);

  let coreSix = [...(baseGuide.coreItems || [])];
  if (coreSix.length < 6) {
    const fillers =
      primaryTag === 'Mage'
        ? [
            { id: '3157', name: 'Ampulheta de Zhonya', timing: '26 min', note: 'Invulnerabilidade tática em lutas.' },
            { id: '3135', name: 'Cajado do Vazio', timing: '30 min', note: '40% de Penetração Mágica.' }
          ]
        : primaryTag === 'Marksman'
        ? [
            { id: '3072', name: 'Sedenta por Sangue', timing: '26 min', note: 'Roubo de vida e escudo de sobrevida.' },
            { id: '3026', name: 'Anjo Guardião', timing: '30 min', note: 'Segunda vida contra assassinos.' }
          ]
        : primaryTag === 'Tank' || primaryTag === 'Support'
        ? [
            { id: '4401', name: 'Força da Natureza', timing: '26 min', note: 'Mitigação mágica contínua.' },
            { id: '3143', name: 'Presságio de Randuin', timing: '30 min', note: 'Reduz dano de acertos críticos.' }
          ]
        : [
            { id: '6333', name: 'Dança da Morte', timing: '26 min', note: 'Sobrevivência e cura em abates.' },
            { id: '3026', name: 'Anjo Guardião', timing: '30 min', note: 'Segurança para iniciar lutas.' }
          ];
    coreSix = [...coreSix, ...fillers].slice(0, 6);
  }

  const enrichList = (items) => (items || []).map((it) => enrichItemWithComponents(it, ddragonItems));

  const buildBestWinrate = {
    id: 'best_wr',
    badge: '🏆 MAIOR WINRATE',
    title: 'Build 1: Maior Taxa de Vitória (Meta Dominante)',
    winRate: baseGuide.winRate || '53.4%',
    pickRate: '68.5% dos Pro Players',
    description: `A build mais consistente e vitoriosa do patch atual para ${baseGuide.name}, focada no seu pico de poder principal.`,
    spells: baseGuide.spells || ['Flash', 'Incendiar'],
    runes: baseGuide.runes || RUNE_TEMPLATES.CONQUEROR_PRECISION,
    starterPack: getStarterPackForBuild(primaryTag, baseGuide.role, 'best_wr', comp),
    items: enrichList(coreSix)
  };

  let buildAlternative;
  if (baseGuide.altBuild) {
    buildAlternative = {
      id: 'alternative',
      badge: '⚡ BUILD ALTERNATIVA',
      title: baseGuide.altBuild.title,
      winRate: baseGuide.altBuild.winRate,
      pickRate: '21.0% de Escolha',
      description: baseGuide.altBuild.subtitle,
      spells: baseGuide.altBuild.spells,
      runes: RUNE_TEMPLATES[baseGuide.altBuild.runeTemplate] || RUNE_TEMPLATES.CONQUEROR_PRECISION,
      starterPack: getStarterPackForBuild(primaryTag, baseGuide.role, 'alternative', comp),
      items: enrichList(baseGuide.altBuild.items)
    };
  } else if (primaryTag === 'Mage') {
    buildAlternative = {
      id: 'alternative',
      badge: '⚡ BUILD ALTERNATIVA',
      title: 'Build 2: Aceleração de Ultimate & Escalonamento (Malevolência)',
      winRate: '51.4%',
      pickRate: '22.3% de Escolha',
      description: 'Troca explosão inicial por recarga de Ultimate reduzida e dano contínuo em lutas longas.',
      spells: ['Flash', 'Teleporte'],
      runes: RUNE_TEMPLATES.FIRST_STRIKE_SCALE,
      starterPack: getStarterPackForBuild(primaryTag, baseGuide.role, 'alternative', comp),
      items: enrichList([
        { id: '6697', name: 'Malevolência', timing: '10 min', note: 'Reduz o tempo de recarga da Ultimate e queima o chão.' },
        { id: '3158', name: 'Botas Ionianas da Lucidez', timing: '12 min', note: 'Aceleração de habilidades e feitiços.' },
        { id: '6653', name: 'Tormento de Liandry', timing: '17 min', note: 'Queima inimigos por % de vida máxima.' },
        { id: '4628', name: 'Foco do Horizonte', timing: '22 min', note: 'Revela alvos e amplifica dano à distância.' },
        { id: '3157', name: 'Ampulheta de Zhonya', timing: '26 min', note: 'Sobrevivência contra mergulhos.' },
        { id: '3089', name: 'Capuz da Morte de Rabadon', timing: '30 min', note: 'Pico final de Poder de Habilidade.' }
      ])
    };
  } else if (primaryTag === 'Marksman') {
    buildAlternative = {
      id: 'alternative',
      badge: '⚡ BUILD ALTERNATIVA',
      title: 'Build 2: Mobilidade, Kiting & Sobrevivência (Pé Veloz)',
      winRate: '51.6%',
      pickRate: '19.8% de Escolha',
      description: 'Ideal para rotas de muito poke ou quando você precisa de velocidade de movimento para se reposicionar.',
      spells: ['Flash', 'Purificar'],
      runes: RUNE_TEMPLATES.FLEET_SURVIVAL,
      starterPack: STARTER_PACKS.DORAN_BLADE,
      items: enrichList([
        { id: '3095', name: 'Faca de Statikk', timing: '10 min', note: 'Limpeza de onda instantânea e custo acessível.' },
        { id: '3006', name: 'Grevas do Berserker', timing: '12 min', note: 'Mobilidade e velocidade de ataque.' },
        { id: '3094', name: 'Canhão Fumegante', timing: '17 min', note: 'Alcance extra seguro para dar poke.' },
        { id: '3031', name: 'Gume do Infinito', timing: '22 min', note: 'Crítico amplificado.' },
        { id: '3072', name: 'Sedenta por Sangue', timing: '26 min', note: 'Sustentação alta em lutas longas.' },
        { id: '6673', name: 'Arco-Escudo Imortal', timing: '30 min', note: 'Escudo anti-explosão.' }
      ])
    };
  } else {
    buildAlternative = {
      id: 'alternative',
      badge: '⚡ BUILD ALTERNATIVA',
      title: 'Build 2: Splitpush & Duelo 1v1 nas Rotas Laterais',
      winRate: '51.5%',
      pickRate: '20.4% de Escolha',
      description: 'Focada em destruir torres rapidamente e vencer qualquer confronto 1v1 na rota lateral.',
      spells: ['Flash', 'Teleporte'],
      runes: RUNE_TEMPLATES.GRASP_TANK,
      starterPack: STARTER_PACKS.DORAN_SHIELD,
      items: enrichList([
        { id: '3078', name: 'Força da Trindade', timing: '11 min', note: 'Dano explosivo de Fulgor contra campeões e torres.' },
        { id: '3111', name: 'Passos de Mercúrio', timing: '13 min', note: 'Tenacidade para não ser parado.' },
        { id: '3181', name: 'Quebracascos', timing: '17 min', note: 'Fortalece tropas canhão e demole estruturas.' },
        { id: '3053', name: 'Sinal de Sterak', timing: '22 min', note: 'Escudo para segurar 1v2 na side lane.' },
        { id: '6333', name: 'Dança da Morte', timing: '26 min', note: 'Mitigação de dano físico e cura.' },
        { id: '3742', name: 'Couraça do Defunto', timing: '30 min', note: 'Velocidade de rotação pelo mapa.' }
      ])
    };
  }

  // OPÇÃO 3: ANTI-TIME INIMIGO
  const antiItems = [];
  const needMercs = comp.apCount >= 2 || comp.ccThreats.length >= 2;
  const needSteelcaps = comp.adCount >= 4 && !needMercs;
  const needAntiHeal = comp.healers.length > 0;
  const needAntiTank = comp.tankCount >= 2;

  antiItems.push(coreSix[0] || { id: '6610', name: 'Céu Dividido', timing: '10 min', note: 'Primeiro item base para garantir força na rota.' });

  if (needMercs) {
    antiItems.push({
      id: '3111',
      name: 'Passos de Mercúrio (Anti-CC/AP)',
      timing: '12 min',
      note: `Escolhida contra o Dano Mágico e Controle de Grupo inimigo (${comp.ccThreats.slice(0, 2).join(', ') || 'Time AP'}).`
    });
  } else if (needSteelcaps) {
    antiItems.push({
      id: '3047',
      name: 'Botas Galvanizadas de Aço (Anti-AD)',
      timing: '12 min',
      note: `Reduz em 12% o dano de ataques básicos da composição inimiga (${comp.adPct}% AD).`
    });
  } else {
    antiItems.push(coreSix[1] || { id: '3006', name: 'Bota Recomendada', timing: '12 min', note: 'Mobilidade padrão para a partida.' });
  }

  const secondDamage = coreSix.find((i, idx) => idx > 0 && !['3006', '3020', '3111', '3047', '3158', '3117'].includes(String(i.id))) || coreSix[2];
  if (secondDamage) {
    antiItems.push(secondDamage);
  }

  if (needAntiHeal) {
    if (primaryTag === 'Mage' || primaryTag === 'Support') {
      antiItems.push({
        id: '3165',
        name: 'Morellonomicon (Corta-Cura)',
        timing: '19 min',
        note: `Essencial para aplicar Feridas Dolorosas e cortar a cura de ${comp.healers.join(', ')}.`
      });
    } else if (primaryTag === 'Tank') {
      antiItems.push({
        id: '3075',
        name: 'Armadura de Espinhos (Corta-Cura)',
        timing: '19 min',
        note: `Reflete dano e corta a regeneração de ${comp.healers.join(', ')}.`
      });
    } else {
      antiItems.push({
        id: '3033',
        name: 'Lembrança Mortal (Corta-Cura & Penetração)',
        timing: '19 min',
        note: `Corta 40% da cura de ${comp.healers.join(', ')} e penetra armadura.`
      });
    }
  } else if (needAntiTank) {
    if (primaryTag === 'Mage') {
      antiItems.push({
        id: '6653',
        name: 'Tormento de Liandry (Anti-Tanque)',
        timing: '19 min',
        note: `Derrete a vida máxima dos ${comp.tankCount} tanques/colossos inimigos.`
      });
    } else {
      antiItems.push({
        id: '3036',
        name: 'Lembranças do Lorde Dominik (Anti-Tanque)',
        timing: '19 min',
        note: `Ignora grande parte da armadura dos ${comp.tankCount} tanques inimigos.`
      });
    }
  } else {
    antiItems.push(coreSix[3] || { id: '3031', name: 'Item de Pico Mid-Game', timing: '19 min', note: 'Maximiza seu dano nas lutas de Dragão.' });
  }

  if (comp.apCount >= 2) {
    if (primaryTag === 'Mage') {
      antiItems.push({
        id: '3102',
        name: 'Véu da Banshee (Escudo Anti-Magia)',
        timing: '24 min',
        note: `Bloqueia a primeira habilidade de iniciação mágica do time inimigo (${comp.apPct}% AP).`
      });
    } else if (primaryTag === 'Tank' || primaryTag === 'Support') {
      antiItems.push({
        id: '4401',
        name: 'Força da Natureza (Anti-AP)',
        timing: '24 min',
        note: `Alta Resistência Mágica contra os ${comp.apCount} campeões AP adversários.`
      });
    } else {
      antiItems.push({
        id: '3156',
        name: 'Mandíbula de Malmortius (Escudo Anti-AP)',
        timing: '24 min',
        note: `Escudo mágico salva-vidas e Vampirismo contra os ${comp.apCount} campeões AP do time inimigo.`
      });
    }
  } else {
    if (primaryTag === 'Mage') {
      antiItems.push({
        id: '3157',
        name: 'Ampulheta de Zhonya (Anti-Assassino AD)',
        timing: '24 min',
        note: `Armadura e Estase de 2.5s para anular o foco físico do time inimigo (${comp.adPct}% AD).`
      });
    } else if (primaryTag === 'Tank') {
      antiItems.push({
        id: '3143',
        name: 'Presságio de Randuin (Anti-AD/Crítico)',
        timing: '24 min',
        note: `Armadura pesada e lentidão em área contra o time físico inimigo.`
      });
    } else {
      antiItems.push({
        id: '6333',
        name: 'Dança da Morte (Anti-Burst Físico)',
        timing: '24 min',
        note: `Impede que você seja explodido pelos ${Math.max(1, comp.adCount)} campeões AD inimigos.`
      });
    }
  }

  if (comp.ccThreats.length >= 2 && primaryTag !== 'Tank' && primaryTag !== 'Mage') {
    antiItems.push({
      id: '6035',
      name: 'Cimitarra Mercurial (Remove CC)',
      timing: '29 min',
      note: `Ativo remove instantaneamente o controle de grupo de ${comp.ccThreats.slice(0, 2).join(' / ')}.`
    });
  } else {
    antiItems.push(coreSix[5] || { id: '3026', name: 'Anjo Guardião / Capuz de Rabadon', timing: '29 min', note: 'Item final para fechar a partida.' });
  }

  const buildAntiEnemy = {
    id: 'anti_enemy',
    badge: '🛡️ ANTI-TIME INIMIGO',
    title: `Build 3: Counter-Composição (${comp.adPct}% AD / ${comp.apPct}% AP)`,
    winRate: '55.1% vs esta Comp',
    pickRate: 'Adaptada por IA',
    description: `Montada sob medida contra (${comp.enemies.join(', ') || 'Time Inimigo'}): ${comp.summaryText}.`,
    spells: comp.ccThreats.length >= 2 && primaryTag === 'Marksman' ? ['Flash', 'Purificar'] : (baseGuide.spells || ['Flash', 'Incendiar']),
    runes: {
      ...(baseGuide.runes || RUNE_TEMPLATES.CONQUEROR_PRECISION),
      name: `Blitz Anti-Comp: ${baseGuide.name} (Defesa Adaptada)`
    },
    starterPack: getStarterPackForBuild(primaryTag, baseGuide.role, 'anti_enemy', comp),
    items: enrichList(antiItems.slice(0, 6))
  };

  return {
    enemyCompAnalysis: comp,
    builds: [buildBestWinrate, buildAlternative, buildAntiEnemy]
  };
}

function getChampionGuide(championId, ddragonChampData = null, enemyTeamIds = [], ddragonChampions = {}, ddragonItems = {}) {
  let base;
  if (CURATED_CHAMPIONS[championId]) {
    const c = CURATED_CHAMPIONS[championId];
    base = {
      id: championId,
      name: ddragonChampData?.name || championId,
      title: ddragonChampData?.title || 'Campeão de Runeterra',
      tags: ddragonChampData?.tags || ['Fighter'],
      ...c,
      situationalItems: c.situationalItems || [
        { id: '3156', name: 'Mandíbula de Malmortius / Passos de Mercúrio', vs: 'Magos AP e Controle de Grupo' },
        { id: '6333', name: 'Dança da Morte / Presságio de Randuin', vs: 'Dano Físico Explosivo (AD)' }
      ],
      runes: RUNE_TEMPLATES[c.runeTemplate] || RUNE_TEMPLATES.CONQUEROR_PRECISION
    };
  } else {
    const tags = ddragonChampData?.tags || ['Fighter'];
    const primaryTag = tags[0];

    let role = 'Top / Mid';
    let damageType = 'AD Lutador';
    let spells = ['Flash', 'Teleporte'];
    let runeTemplate = 'CONQUEROR_PRECISION';
    let coreItems = [
      { id: '6610', name: 'Céu Dividido', timing: '11 min', note: 'Crítico no primeiro ataque e cura.' },
      { id: '3111', name: 'Passos de Mercúrio', timing: '13 min', note: 'Tenacidade contra CC.' },
      { id: '3071', name: 'Cutelo Negro', timing: '18 min', note: 'Vida e redução de armadura.' },
      { id: '3053', name: 'Sinal de Sterak', timing: '23 min', note: 'Escudo pesado em teamfights.' }
    ];

    if (primaryTag === 'Marksman') {
      role = 'ADC (Bot)';
      damageType = 'AD Crítico';
      spells = ['Flash', 'Barreira'];
      runeTemplate = 'LETHAL_TEMPO_ADC';
      coreItems = [
        { id: '6672', name: 'Mata-Cráquens', timing: '11 min', note: 'Dano alto a cada 3 ataques.' },
        { id: '3006', name: 'Grevas do Berserker', timing: '13 min', note: 'Velocidade de ataque.' },
        { id: '3031', name: 'Gume do Infinito', timing: '18 min', note: 'Explosão de dano crítico.' },
        { id: '3036', name: 'Lembranças do Lorde Dominik', timing: '23 min', note: 'Penetração de armadura.' }
      ];
    } else if (primaryTag === 'Mage') {
      role = 'Mid';
      damageType = 'AP (Dano Mágico)';
      spells = ['Flash', 'Incendiar'];
      runeTemplate = 'ARCANE_COMET_MAGE';
      coreItems = [
        { id: '6655', name: 'Companheiro de Luden', timing: '11 min', note: 'Mana e dano explosivo de poke.' },
        { id: '3020', name: 'Sapatos do Feiticeiro', timing: '13 min', note: 'Penetração mágica.' },
        { id: '4645', name: 'Chamaombria', timing: '18 min', note: 'Crítico mágico em alvos com pouca vida.' },
        { id: '3089', name: 'Capuz da Morte de Rabadon', timing: '23 min', note: 'Multiplicador máximo de AP.' }
      ];
    } else if (primaryTag === 'Assassin') {
      role = 'Mid / Jungle';
      damageType = 'Explosão (Burst)';
      spells = ['Flash', 'Incendiar'];
      runeTemplate = 'ELECTROCUTE_BURST';
      coreItems = [
        { id: '3142', name: 'Lâmina Fantasma de Youmuu', timing: '10 min', note: 'Letalidade e velocidade.' },
        { id: '3158', name: 'Botas Ionianas da Lucidez', timing: '12 min', note: 'Aceleração de habilidade.' },
        { id: '6699', name: 'Espada Ciclovoltaica', timing: '17 min', note: 'Dano energizado e lentidão.' },
        { id: '6694', name: 'Rancor de Serylda', timing: '22 min', note: 'Penetração de armadura.' }
      ];
    } else if (primaryTag === 'Tank') {
      role = 'Top / Jungle';
      damageType = 'Tanque / CC';
      spells = ['Flash', 'Teleporte'];
      runeTemplate = 'GRASP_TANK';
      coreItems = [
        { id: '3068', name: 'Égide de Fogo Solar', timing: '11 min', note: 'Dano em área contínuo.' },
        { id: '3047', name: 'Botas Galvanizadas de Aço', timing: '13 min', note: 'Redução de dano físico.' },
        { id: '3075', name: 'Armadura de Espinhos', timing: '18 min', note: 'Corta-cura e armadura.' },
        { id: '6665', name: 'Jak\'Sho, o Inconstante', timing: '23 min', note: 'Resistências escaláveis.' }
      ];
    } else if (primaryTag === 'Support') {
      role = 'Support';
      damageType = 'Utilidade / Suporte';
      spells = ['Flash', 'Curar'];
      runeTemplate = 'AERY_ENCHANTER';
      coreItems = [
        { id: '6617', name: 'Renovador de Pedra Lunar', timing: '12 min', note: 'Amplifica curas e escudos.' },
        { id: '3158', name: 'Botas Ionianas da Lucidez', timing: '9 min', note: 'Redução de recarga.' },
        { id: '3107', name: 'Redenção', timing: '18 min', note: 'Cura em área à distância.' },
        { id: '3190', name: 'Medalhão dos Solari de Ferro', timing: '22 min', note: 'Escudo para toda a equipe.' }
      ];
    }

    base = {
      id: championId,
      name: ddragonChampData?.name || championId,
      title: ddragonChampData?.title || 'Campeão de Runeterra',
      tags,
      role,
      tier: 'S',
      winRate: '51.4%',
      pickRate: '8.2%',
      banRate: '5.4%',
      difficulty: 'Média',
      damageType,
      spells,
      skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'Q', 'W', 'R', 'W', 'W', 'E', 'E', 'R', 'E', 'E'],
      skillPriority: 'Q > W > E',
      runes: RUNE_TEMPLATES[runeTemplate],
      coreItems,
      situationalItems: [
        { id: '3157', name: 'Ampulheta de Zhonya / Dança da Morte', vs: 'Dano Explosivo' },
        { id: '3156', name: 'Mandíbula de Malmortius / Força da Natureza', vs: 'Magos AP' }
      ],
      counters: DIRECT_COUNTERS_AGAINST_ENEMY[championId] || ['Darius', 'Ahri', 'Vex', 'Lulu'],
      goodAgainst: ['Sion', 'Veigar', 'Ashe', 'Lux'],
      coachTips: {
        early: 'Foque em farmar com consistência e troque apenas quando o oponente gastar habilidades na onda.',
        mid: 'Empurre as rotas laterais antes dos objetivos neutros (Dragão e Vastilarvas) nascerem.',
        late: 'Agrupe com seu time e jogue em torno dos tempos de recarga da sua Ultimate.'
      }
    };
  }

  const { enemyCompAnalysis, builds } = buildThreeOptionsForChampion(
    championId,
    base,
    ddragonChampData,
    enemyTeamIds,
    ddragonChampions,
    ddragonItems
  );

  return {
    ...base,
    coreItems: builds[0].items,
    starterPack: builds[0].starterPack,
    enemyCompAnalysis,
    builds
  };
}

module.exports = {
  RUNE_TEMPLATES,
  STARTER_PACKS,
  ITEM_BUILD_RECIPE_GUIDE,
  CURATED_CHAMPIONS,
  getTop6MetaPicks,
  analyzeEnemyComposition,
  getChampionGuide
};
