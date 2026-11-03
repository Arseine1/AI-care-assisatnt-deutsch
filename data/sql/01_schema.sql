-- Logiciel de soins FICTIF (données de démonstration).
-- Schéma dédié « soins » pour ne pas se mélanger avec les tables internes de n8n.
-- Ce fichier ne supprime rien : il peut être rejoué sans risque.

-- Heures affichées dans les notes (« chute à 02h40 ») : heure de la maison de soins, pas UTC.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Europe/Berlin');
END $$;

CREATE SCHEMA IF NOT EXISTS soins;

CREATE TABLE IF NOT EXISTS soins.residents (
  patient_id      text PRIMARY KEY,
  civilite        text NOT NULL,
  prenom          text NOT NULL,
  nom             text NOT NULL,
  date_naissance  date NOT NULL,
  sexe            text NOT NULL CHECK (sexe IN ('M', 'F')),
  chambre         text NOT NULL,
  etage           int  NOT NULL,
  date_admission  date NOT NULL,
  diagnostics     text[] NOT NULL DEFAULT '{}',
  allergies       text[] NOT NULL DEFAULT '{}',
  regime          text,
  risques         text[] NOT NULL DEFAULT '{}'
);

-- Un seul patient_id pour tous les systèmes : logiciel de soins, FHIR, KVNR (ePA), capteurs, chambre.
CREATE TABLE IF NOT EXISTS soins.correspondance (
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  systeme     text NOT NULL CHECK (systeme IN ('logiciel_soins', 'fhir', 'epa_kvnr', 'capteur', 'chambre')),
  identifiant text NOT NULL,
  PRIMARY KEY (systeme, identifiant)
);
CREATE INDEX IF NOT EXISTS correspondance_patient ON soins.correspondance (patient_id);

-- Résolution d'identité : les homonymes (deux « Heinz Müller ») ne se distinguent que par la date de naissance.
CREATE UNIQUE INDEX IF NOT EXISTS residents_identite ON soins.residents (lower(nom), lower(prenom), date_naissance);

-- patient_id à partir d'un identifiant d'un système (ex. 'epa_kvnr', 'Z000000012'), NULL si inconnu.
CREATE OR REPLACE FUNCTION soins.resoudre_patient(p_systeme text, p_identifiant text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT patient_id FROM soins.correspondance WHERE systeme = p_systeme AND identifiant = p_identifiant
$$;

-- patient_id à partir du nom et de la date de naissance (lettres de médecin) : 0 ligne si inconnu,
-- 2 lignes ou plus si ambigu (à traiter comme « à vérifier », jamais deviner).
CREATE OR REPLACE FUNCTION soins.trouver_par_identite(p_nom text, p_naissance date)
RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT patient_id FROM soins.residents WHERE lower(nom) = lower(p_nom) AND date_naissance = p_naissance
$$;

CREATE TABLE IF NOT EXISTS soins.notes_soins (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  horodatage  timestamptz NOT NULL,
  auteur      text NOT NULL,
  categorie   text NOT NULL,
  texte       text NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_patient_date ON soins.notes_soins (patient_id, horodatage DESC);

CREATE TABLE IF NOT EXISTS soins.plan_medication (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  medicament  text NOT NULL,
  dosage      text NOT NULL,
  schema_prise text NOT NULL,
  indication  text,
  remarque    text,
  actif       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS soins.signes_vitaux (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  horodatage  timestamptz NOT NULL,
  type        text NOT NULL,
  valeur      text NOT NULL,
  unite       text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS vitaux_patient_date ON soins.signes_vitaux (patient_id, horodatage DESC);

-- Vue à plat de la correspondance : un patient_id, tous ses identifiants.
CREATE OR REPLACE VIEW soins.v_correspondance AS
SELECT r.patient_id, r.civilite, r.prenom, r.nom, r.date_naissance, r.chambre, r.etage,
       max(c.identifiant) FILTER (WHERE c.systeme = 'fhir')     AS fhir_id,
       max(c.identifiant) FILTER (WHERE c.systeme = 'epa_kvnr') AS kvnr,
       max(c.identifiant) FILTER (WHERE c.systeme = 'capteur')  AS capteur
FROM soins.residents r
JOIN soins.correspondance c USING (patient_id)
GROUP BY r.patient_id, r.civilite, r.prenom, r.nom, r.date_naissance, r.chambre, r.etage;

-- Journal des imports vers le RAG (jour 2, étape 5) : l'empreinte SHA-256 évite les doublons.
-- Pas de clé étrangère : un rechargement des données de test ne doit pas effacer l'historique.
CREATE TABLE IF NOT EXISTS soins.journal_imports (
  id          bigserial PRIMARY KEY,
  source      text NOT NULL,
  reference   text,
  patient_id  text,
  empreinte   text NOT NULL,
  statut      text NOT NULL DEFAULT 'importe',
  detail      text,
  importe_le  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, empreinte)
);

-- Brouillons : réponse brute de l'IA, AVANT toute validation (jour 3). Le bouton « Valider & Enregistrer »
-- ne peut enregistrer que le texte d'un brouillon existant, jamais un texte arrivé d'ailleurs.
CREATE TABLE IF NOT EXISTS soins.brouillons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  patient_id      text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('a', 'b')),
  action          text,
  consigne        text,
  prompt_id       text NOT NULL,
  prompt_version  text NOT NULL,
  modele          text,
  texte_ia        text NOT NULL,
  faits           jsonb NOT NULL DEFAULT '[]',
  avertissements  jsonb NOT NULL DEFAULT '[]',
  statut          text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'valide', 'abandonne'))
);
CREATE INDEX IF NOT EXISTS brouillons_patient ON soins.brouillons (patient_id, cree_le DESC);

