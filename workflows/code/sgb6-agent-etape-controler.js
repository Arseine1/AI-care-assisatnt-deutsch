// Cotisations retraite, agent – étape 3 : contrôler les champs (champs obligatoires, dates, numéro d'assurance et son chiffre de contrôle).
// Étapes 3 à 7 : TOUT est fait par le moteur regles.js (recopié plus haut), une étape par nœud ; le journal et l'avancement sont écrits après chacune.
// Rythme d'affichage : une courte pause avant chaque étape pour que la page montre l'agent avancer (l'interface interroge n8n chaque seconde).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const texte = $('Dossier').first().json.questionnaire;
const id = $('Entrée').first().json.dossier_id;
const x = $($('Entrée').first().json.lecture_ia === true ? "Lire la réponse de l'IA" : 'Extraction par règles').first().json;
const etat = etapeControler(demarrerTraitement(texte, { annee: new Date().getFullYear(), id, lu: x.lu }));
return [{ json: { fait: 3, etat, journal: etat.journal.at(-1) } }];