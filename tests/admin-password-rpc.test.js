const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase-security.sql'), 'utf8');
const pgcryptoFix = fs.readFileSync(path.join(root, 'supabase-pgcrypto-path-fix.sql'), 'utf8');
const clientSources = [
  ...fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).map(name => path.join(root, 'js', name)),
  ...fs.readdirSync(path.join(root, 'js', 'tabs')).filter(name => name.endsWith('.js')).map(name => path.join(root, 'js', 'tabs', name))
].map(file => fs.readFileSync(file, 'utf8')).join('\n');

assert.doesNotMatch(clientSources, /fulbito_admin_reset_player/,
  'ningún cliente debe conservar el reseteo a contraseña fija');
assert.match(clientSources, /callRpc\(['"]fulbito_admin_set_player_password['"]/,
  'el cliente debe usar exclusivamente el RPC de contraseña elegida');

assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.fulbito_admin_reset_player\s*\(/i);
assert.match(sql, /drop\s+function\s+if\s+exists\s+public\.fulbito_admin_reset_player\s*\(text,\s*text\)\s*;/i,
  'la migración canónica debe retirar instalaciones anteriores sin CASCADE');
assert.doesNotMatch(sql, /(?:grant|revoke)[^;]*fulbito_admin_reset_player/i,
  'no deben quedar permisos sobre una función retirada');

assert.match(sql, /create\s+or\s+replace\s+function\s+public\.fulbito_admin_set_player_password\s*\(\s*p_club_id\s+text,\s*p_player_id\s+text,\s*p_new_password\s+text\s*\)/i);
assert.match(sql, /char_length\(coalesce\(p_new_password,\s*''\)\)\s+not\s+between\s+6\s+and\s+128/i,
  'el reemplazo debe conservar la validación de longitud');
assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.fulbito_admin_set_player_password\(text,\s*text,\s*text\)\s+to\s+authenticated/i);

assert.doesNotMatch(pgcryptoFix, /alter\s+function\s+public\.fulbito_admin_reset_player/i,
  'la migración auxiliar tampoco debe depender del RPC retirado');
assert.match(pgcryptoFix, /alter\s+function\s+public\.fulbito_admin_set_player_password\(text,\s*text,\s*text\)/i,
  'la migración auxiliar debe apuntar al reemplazo seguro');
assert.match(pgcryptoFix, /fulbito_register_player\((?:text,\s*){7}text\)/i,
  'la firma auxiliar de registro debe mantenerse alineada con la migración canónica');
assert.match(pgcryptoFix, /fulbito_update_my_profile\((?:text,\s*){8}text\)/i,
  'la firma auxiliar de perfil debe mantenerse alineada con la migración canónica');

console.log('PASS admin-password-rpc');
