#!/usr/bin/env bash
# Simule l'alarme d'un capteur (MQTT) : publie sur le sujet capteurs/chambre{n}/{type} du Mosquitto du docker-compose.
# Usage : scripts/simuler-alarme.sh <chambre> <chute|sortie_lit|appel>
#   ex. : scripts/simuler-alarme.sh 12 sortie_lit
# Le broker refuse les connexions anonymes : le script lit le compte « capteurs » dans le fichier .env
# (créé par `node scripts/generer-secrets.mjs`). Utilise mosquitto_pub s'il est installé (port 1884 du poste), sinon celui du conteneur.
set -euo pipefail
chambre="${1:?chambre manquante (ex. 12)}"
type="${2:?type manquant : chute, sortie_lit ou appel}"
racine="$(cd "$(dirname "$0")/.." && pwd)"
lire() { grep -E "^$1=" "$racine/.env" | head -n1 | cut -d= -f2- | tr -d '\r'; }
utilisateur="$(lire MQTT_UTILISATEUR_CAPTEURS)"
mot_de_passe="$(lire MQTT_MOT_DE_PASSE_CAPTEURS)"
if [ -z "$utilisateur" ] || [ -z "$mot_de_passe" ] || [ "$mot_de_passe" = "TA-CLE" ]; then
  echo "Compte MQTT absent du fichier .env : lancer d'abord « node scripts/generer-secrets.mjs »." >&2
  exit 1
fi
sujet="capteurs/chambre${chambre}/${type}"
# Le contenu du message n'est jamais lu par n8n : seul le sujet compte.
message='{"capteur":"simulation"}'
if command -v mosquitto_pub >/dev/null 2>&1; then
  mosquitto_pub -h localhost -p 1884 -u "$utilisateur" -P "$mot_de_passe" -t "$sujet" -m "$message"
else
  (cd "$racine/compose" && docker compose exec -T mosquitto mosquitto_pub -h localhost -u "$utilisateur" -P "$mot_de_passe" -t "$sujet" -m "$message")
fi
echo "Alarme publiée : $sujet"