# Dernière démonstration (nuit fictive)

*Généré par `node scripts/demo-nuit.mjs` le 2026-10-27 13:09 ; compte : arsene. Ne pas modifier à la main.*

Durée totale : 6.4 minutes.

| Vérification | Résultat | Détail |
|---|---|---|
| connecté : Arsène (compte de test) | OK | 0.4 s |
| l'alarme apparaît dans l'interface | OK | 0.8 s (cible : moins de 5 s ; inclut ~1 s de commande docker) |
| l'index du RAG (Qdrant) est mis à jour : l'alarme y est ajoutée | OK | 0.0 s après l'affichage ; « Alarme de capteur (chute) le 27.10. à 14h02, chambre 12. » [Capteurs], résident PAT-003, 95 points dans « patients » |
| la lettre est reçue dans la boîte | OK | HTTP 200 |
| n8n lit la lettre (OCR), identifie le résident et crée une alerte « à vérifier » | OK | 25.4 s |
| la lettre est rattachée à un Müller (nom + date de naissance), jamais devinée | OK | M. Heinz Müller (chambre 21) |
| un brouillon est produit | OK | 235.4 s |
| la réponse est produite | OK | 111.3 s |
| la consigne est refusée | OK | motif : regles, 1.1 s |
| aucun brouillon n'a été créé (l'IA n'a pas été sollicitée) | OK |  |
| le rapport est validé et enregistré | OK | 3.0 s |
| la signature enregistrée est celle du compte connecté (le nom envoyé par la page est ignoré) | OK | arsene / Arsène (compte de test) |
| phrases sans source : 0 sur 8 lignes | OK |  |
