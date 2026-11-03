# Simule l'alarme d'un capteur (MQTT) : publie sur le sujet capteurs/chambre{n}/{type} du Mosquitto du docker-compose.
# Usage : .\scripts\simuler-alarme.ps1 -Chambre 12 -Type sortie_lit        (Type : chute, sortie_lit ou appel)
# Le broker refuse les connexions anonymes : le script lit le compte « capteurs » dans le fichier .env
# (MQTT_UTILISATEUR_CAPTEURS et MQTT_MOT_DE_PASSE_CAPTEURS, créés par `node scripts/generer-secrets.mjs`).
# Utilise mosquitto_pub s'il est installé (port 1884 du poste), sinon celui du conteneur (rien à installer).
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{1,3}$')][string]$Chambre,
  [Parameter(Mandatory = $true)][ValidateSet('chute', 'sortie_lit', 'appel')][string]$Type
)
$ErrorActionPreference = 'Stop'
$env_ = @{}
Get-Content (Join-Path $PSScriptRoot '..\.env') | ForEach-Object { if ($_ -match '^([A-Z0-9_]+)=(.*)$') { $env_[$Matches[1]] = $Matches[2].Trim() } }
$utilisateur = $env_['MQTT_UTILISATEUR_CAPTEURS']
$motDePasse = $env_['MQTT_MOT_DE_PASSE_CAPTEURS']
if (-not $utilisateur -or -not $motDePasse -or $motDePasse -eq 'TA-CLE') { throw "Compte MQTT absent du fichier .env : lancer d'abord `node scripts/generer-secrets.mjs`." }
$sujet = "capteurs/chambre$Chambre/$Type"
# Le contenu du message n'est jamais lu par n8n : seul le sujet compte.
$message = '{"capteur":"simulation"}'
if (Get-Command mosquitto_pub -ErrorAction SilentlyContinue) {
  mosquitto_pub -h localhost -p 1884 -u $utilisateur -P $motDePasse -t $sujet -m $message
} else {
  Push-Location (Join-Path $PSScriptRoot '..\compose')
  try { docker compose exec -T mosquitto mosquitto_pub -h localhost -u $utilisateur -P $motDePasse -t $sujet -m $message } finally { Pop-Location }
}
Write-Output "Alarme publiée : $sujet"