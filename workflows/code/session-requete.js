// Contrôle de session – la session est valide : on rend aux nœuds suivants la requête d'origine (en-têtes, corps) telle que reçue.
return [{ json: $('__WEBHOOK__').first().json }];