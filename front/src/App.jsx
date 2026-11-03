import { useCallback, useEffect, useState } from 'react';
import { t } from './i18n';
import logo from './assets/logo/logo-icone.jpg';
import PageGarde from './components/PageGarde.jsx';
import VerifierDocument from './components/VerifierDocument.jsx';
import Reponse from './components/Reponse.jsx';
import { libelleResident, trouverResident } from './components/SelecteurResident.jsx';
import Alertes from './components/Alertes.jsx';
import PageAlertes from './components/PageAlertes.jsx';
import { useAlarmes } from './useAlarmes.js';
import RapportEtage from './components/RapportEtage.jsx';
import residents from './mock/residents.json';
import Connexion from './components/Connexion.jsx';
import PageCotisations from './components/PageCotisations.jsx';
import { demander, enregistrer, listerDossiersCotisations, seDeconnecter, soignantCourant, surSessionPerdue } from './api.js';

// Les résidents d'un étage, une seule fois par étage choisi (référence stable pour le composant).
const parEtage = new Map();
function residentsDe(numero) {
  if (!parEtage.has(numero)) parEtage.set(numero, residents.filter((r) => r.etage === numero));
  return parEtage.get(numero);
}

const CLES_ACTIONS = {
  rapport_garde: 'rapportGarde',
  resume_epa: 'resumeEpa',
  points_vigilance: 'pointsVigilance',
  verifier_document: 'verifierDocument',
};

function texteContexte(demande) {
  const resident = libelleResident(demande.resident);
  return demande.mode === 'b'
    ? t('reponse.consignePrete', { chambre: demande.chambre, resident, consigne: demande.consigne })
    : t('reponse.demandePrete', {
        action: t(`modeA.actions.${CLES_ACTIONS[demande.action]}`),
        chambre: demande.chambre,
        resident,
      });
}

// Initiales de la pastille du soignant : « Mme Claudia Martin (soins) » -> « CM » (civilités et parenthèses ignorées)
function initiales(nom) {
  const mots = String(nom).replace(/\(.*?\)/g, '').split(/\s+/).filter((m) => m && !/^(M|Mme|Mlle|Dr|Pr)\.?$/i.test(m));
  return ((mots[0]?.[0] ?? '?') + (mots.length > 1 ? mots[mots.length - 1][0] : '')).toUpperCase();
}

function IconeTexte() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </svg>
  );
}

