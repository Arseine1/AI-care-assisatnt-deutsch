// Vérifier le document – contrôle de la demande {chambre}. Aucun texte libre : seule la chambre est lue, l'action est fixée ici.
const e = $input.first().json?.body ?? {};
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Chambre invalide : « ${chambre} »`);
// ref (facultatif) : le courrier précis à vérifier (kim/<expéditeur>/<fichier>) ; sans lui, le plus récent en attente.
const ref = e.ref === undefined ? '' : String(e.ref);
if (ref && !/^kim\/[^\s]{1,200}$/.test(ref)) throw new Error('ref invalide');
return [{ json: { action: 'verifier_document', chambre, prompt_id: 'comparer', verification: true, ref } }];