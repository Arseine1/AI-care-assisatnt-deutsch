// Mode B – paramètres de « chercher » : prompt « consigne_guidee » ; la consigne (DÉJÀ contrôlée) sert de requête de recherche.
const PROMPTS = __PROMPTS__;
const c = $('Contrôler la consigne').first().json;
if (c.accepte !== true) throw new Error('Consigne non acceptée : le traitement ne peut pas continuer.');
const p = PROMPTS.consigne_guidee;
return [{ json: { patient_id: c.patient_id, prompt_id: 'consigne_guidee', heures: p.heures, requete: c.consigne, protocoles: p.protocoles, rapports_valides: p.rapports_valides === true, filtrer_requete: true, max_faits: p.max_faits, sources_prioritaires: p.sources_prioritaires } }];
