// Cotisations retraite, agent – étape 6 : calculer (§ 166 Abs. 2 SGB VI). Valeurs lues par l'IA : aucun montant tant que quelque chose reste à vérifier.
// Rythme d'affichage : une courte pause avant chaque étape pour que la page montre l'agent avancer (l'interface interroge n8n chaque seconde).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeCalculer($('Vérifier les règles').first().json.etat);
return [{ json: { fait: 6, etat, journal: etat.journal.at(-1) } }];