// Mode A – contrôle de la demande {action, chambre} (« Vérifier le document » a son point d'entrée : 77-maitre-verifier). Aucun texte libre n'existe dans ce mode :
// l'action choisit un prompt caché (prompts/*.md), la chambre choisit le résident.
const e = $input.first().json?.body ?? {};
const PROMPT_PAR_ACTION = {
  rapport_garde: 'generer_sbar',
  resume_epa: 'resume_epa',
  points_vigilance: 'points_vigilance',
};
const action = String(e.action ?? '');
if (!Object.prototype.hasOwnProperty.call(PROMPT_PAR_ACTION, action)) throw new Error(`Action inconnue : « ${action} »`);
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Chambre invalide : « ${chambre} »`);
return [{ json: { action, chambre, prompt_id: PROMPT_PAR_ACTION[action] } }];
