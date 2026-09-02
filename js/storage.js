// STORAGE — Supabase compartido
// ============================================================
const LEGACY_CLUB_ID = 'club-fulbito-sabado';
const LEGACY_CLUB = { id: LEGACY_CLUB_ID, name: 'Fulbito del Sábado', crest: null, inviteCode: 'SABADO' };

function safeClubCrestUrl(value) {
  const src = String(value || '');
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(src) && src.length <= 260000 ? src : '';
}

function safeClubCrestDesign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowedKeys = ['version', 'shape', 'pattern', 'primary', 'secondary', 'accent', 'border', 'finish', 'emblem', 'initials', 'year', 'stars', 'emblemScale', 'emblemY', 'plate'];
  const clean = {};
  for (const key of allowedKeys) {
    const item = value[key];
    if (typeof item === 'string') clean[key] = safePlainText(item, 24);
    else if (typeof item === 'number' && Number.isFinite(item)) clean[key] = item;
    else if (typeof item === 'boolean') clean[key] = item;
  }
  try { return JSON.stringify(clean).length <= 3000 ? clean : null; } catch (_) { return null; }
}

function sameClubCrestDesign(first, second) {
  try {
    return JSON.stringify(safeClubCrestDesign(first)) === JSON.stringify(safeClubCrestDesign(second));
  } catch (_) {
    return false;
  }
}

function hasClubBrandField(value, field) {
  return !!value && Object.prototype.hasOwnProperty.call(value, field);
}

function clubInitials(name) {
  const words = safePlainText(name, 50).trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(word => word[0]).join('') || 'FC').toUpperCase();
}

function mapClubBrand(data, fallback = {}) {
  const weekdaySource = hasClubBrandField(data, 'match_weekday') ? data.match_weekday : fallback.matchWeekday;
  const timeSource = hasClubBrandField(data, 'match_time') ? data.match_time : fallback.matchTime;
  const venueSource = hasClubBrandField(data, 'match_venue') ? data.match_venue : fallback.matchVenue;
  const addressSource = hasClubBrandField(data, 'match_address') ? data.match_address : fallback.matchAddress;
  const inviteSource = hasClubBrandField(data, 'invite_code') ? data.invite_code : fallback.inviteCode;
  const weekday = weekdaySource === null || weekdaySource === undefined || weekdaySource === '' ? NaN : Number(weekdaySource);
  const matchWeekday = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null;
  const matchTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeSource ?? ''))
    ? String(timeSource).slice(0, 5)
    : null;
  const matchVenue = safePlainText(venueSource ?? '', 80).trim();
  const matchAddress = safePlainText(addressSource ?? '', 140).trim();
  // Un null explícito del servidor significa "borrar". Sólo se usa el fallback
  // cuando el campo no vino en la respuesta (por ejemplo, listados públicos).
  const crest = hasClubBrandField(data, 'crest') ? data.crest : fallback.crest;
  const crestDesign = hasClubBrandField(data, 'crest_design') ? data.crest_design : fallback.crestDesign;
  return {
    ...fallback,
    id: String(data?.id || fallback.id || ''),
    name: safePlainText(data?.name || fallback.name || 'Mi club', 50) || 'Mi club',
    crest: safeClubCrestUrl(crest),
    crestDesign: safeClubCrestDesign(crestDesign),
    inviteCode: inviteSource ? safePlainText(inviteSource, 24) : null,
    matchWeekday,
    matchTime,
    matchVenue: matchVenue || null,
    matchAddress: matchAddress || null
  };
}

async function loadClubBrand(clubId = state.currentClub?.id) {
  if (!clubId) return null;
  try {
    const data = await callRpc('fulbito_get_club_brand', { p_club_id: clubId });
    return data ? mapClubBrand(data, state.currentClub || { id: clubId }) : null;
  } catch (error) {
    console.error('loadClubBrand:', error);
    return null;
  }
}