-- Phrases du modèle RETIRÉES par le filtre anti-invention (non appuyées par leur fait) : gardées pour l'audit.
ALTER TABLE soins.brouillons ADD COLUMN IF NOT EXISTS retirees jsonb NOT NULL DEFAULT '[]';

-- Tâches longues lancées par l'interface (ex. rapport de garde d'un étage entier : une génération par résident,
-- plusieurs minutes chacune) : l'interface reçoit un identifiant tout de suite, puis consulte l'avancement.
CREATE TABLE IF NOT EXISTS soins.taches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le      timestamptz NOT NULL DEFAULT now(),
  type         text NOT NULL,
  parametres   jsonb NOT NULL DEFAULT '{}',
  statut       text NOT NULL DEFAULT 'en_cours',
  total        integer NOT NULL DEFAULT 0,
  fait         integer NOT NULL DEFAULT 0,
  resultat     jsonb NOT NULL DEFAULT '[]',
  termine_le   timestamptz
);

-- Tâches fiables (jour 4, étape 4) : un battement de coeur (heartbeat) est écrit à chaque étape ; une tâche « en cours » dont
-- n8n s'est arrêté, ou sans battement depuis trop longtemps, passe à « interrompue » ; le soignant peut aussi l'annuler.
ALTER TABLE soins.taches ADD COLUMN IF NOT EXISTS heartbeat timestamptz NOT NULL DEFAULT now();
ALTER TABLE soins.taches DROP CONSTRAINT IF EXISTS taches_statut_check;
ALTER TABLE soins.taches ADD CONSTRAINT taches_statut_check CHECK (statut IN ('en_cours', 'termine', 'termine_avec_erreurs', 'interrompue', 'annulee'));
-- Transmissions à l'équipe suivante, faites APRÈS validation d'un rapport de garde par un soignant.
CREATE TABLE IF NOT EXISTS soins.transmissions (
  id              bigserial PRIMARY KEY,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  portee          text NOT NULL CHECK (portee IN ('resident', 'etage')),
  etage           integer,
  patient_ids     text[] NOT NULL DEFAULT '{}',
  validation_ids  bigint[] NOT NULL DEFAULT '{}',
  destinataire    text NOT NULL,
  canal           text NOT NULL,
  sujet           text NOT NULL,
  statut          text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'
);

-- Journal d'audit de l'IA : chaque génération, refus de consigne, validation ou transmission.
CREATE TABLE IF NOT EXISTS soins.journal_ia (
  id              bigserial PRIMARY KEY,
  horodatage      timestamptz NOT NULL DEFAULT now(),
  evenement       text NOT NULL,
  patient_id      text,
  mode            text,
  action          text,
  prompt_id       text,
  prompt_version  text,
  modele          text,
  duree_ms        integer,
  details         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS journal_ia_date ON soins.journal_ia (horodatage DESC);

-- Réponses validées par les soignants (bouton « Valider & Enregistrer »). Aucune clé étrangère, pour la même raison.
CREATE TABLE IF NOT EXISTS soins.validations (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('a', 'b')),
  action      text,
  consigne    text,
  texte       text NOT NULL,
  sources     jsonb NOT NULL DEFAULT '[]',
  modifiee    boolean NOT NULL DEFAULT false,
  valide_par  text,
  valide_le   timestamptz NOT NULL DEFAULT now()
);
-- Lien vers le brouillon d'origine ; un brouillon ne peut être validé qu'une fois.
ALTER TABLE soins.validations ADD COLUMN IF NOT EXISTS brouillon_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS validations_brouillon ON soins.validations (brouillon_id);

