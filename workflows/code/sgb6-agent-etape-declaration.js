// Cotisations retraite, agent – étape 7 : préparer le brouillon de déclaration (les 8 données du § 44 Abs. 3 SGB XI).
// Rythme d'affichage : une courte pause avant chaque étape pour que la page montre l'agent avancer (l'interface interroge n8n chaque seconde).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeDeclaration($('Calculer la cotisation').first().json.etat);
return [{ json: { fait: 7, etat, journal: etat.journal.at(-1) } }];