// Cotisations retraite, agent – étape 4 : lire le dossier de la caisse (simulée) et l'expertise du Medizinischer Dienst.
const CAISSE = __CAISSE__;
// Rythme d'affichage : une courte pause avant chaque étape pour que la page montre l'agent avancer (l'interface interroge n8n chaque seconde).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeCaisse($('Contrôler les champs').first().json.etat, CAISSE);
return [{ json: { fait: 4, etat, journal: etat.journal.at(-1) } }];