async function saveClubBrand(name, crest, crestDesign = null) {
  if (!state.currentClub?.id) throw new Error('No hay club seleccionado');
  const params = { p_club_id: state.currentClub.id, p_name: name, p_crest: crest || null, p_crest_design: safeClubCrestDesign(crestDesign) };
  let data;
  try {
    data = await callRpc('fulbito_update_club_brand', params);
  } catch (error) {
    // Compatibilidad durante el despliegue: la migración agrega el cuarto
    // parámetro sin dejar fuera de servicio el guardado de identidad actual.
    if (!/p_crest_design|schema cache|could not find|PGRST202/i.test(error?.message || '')) throw error;
    if (safeClubCrestDesign(crestDesign)) {
      throw new Error('Crest Studio todavía no está habilitado en el servidor. Actualizá la base antes de aplicar este escudo.');
    }
    const { p_crest_design, ...legacyParams } = params;
    data = await callRpc('fulbito_update_club_brand', legacyParams);
  }
  return mapClubBrand(data, state.currentClub);
}

async function updateClubInviteCode(inviteCode) {
  if (!state.currentClub?.id) throw new Error('No hay club seleccionado');
  const data = await callRpc('fulbito_update_club_invite_code', {
    p_club_id: state.currentClub.id,
    p_invite_code: inviteCode
  });
  return mapClubBrand(data, state.currentClub);
}

async function saveClubMatchSchedule(matchWeekday, matchTime, matchVenue, matchAddress) {
  if (!state.currentClub?.id) throw new Error('No hay club seleccionado');
  const data = await callRpc('fulbito_update_club_match_schedule', {
    p_club_id: state.currentClub.id,
    p_match_weekday: matchWeekday,
    p_match_time: matchTime || null,
    p_match_venue: matchVenue || null,
    p_match_address: matchAddress || null
  });
  return mapClubBrand(data, state.currentClub);
}

const KNOWN_CLUBS = {
  key: 'fulbito_known_clubs',
  get() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.key) || '[]');
      if (!Array.isArray(stored)) return [];
      const unique = new Set();
      return stored.filter(club => {
        const id = safePlainText(club?.id, 90);
        if (!id || unique.has(id)) return false;
        unique.add(id);
        return true;
      }).slice(0, 8).map(club => ({
        id: safePlainText(club.id, 90),
        name: safePlainText(club.name, 50) || 'Mi club',
        crest: safeClubCrestUrl(club.crest),
        inviteCode: null
      }));
    } catch (_) { return []; }
  },
  remember(club) {
    const id = safePlainText(club?.id, 90);
    if (!id) return;
    const entry = {
      id,
      name: safePlainText(club.name, 50) || 'Mi club',
      crest: safeClubCrestUrl(club.crest)
    };
    const next = [entry, ...this.get().filter(item => item.id !== id)].slice(0, 8);
    try { localStorage.setItem(this.key, JSON.stringify(next)); } catch (_) {}
  }
};

async function loadClubs() {
  const known = KNOWN_CLUBS.get();
  try {
    const data = await callRpc('fulbito_list_clubs');
    if (!Array.isArray(data)) throw new Error('Respuesta inválida');
    const remote = data.map(club => mapClubBrand(club)).filter(club => club.id);
    return remote.length ? remote : known;
  } catch (error) {
    console.error('loadClubs:', error);
    return known;
  }
}

