// Anmeldung – Ablehnung: dieselbe Meldung bei falscher Kennung und falscher PIN; nur die Sperrung wird gemeldet.
const v = $('PIN überprüfen').first().json;
return [{ json: { erreur: v.motif === 'verrouille' ? 'verrouille' : 'identifiants' } }];