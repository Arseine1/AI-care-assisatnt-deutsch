// Mode B – contrôle de la chambre (le texte de la consigne est contrôlé juste après, dans « Contrôler la consigne »).
const e = $input.first().json?.body ?? {};
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Chambre invalide : « ${chambre} »`);
return [{ json: { chambre } }];
