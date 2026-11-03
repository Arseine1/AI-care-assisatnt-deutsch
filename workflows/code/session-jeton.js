// Sitzungsprüfung – das « Bearer »-Token im Authorization-Header (43 URL-sichere Zeichen) wird gehasht (SHA-256): Nur der Hash steht in der Datenbank.
const entetes = $input.first().json?.headers ?? {};
const m = String(entetes.authorization ?? '').match(/^Bearer ([A-Za-z0-9_-]{43})$/);
if (!m) return [{ json: { hash: '' } }];
return [{ json: { hash: require('crypto').createHash('sha256').update(m[1]).digest('hex') } }];