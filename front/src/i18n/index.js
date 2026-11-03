import de from './de.json';

// Aktive Sprache. Weitere Sprachen kommen als zusätzliche JSON-Dateien mit denselben Schlüsseln hinzu.
const langues = { de };
const langueActive = 'de';

// t('app.titre') -> Text ; die {Variablen} werden über das 2. Argument ersetzt.
export function t(cle, variables = {}) {
  const texte = cle.split('.').reduce((noeud, partie) => noeud?.[partie], langues[langueActive]);
  if (typeof texte !== 'string') return cle;
  return texte.replace(/\{(\w+)\}/g, (_, nom) => variables[nom] ?? `{${nom}}`);
}
