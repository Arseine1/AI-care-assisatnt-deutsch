// Session – « qui suis-je » : le soignant de la session en cours (l'interface s'en sert au rechargement de la page).
return [{ json: { soignant: $('Session').first().json.soignant } }];