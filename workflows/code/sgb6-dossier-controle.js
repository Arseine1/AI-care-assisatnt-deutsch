// Cotisations retraite – dernier résultat d'un dossier : { id }.
const id = String($input.first().json?.body?.id ?? '');
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error('id de dossier invalide');
return [{ json: { id } }];