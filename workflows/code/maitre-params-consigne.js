// Modus B – Parameter von « Suchen »: Prompt « consigne_guidee »; die (BEREITS geprüfte) Anweisung dient als Suchanfrage.
const PROMPTS = __PROMPTS__;
const c = $('Anweisung prüfen').first().json;
if (c.accepte !== true) throw new Error('Anweisung nicht akzeptiert: Die Verarbeitung kann nicht fortgesetzt werden.');
const p = PROMPTS.consigne_guidee;
return [{ json: { patient_id: c.patient_id, prompt_id: 'consigne_guidee', heures: p.heures, requete: c.consigne, protocoles: p.protocoles, rapports_valides: p.rapports_valides === true, filtrer_requete: true, max_faits: p.max_faits, sources_prioritaires: p.sources_prioritaires } }];
