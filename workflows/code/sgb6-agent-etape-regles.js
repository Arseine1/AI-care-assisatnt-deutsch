// Cotisations retraite, agent – étape 5 : vérifier les règles R1 à R6 et les écarts entre le questionnaire et le dossier de la caisse.
// Rythme d'affichage : une courte pause avant chaque étape pour que la page montre l'agent avancer (l'interface interroge n8n chaque seconde).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeRegles($('Lire le dossier de la caisse').first().json.etat);
return [{ json: { fait: 5, etat, journal: etat.journal.at(-1) } }];