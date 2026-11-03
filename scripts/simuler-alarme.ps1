# Simuliert den Alarm eines Sensors (MQTT): veröffentlicht auf dem Thema capteurs/chambre{n}/{type} des Mosquitto im docker-compose.
# Aufruf: .\scripts\simuler-alarme.ps1 -Chambre 12 -Type sortie_lit        (Type: chute, sortie_lit oder appel)
# Der Broker lehnt anonyme Verbindungen ab: Das Skript liest das Konto „capteurs“ aus der Datei .env
# (MQTT_UTILISATEUR_CAPTEURS und MQTT_MOT_DE_PASSE_CAPTEURS, erstellt von `node scripts/generer-secrets.mjs`).
# Verwendet mosquitto_pub, falls installiert (Port 1884 des Rechners), sonst das des Containers (nichts zu installieren).
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{1,3}$')][string]$Chambre,
  [Parameter(Mandatory = $true)][ValidateSet('chute', 'sortie_lit', 'appel')][string]$Type
)
$ErrorActionPreference = 'Stop'
$env_ = @{}
Get-Content (Join-Path $PSScriptRoot '..\.env') | ForEach-Object { if ($_ -match '^([A-Z0-9_]+)=(.*)$') { $env_[$Matches[1]] = $Matches[2].Trim() } }
$utilisateur = $env_['MQTT_UTILISATEUR_CAPTEURS']
$motDePasse = $env_['MQTT_MOT_DE_PASSE_CAPTEURS']
if (-not $utilisateur -or -not $motDePasse -or $motDePasse -eq 'TA-CLE') { throw "MQTT-Konto fehlt in der Datei .env: zuerst `node scripts/generer-secrets.mjs` ausführen." }
$sujet = "capteurs/chambre$Chambre/$Type"
# Der Inhalt der Nachricht wird von n8n nie gelesen: Nur das Thema zählt.
$message = '{"capteur":"simulation"}'
if (Get-Command mosquitto_pub -ErrorAction SilentlyContinue) {
  mosquitto_pub -h localhost -p 1884 -u $utilisateur -P $motDePasse -t $sujet -m $message
} else {
  Push-Location (Join-Path $PSScriptRoot '..\compose')
  try { docker compose exec -T mosquitto mosquitto_pub -h localhost -u $utilisateur -P $motDePasse -t $sujet -m $message } finally { Pop-Location }
}
Write-Output "Alarm veröffentlicht: $sujet"