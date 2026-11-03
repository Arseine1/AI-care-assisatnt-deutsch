#!/usr/bin/env bash
# Simuliert den Alarm eines Sensors (MQTT): veröffentlicht auf dem Thema capteurs/chambre{n}/{type} des Mosquitto im docker-compose.
# Aufruf: scripts/simuler-alarme.sh <Zimmer> <chute|sortie_lit|appel>
#   z. B.: scripts/simuler-alarme.sh 12 sortie_lit
# Der Broker lehnt anonyme Verbindungen ab: Das Skript liest das Konto „capteurs“ aus der Datei .env
# (erstellt von `node scripts/generer-secrets.mjs`). Verwendet mosquitto_pub, falls installiert (Port 1884 des Rechners), sonst das des Containers.
set -euo pipefail
chambre="${1:?Zimmer fehlt (z. B. 12)}"
type="${2:?Typ fehlt: chute, sortie_lit oder appel}"
racine="$(cd "$(dirname "$0")/.." && pwd)"
lire() { grep -E "^$1=" "$racine/.env" | head -n1 | cut -d= -f2- | tr -d '\r'; }
utilisateur="$(lire MQTT_UTILISATEUR_CAPTEURS)"
mot_de_passe="$(lire MQTT_MOT_DE_PASSE_CAPTEURS)"
if [ -z "$utilisateur" ] || [ -z "$mot_de_passe" ] || [ "$mot_de_passe" = "TA-CLE" ]; then
  echo "MQTT-Konto fehlt in der Datei .env: zuerst „node scripts/generer-secrets.mjs“ ausführen." >&2
  exit 1
fi
sujet="capteurs/chambre${chambre}/${type}"
# Der Inhalt der Nachricht wird von n8n nie gelesen: Nur das Thema zählt.
message='{"capteur":"simulation"}'
if command -v mosquitto_pub >/dev/null 2>&1; then
  mosquitto_pub -h localhost -p 1884 -u "$utilisateur" -P "$mot_de_passe" -t "$sujet" -m "$message"
else
  (cd "$racine/compose" && docker compose exec -T mosquitto mosquitto_pub -h localhost -u "$utilisateur" -P "$mot_de_passe" -t "$sujet" -m "$message")
fi
echo "Alarm veröffentlicht: $sujet"