// Application protégée : n'est affichée qu'avec un soignant connecté (session contrôlée par n8n à chaque appel).
function Application({ soignant, onDeconnexion }) {
  const [page, setPage] = useState('garde'); // garde | alarmes | documents | cotisations : un processus métier par page
  const [dossiersCot, setDossiersCot] = useState([]);
  const [modeleCot, setModeleCot] = useState({ defaut: '', modeles: [] });
  const [erreurCot, setErreurCot] = useState(false);
  const chargerCotisations = useCallback(() => {
    listerDossiersCotisations().then((d) => { setDossiersCot(d.dossiers); setModeleCot({ defaut: d.modele, modeles: d.modeles }); setErreurCot(false); }).catch(() => setErreurCot(true));
  }, []);
  useEffect(() => { chargerCotisations(); }, [chargerCotisations]);
  const cotisationsAttente = dossiersCot.filter((d) => d.statut === 'pret_a_valider' || d.statut === 'exception').length;
  const cotisationsException = dossiersCot.some((d) => d.statut === 'exception');
  const { alarmes, documents, historiqueAlarmes, historiqueDocuments, acquitter, connexionPerdue, observerHistorique } = useAlarmes();
  const documentsRouges = documents.filter((d) => d.faits?.gravite === 'rouge').length;
  // Dernière demande (Mode A : {action, chambre} ; Mode B : {consigne, chambre}) et sa réponse.
  const [demande, setDemande] = useState(null);
  const [reponse, setReponse] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [alertesSupp, setAlertesSupp] = useState([]); // alertes ajoutées plus tard par l'analyse complémentaire
  const ajouterAlertes = useCallback((a) => setAlertesSupp(a), []);
  const [etage, setEtage] = useState(null); // { numero, id } : rapport de garde d'un étage entier

  // Alerte d'un courrier : ouvre « Vérifier le document » pour ce résident (les règles répondent tout de suite)
  function ouvrirVerification(alarme) {
    setPage('documents');
    lancer({ mode: 'a', action: 'verifier_document', chambre: alarme.chambre, resident: trouverResident(alarme.chambre), ref: alarme.faits?.courrier?.ref });
  }

  function changerPage(p) {
    setPage(p);
    setEtage(null);
    setDemande(null);
    setReponse(null);
    setErreur(false);
    setAlertesSupp([]);
  }

  function lancerEtage(numero, tacheExistante = null) {
    setDemande(null);
    setReponse(null);
    setErreur(false);
    setEtage({ numero, id: Date.now(), tacheExistante });
  }

  async function lancer(d) {
    // `id` unique : chaque demande remet la zone de réponse à zéro.
    const nouvelle = { ...d, id: Date.now() };
    setEtage(null);
    setAlertesSupp([]);
    setDemande(nouvelle);
    setReponse(null);
    setErreur(false);
    setEnCours(true);
    try {
      setReponse(await demander(nouvelle));
    } catch {
      setErreur(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="app">
      <header className="entete">
        <div className="marque">
          <img className="logo" src={logo} alt="" width="68" height="61" />
          <div>
            <h1>{t('app.titre')}</h1>
            <p className="sous-titre">{t('app.sousTitre')}</p>
          </div>
        </div>
        <div className="entete-droite">
          <div className="soignant-carte">
            <span className="avatar" aria-hidden="true">{initiales(soignant.nom)}</span>
            <span className="soignant-infos">
              <strong title={soignant.nom}>{soignant.nom}</strong>
              <small>{t('connexion.connecte')}</small>
            </span>
            <button type="button" className="bouton-deconnexion" onClick={onDeconnexion}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M16 8l4 4-4 4M20 12H9" />
              </svg>
              <span>{t('connexion.seDeconnecter')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="disposition">
      <nav className="modes" aria-label={t('modes.titre')}>
        <button className={page === 'garde' ? 'onglet actif' : 'onglet'} onClick={() => changerPage('garde')}>
          {t('modes.garde')}
        </button>
        <button className={page === 'alarmes' ? 'onglet actif' : 'onglet'} onClick={() => changerPage('alarmes')}>
          {t('modes.alarmes')}
          {alarmes.length > 0 && <span className="compteur-alertes" aria-label={t('modes.alertesEnAttente', { n: alarmes.length })}>{alarmes.length}</span>}
        </button>
        <button className={page === 'documents' ? 'onglet actif' : 'onglet'} onClick={() => changerPage('documents')}>
          {t('modes.documents')}
          {documents.length > 0 && <span className={documentsRouges ? 'compteur-alertes' : 'compteur-alertes compteur-doux'} aria-label={t('modes.alertesEnAttente', { n: documents.length })}>{documents.length}</span>}
        </button>
        <button className={page === 'cotisations' ? 'onglet actif' : 'onglet'} onClick={() => changerPage('cotisations')}>
          {t('modes.cotisations')}
          {cotisationsAttente > 0 && <span className={cotisationsException ? 'compteur-alertes' : 'compteur-alertes compteur-doux'} aria-label={t('modes.alertesEnAttente', { n: cotisationsAttente })}>{cotisationsAttente}</span>}
        </button>
      </nav>

      <div className="zone-page">
      {connexionPerdue && <p className="connexion-perdue" role="alert">{t('alarmes.connexionPerdue')}</p>}
      {/* les alarmes de capteurs ne s'affichent que dans leur page ; ailleurs, seul le compteur de l'onglet les signale */}
      <Alertes alertes={[...(reponse?.alertes ?? []), ...alertesSupp]} />

      {page === 'alarmes' ? (
        <main className="contenu contenu-alertes">
          <PageAlertes jeu="alarmes" alarmes={alarmes} historique={historiqueAlarmes} onAcquitter={acquitter} observerHistorique={observerHistorique} />
        </main>
      ) : page === 'cotisations' ? (
        <main className="contenu">
          <PageCotisations dossiers={dossiersCot} modele={modeleCot.defaut} modeles={modeleCot.modeles} erreurChargement={erreurCot} onChange={chargerCotisations} />
        </main>
      ) : (
        <main className="contenu">
          {page === 'garde' ? (
            <section className="panneau">
              <PageGarde onAction={lancer} onEtage={lancerEtage} onConsigne={lancer} enCours={enCours} />
            </section>
          ) : (
            <div className="colonne">
              <PageAlertes jeu="documents" alarmes={documents} historique={historiqueDocuments} onAcquitter={acquitter} onOuvrir={ouvrirVerification} observerHistorique={observerHistorique} />
              <section className="panneau">
                <VerifierDocument onVerifier={lancer} enCours={enCours} />
              </section>
            </div>
          )}

          <section className="panneau">
            <div className="panneau-entete">
              <h2>{t('reponse.titre')}</h2>
            </div>
            {etage ? (
              <RapportEtage key={etage.id} etage={etage.numero} residents={residentsDe(etage.numero)} tacheExistante={etage.tacheExistante} />
            ) : enCours ? (
              <p className="chargement" role="status">{t('reponse.enCours')}</p>
            ) : erreur ? (
              <p className="erreur" role="alert">{t('reponse.erreur')}</p>
            ) : reponse?.refuse ? (
              <div className="refus" role="alert">
                <h3>{t('reponse.refusTitre')}</h3>
                <p>{reponse.message}</p>
                <p className="astuce">{t('reponse.refusAide')}</p>
              </div>
            ) : reponse ? (
              <Reponse
                key={demande.id}
                reponse={reponse}
                contexte={texteContexte(demande)}
                onAlertes={ajouterAlertes}
                onValider={(v) => enregistrer({ demande, reponse, ...v })}
              />
            ) : (
              <div className="vide">
                <IconeTexte />
                <p>{t('reponse.vide')}</p>
              </div>
            )}
          </section>
        </main>
      )}
      </div>
      </div>
    </div>
  );
}

export default function App() {
  const [soignant, setSoignant] = useState(undefined); // undefined : session en cours de vérification ; null : non connecté
  const [expiree, setExpiree] = useState(false);

  useEffect(() => {
    let actif = true;
    soignantCourant()
      .then((s) => actif && setSoignant(s))
      .catch(() => actif && setSoignant(null));
    // n8n a refusé la session (expirée, fermée ailleurs) : retour à la page de connexion, avec le motif
    const arreter = surSessionPerdue(() => {
      setExpiree(true);
      setSoignant(null);
    });
    return () => {
      actif = false;
      arreter();
    };
  }, []);

  async function deconnecter() {
    await seDeconnecter();
    setExpiree(false);
    setSoignant(null);
  }

  if (soignant === undefined) {
    return (
      <div className="app">
        <p className="panneau-aide">{t('connexion.verification')}</p>
      </div>
    );
  }
  if (!soignant) {
    return (
      <Connexion
        motifInitial={expiree ? 'expiree' : null}
        onConnecte={(s) => {
          setExpiree(false);
          setSoignant(s);
        }}
      />
    );
  }
  return <Application soignant={soignant} onDeconnexion={deconnecter} />;
}