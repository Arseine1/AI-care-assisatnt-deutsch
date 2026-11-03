// Rentenbeiträge – den Agenten starten: { id, lecture_ia, pilote, modele }. Kein freier Text: eine Aktenkennung, ein Boolean und der Steuerer
// (« modele » = von einem lokalen Modell gesteuert; « guidee » = vom Code geführte Mission, Standard).
const e = $input.first().json?.body ?? {};
const id = String(e.id ?? '');
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error('Ungültige Akten-ID');
const pilote = e.pilote === undefined ? 'guidee' : String(e.pilote);
if (!['modele', 'guidee'].includes(pilote)) throw new Error('Ungültige Steuerung');
// modele : das lokale Modell, das den Agenten steuert, auf der Seite gewählt. GESCHLOSSENE Liste (nie ein freier Name: Er geht in eine Anfrage an Ollama).
const PERMIS = __SGB6_MODELES__;
const modele = e.modele === undefined || e.modele === '' ? __SGB6_MODELE__ : String(e.modele);
if (!PERMIS.includes(modele)) throw new Error(`Modell nicht zulässig: ${modele.slice(0, 40)}`);
return [{ json: { id, lecture_ia: e.lecture_ia === true, pilote, modele } }];
