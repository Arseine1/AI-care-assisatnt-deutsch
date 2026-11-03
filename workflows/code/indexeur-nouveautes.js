// Indexeur – anti-doublon : on ne garde que les morceaux dont l'empreinte SHA-256 n'est pas déjà au journal.
// Un morceau inchangé n'est ni vectorisé ni renvoyé à Qdrant ; un morceau modifié a une nouvelle empreinte
// et remplace le point existant (même identifiant stable).
const morceaux = $('Découper et hacher').all().filter((m) => m.json.payload);
const connus = new Set($('Déjà importés').all().map((i) => `${i.json.source}|${i.json.empreinte}`));

const nouveaux = morceaux.filter((m) => !connus.has(`${m.json.payload.source}|${m.json.payload.empreinte}`));

// Toujours au moins un élément : le marqueur « rien » est aiguillé vers la branche « Rien de nouveau ».
if (nouveaux.length === 0) return [{ json: { rien: true, total: morceaux.length } }];
return nouveaux;
