// Contrôle de session – refus : aucune donnée, seulement le motif. L'interface rouvre alors la page de connexion.
return [{ json: { erreur: 'session' } }];