-- Réglages modifiables sans toucher au code (jour 4) : « verification_ia » = analyse complémentaire de l'IA pour « Vérifier le document ».
CREATE TABLE IF NOT EXISTS soins.reglages (
  cle         text PRIMARY KEY,
  valeur      jsonb NOT NULL,
  modifie_le  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO soins.reglages (cle, valeur) VALUES ('verification_ia', 'true'::jsonb) ON CONFLICT (cle) DO NOTHING;

-- Alarmes de capteurs (jour 4, étape 5). Le message MQTT n'est jamais stocké : seul le sujet capteurs/chambre{n}/{type} compte.
-- « faits » = faits CODÉS lus dans le logiciel de soins (résident, risques, allergies, médication à risque), affichés tout de suite ;
-- « contexte » = texte de l'assistant IA, ajouté quand il est prêt : {statut: aucun | differe | en_cours | pret | indisponible, texte, …}.
CREATE TABLE IF NOT EXISTS soins.alarmes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recue_le      timestamptz NOT NULL DEFAULT now(),
  topic         text NOT NULL,
  chambre       text NOT NULL,
  type          text NOT NULL,
  libelle       text NOT NULL,
  patient_id    text,
  faits         jsonb NOT NULL DEFAULT '{}',
  contexte      jsonb NOT NULL DEFAULT '{"statut":"aucun"}',
  statut        text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'acquittee')),
  acquittee_le  timestamptz
);
CREATE INDEX IF NOT EXISTS alarmes_recue ON soins.alarmes (recue_le DESC);
-- « document » : courrier reçu (contradiction, courrier non identifié, rien à signaler) ou nouveauté de l'ePA ; faits->>'gravite' = rouge | attention | info.
ALTER TABLE soins.alarmes DROP CONSTRAINT IF EXISTS alarmes_type_check;
ALTER TABLE soins.alarmes ADD CONSTRAINT alarmes_type_check CHECK (type IN ('chute', 'sortie_lit', 'appel', 'document'));
-- une alerte de courrier ne se crée qu'une fois par courrier (le sujet porte la référence du courrier)
CREATE UNIQUE INDEX IF NOT EXISTS alarmes_document_unique ON soins.alarmes (topic) WHERE type = 'document';

