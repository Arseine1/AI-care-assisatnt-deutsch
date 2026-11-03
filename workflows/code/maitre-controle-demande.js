// Modus A – Prüfung der Anfrage {action, chambre} (« Dokument prüfen » hat seinen eigenen Einstiegspunkt: 77-maitre-verifier). In diesem Modus gibt es keinen Freitext:
// Die Aktion wählt einen verborgenen Prompt (prompts/*.md), das Zimmer wählt den Bewohner.
const e = $input.first().json?.body ?? {};
const PROMPT_PAR_ACTION = {
  rapport_garde: 'generer_sbar',
  resume_epa: 'resume_epa',
  points_vigilance: 'points_vigilance',
};
const action = String(e.action ?? '');
if (!Object.prototype.hasOwnProperty.call(PROMPT_PAR_ACTION, action)) throw new Error(`Unbekannte Aktion: „${action}“`);
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Ungültiges Zimmer: „${chambre}“`);
return [{ json: { action, chambre, prompt_id: PROMPT_PAR_ACTION[action] } }];
