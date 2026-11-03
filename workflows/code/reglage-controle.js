// Réglage de l'analyse complémentaire par l'IA (« Vérifier le document ») : { valeur: true|false } pour l'écrire,
// { } pour la lire. Une seule clé existe, aucune autre ne peut être créée par cette porte.
const e = $input.first().json?.body ?? {};
const cle = 'verification_ia';
let valeur = '';
if (e.valeur !== undefined) {
  if (typeof e.valeur !== 'boolean') throw new Error('valeur : true ou false attendu');
  valeur = String(e.valeur);
}
return [{ json: { cle, valeur } }];