-- Courriers (messages Mailpit) déjà traités par le workflow « courrier reçu » : le rattrapage planifié ne retraite que les autres
-- (notification perdue, n8n arrêté au moment de l'arrivée). L'identifiant d'un message Mailpit ne survit pas à sa recréation : c'est voulu.
CREATE TABLE IF NOT EXISTS soins.courriers_traites (
  message_id  text PRIMARY KEY,
  traite_le   timestamptz NOT NULL DEFAULT now()
);
-- verrou : un courrier « en_cours » depuis moins de 15 minutes n'est pas repris (notification et rattrapage ne le traitent pas deux fois)
ALTER TABLE soins.courriers_traites ADD COLUMN IF NOT EXISTS etat text NOT NULL DEFAULT 'traite';
ALTER TABLE soins.courriers_traites ADD COLUMN IF NOT EXISTS debut timestamptz NOT NULL DEFAULT now();

-- Soignants (comptes fictifs de démonstration) : identifiant + code PIN. Le PIN n'est JAMAIS stocké en clair : scrypt avec un sel propre à chaque soignant.
CREATE TABLE IF NOT EXISTS soins.soignants (
  identifiant  text PRIMARY KEY CHECK (identifiant ~ '^[a-z0-9._-]{2,40}$'),
  nom          text NOT NULL,
  pin_hash     text NOT NULL,
  actif        boolean NOT NULL DEFAULT true,
  cree_le      timestamptz NOT NULL DEFAULT now()
);
-- Sessions : le jeton n'est donné qu'une fois au soignant ; seule son empreinte SHA-256 est gardée ici. Durée : 12 heures.
CREATE TABLE IF NOT EXISTS soins.sessions (
  jeton_hash   text PRIMARY KEY,
  identifiant  text NOT NULL REFERENCES soins.soignants (identifiant) ON DELETE CASCADE,
  cree_le      timestamptz NOT NULL DEFAULT now(),
  expire_le    timestamptz NOT NULL DEFAULT now() + interval '12 hours'
);
CREATE INDEX IF NOT EXISTS sessions_expire ON soins.sessions (expire_le);
-- Échecs de connexion (verrouillage : 5 échecs en 5 minutes pour un même identifiant). Aucun PIN n'est conservé.
CREATE TABLE IF NOT EXISTS soins.connexions_echecs (
  id           bigserial PRIMARY KEY,
  identifiant  text NOT NULL,
  le           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connexions_echecs_recents ON soins.connexions_echecs (identifiant, le DESC);
-- Qui a validé : l'identifiant du compte, pris dans la SESSION (jamais dans la requête), en plus du nom affiché.
ALTER TABLE soins.validations ADD COLUMN IF NOT EXISTS soignant_id text;

-- Cotisations retraite des aidants familiaux (page « Cotisations retraite », données FICTIVES).
-- sgb6_dossiers : un questionnaire (texte) et le dernier résultat de l'agent. C'est la seule table qui contient des noms
--   (ceux du questionnaire, nécessaires pour relire le dossier) ; le journal n'en contient JAMAIS.
-- sgb6_journal  : une ligne par étape (agent) ou par décision (humain) : dossier, étape, outil, résultat court, durée, qui.
--   Ni nom ni numéro d'assurance : seulement l'identifiant du dossier et des comptes/statuts.
-- sgb6_decisions : valider, revue ou refuser, avec le soignant de la SESSION (jamais celui du corps de la requête).
CREATE TABLE IF NOT EXISTS soins.sgb6_dossiers (
  id              text PRIMARY KEY,
  questionnaire   text NOT NULL,
  aidant          text NOT NULL DEFAULT '',
  personne        text NOT NULL DEFAULT '',
  statut          text NOT NULL DEFAULT 'a_traiter' CHECK (statut IN ('a_traiter', 'pret_a_valider', 'exception', 'valide', 'refuse')),
  resultat        jsonb,
  revue           boolean NOT NULL DEFAULT false,
  recu_le         date NOT NULL DEFAULT current_date,
  mis_a_jour_le   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soins.sgb6_journal (
  id           bigserial PRIMARY KEY,
  horodatage   timestamptz NOT NULL DEFAULT now(),
  dossier_id   text NOT NULL,
  tache_id     uuid,
  etape        text NOT NULL,
  outil        text NOT NULL,
  resultat     text NOT NULL,
  duree_ms     integer NOT NULL DEFAULT 0,
  choisi_par   text NOT NULL CHECK (choisi_par IN ('agent', 'humain')),
  soignant     text
);
CREATE INDEX IF NOT EXISTS sgb6_journal_dossier ON soins.sgb6_journal (dossier_id, id);
CREATE INDEX IF NOT EXISTS sgb6_journal_tache ON soins.sgb6_journal (tache_id, id);
CREATE TABLE IF NOT EXISTS soins.sgb6_decisions (
  id           bigserial PRIMARY KEY,
  dossier_id   text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('valider', 'revue', 'refuser')),
  motif        text,
  soignant     text NOT NULL,
  heure        timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'refuser' OR btrim(coalesce(motif, '')) <> '')
);
CREATE INDEX IF NOT EXISTS sgb6_decisions_dossier ON soins.sgb6_decisions (dossier_id, id);
-- Agent piloté par un modèle (cotisations) : une ligne de journal par TOUR du modèle (outil choisi, raison donnée, accepté ou refusé par la garde).
-- La raison est écrite par le modèle : le code en retire les noms et numéros avant de l'enregistrer. choisi_par = 'modele' pour ces lignes.
ALTER TABLE soins.sgb6_journal ADD COLUMN IF NOT EXISTS raison text;
ALTER TABLE soins.sgb6_journal ADD COLUMN IF NOT EXISTS accepte boolean;
ALTER TABLE soins.sgb6_journal DROP CONSTRAINT IF EXISTS sgb6_journal_choisi_par_check;
ALTER TABLE soins.sgb6_journal ADD CONSTRAINT sgb6_journal_choisi_par_check CHECK (choisi_par IN ('agent', 'modele', 'humain'));