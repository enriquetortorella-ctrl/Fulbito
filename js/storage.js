// STORAGE — Supabase compartido
// ============================================================
const LEGACY_CLUB_ID = 'club-fulbito-sabado';
const LEGACY_CLUB = { id: LEGACY_CLUB_ID, name: 'Fulbito del Sábado', crest: null, inviteCode: 'SABADO' };

function safeClubCrestUrl(value) {
  const src = String(value || '');
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(src) && src.length <= 260000 ? src : '';
}

function clubInitials(name) {
  const words = safePlainText(name, 50).trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(word => word[0]).join('') || 'FC').toUpperCase();
}

function mapClubBrand(data, fallback = {}) {
  return {
    ...fallback,
    id: String(data?.id || fallback.id || ''),
    name: safePlainText(data?.name || fallback.name || 'Mi club', 50) || 'Mi club',
    crest: safeClubCrestUrl(data?.crest || fallback.crest),
    inviteCode: data?.invite_code ? safePlainText(data.invite_code, 24) : (fallback.inviteCode || null)
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

async function saveClubBrand(name, crest) {
  if (!state.currentClub?.id) throw new Error('No hay club seleccionado');
  const data = await callRpc('fulbito_update_club_brand', {
    p_club_id: state.currentClub.id,
    p_name: name,
    p_crest: crest || null
  });
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

async function loadClubs() {
  // Los demás clubes no se enumeran: se ingresa con código de invitación.
  const knownClubs = state.clubs.filter(club => club.id !== LEGACY_CLUB_ID);
  return [LEGACY_CLUB, ...knownClubs];
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
    await callRpc('fulbito_upsert_match', { p_club_id: clubId, p_match: {
      id: m.id,
      match_date: m.match_date,
      teams: m.teams,
      result: m.result || null
    }});
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