async function loadPlayers(clubId = state.currentClub?.id) {
  if (!clubId) return [];
  try {
    const data = await callRpc('fulbito_get_players', { p_club_id: clubId });
    return mapPlayers(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('loadPlayers error:', error);
    return [];
  }
}

function mapPlayers(data) {
  return data.map(row => ({
    id: String(row.id || '').replace(/[^a-zA-Z0-9_-]/g, ''),
    username: safePlainText(row.username, 32),
    name: safePlainText(row.name, 48),
    photo: safePhotoUrl(row.photo),
    posPrimary: row.pos_primary,
    posSecondary: row.pos_secondary,
    ratingMode: row.rating_mode === 'goalkeeper' ? 'goalkeeper' : 'field',
    isAdmin: row.is_admin,
    attendance: row.attendance,
    ratings: row.ratings || {},
    _resetRequested: row._reset_requested || false,
    clubId: row.club_id
  }));
}

async function savePlayers(players) {
  // Not used directly — individual upserts are used instead
}

async function upsertPlayer(p) {
  const clubId = p.clubId || state.currentClub?.id;
  if (!clubId) {
    console.error('upsertPlayer: no club selected');
    return false;
  }
  try {
    const data = await callRpc('fulbito_update_my_profile', {
      p_club_id: clubId,
      p_name: p.name,
      p_username: p.username,
      p_pos_primary: p.posPrimary,
      p_pos_secondary: p.posSecondary,
      p_rating_mode: p.ratingMode || 'field',
      p_photo: p.photo || null
    });
    const saved = mapPlayers([data])[0];
    Object.assign(p, saved);
    return true;
  } catch (error) {
    console.error('upsertPlayer:', error);
    showToast(`❌ ${error.message}`);
    return false;
  }
}

async function deletePlayer(id) {
  if (!state.currentClub?.id) return;
  await callRpc('fulbito_delete_player', { p_club_id: state.currentClub.id, p_player_id: id });
  return true;
}

async function deletePlatformClub(clubId) {
  return callRpc('fulbito_platform_delete_club', { p_club_id: clubId });
}

async function adminSetPlayerPassword(id, newPassword) {
  if (!state.currentClub?.id) return;
  await callRpc('fulbito_admin_set_player_password', {
    p_club_id: state.currentClub.id,
    p_player_id: id,
    p_new_password: newPassword
  });
  return true;
}

// ============================================================
// MATCHES — Supabase (tabla fulbito_matches)
// ============================================================
let matches = [];

function sortMatches() {
  matches.sort((a,b) =>
    (b.match_date||'').localeCompare(a.match_date||'') ||
    (b.created_at||'').localeCompare(a.created_at||'')
  );
}

async function loadMatches(clubId = state.currentClub?.id) {
  if (!clubId) return [];
  try {
    const data = await callRpc('fulbito_get_matches', { p_club_id: clubId });
    const list = Array.isArray(data) ? data : [];
    list.sort((a,b) =>
      (b.match_date||'').localeCompare(a.match_date||'') ||
      (b.created_at||'').localeCompare(a.created_at||'')
    );
    return list;
  } catch (error) {
    console.error('loadMatches:', error);
    return [];
  }
}

async function upsertMatch(m) {
  const clubId = m.clubId || m.club_id || state.currentClub?.id;
  if (!clubId) {
    console.error('upsertMatch: no club selected');
    return;
  }
  try {
    const saved = await callRpc('fulbito_upsert_match', { p_club_id: clubId, p_match: {
      id: m.id,
      match_date: m.match_date,
      teams: m.teams,
      result: m.result || null
    }});
    if (saved && saved.result && typeof saved.result === 'object') m.result = saved.result;
    return true;
  } catch (error) {
    console.error('upsertMatch:', error);
    showToast(`❌ ${error.message}`, 3500);
    return false;
  }
}

async function deleteMatchDb(id) {
  if (!state.currentClub?.id) return;
  await callRpc('fulbito_delete_match', { p_club_id: state.currentClub.id, p_match_id: id });
}

// Session sigue local (es personal)
const SESSION = {
  get() { try { return JSON.parse(localStorage.getItem('fulbito_session')||'null') } catch{return null} },
  set(v) { localStorage.setItem('fulbito_session', JSON.stringify(v)) },
  del() { localStorage.removeItem('fulbito_session') }
};

// ============================================================
