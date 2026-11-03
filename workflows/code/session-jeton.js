// Contrôle de session – le jeton « Bearer » de l'en-tête Authorization (43 caractères URL-safe) est haché (SHA-256) : seul le haché est en base.
const entetes = $input.first().json?.headers ?? {};
const m = String(entetes.authorization ?? '').match(/^Bearer ([A-Za-z0-9_-]{43})$/);
if (!m) return [{ json: { hash: '' } }];
return [{ json: { hash: require('crypto').createHash('sha256').update(m[1]).digest('hex') } }];