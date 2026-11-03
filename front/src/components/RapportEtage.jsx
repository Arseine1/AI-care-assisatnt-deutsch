import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { annulerTache, lancerEtage, tacheEtage, validerEtage } from '../api.js';
import Avertissements from './Avertissements.jsx';
import PhrasesRetirees from './PhrasesRetirees.jsx';
import { ApresValidation } from './Reponse.jsx';

const INTERVALLE_MS = 4000;

// Rapport de garde de tout un étage : n8n prépare un SBAR par résident (l'un après l'autre) ; chaque rapport est relu,
// éventuellement corrigé, puis l'étage est validé d'un coup. Rien n'est enregistré avant ce clic.
export default function RapportEtage({ etage, residents, tacheExistante = null }) {
  const [tache, setTache] = useState(null);
  const [avancement, setAvancement] = useState(null);
  const [textes, setTextes] = useState({}); // corrections du soignant, par brouillon
  const [erreur, setErreur] = useState(false);
  const [validation, setValidation] = useState(null); // { heure, resultat }
  const [erreurValidation, setErreurValidation] = useState(false);
  const [enValidation, setEnValidation] = useState(false);
  const actif = useRef(true);

  useEffect(() => {
    actif.current = true;
    let minuteur;
    async function suivre(courante) {
      try {
        const a = await tacheEtage(courante);
        if (!actif.current) return;
        setAvancement(a);
        if (a.statut === 'en_cours') minuteur = setTimeout(() => suivre(courante), INTERVALLE_MS);
      } catch {
        if (actif.current) setErreur(true);
      }
    }
    (async () => {
      try {
        const nouvelle = tacheExistante ?? (await lancerEtage({ etage, residents }));
        if (!actif.current) return;
        setTache(nouvelle);
        suivre(nouvelle);
      } catch {
        if (actif.current) setErreur(true);
      }
    })();
    return () => {
      actif.current = false;
      clearTimeout(minuteur);
    };
  }, [etage, residents, tacheExistante]);

  const rapports = (avancement?.resultat ?? []).filter((r) => r.brouillon_id);
  const termine = avancement && avancement.statut !== 'en_cours';
  const texteDe = (r) => textes[r.brouillon_id] ?? r.texte;
  const [annulation, setAnnulation] = useState(false);
  async function annuler() {
    setAnnulation(true);
    try {
      await annulerTache(tache);
    } catch {
      setAnnulation(false);
    }
  }

  async function valider() {
    setErreurValidation(false);
    setEnValidation(true);
    try {
      const resultat = await validerEtage({ etage, rapports: rapports.map((r) => ({ brouillon_id: r.brouillon_id, texte: texteDe(r) })) });
      setValidation({ heure: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), resultat });
    } catch {
      setErreurValidation(true);
    } finally {
      setEnValidation(false);
    }
  }

  if (erreur) return <p className="erreur" role="alert">{t('reponse.erreur')}</p>;
  if (!avancement) return <p className="chargement" role="status">{t('etage.demarrage', { etage })}</p>;

  return (
    <div className="reponse rapport-etage">
      <p className="contexte-demande">{t('etage.contexte', { etage })}</p>
      <p className="avancement" role="status">
        {termine ? t('etage.termine', { fait: avancement.fait, total: avancement.total }) : t('etage.enCours', { fait: avancement.fait, total: avancement.total })}
      </p>
      <progress max={avancement.total || 1} value={avancement.fait} aria-label={t('etage.progression')} />
      {!termine && tache && (
        <button type="button" className="lien-bouton" onClick={annuler} disabled={annulation}>{annulation ? t('etage.annulationEnCours') : t('etage.annuler')}</button>
      )}
      {avancement.statut === 'annulee' && <p className="astuce" role="status">{t('etage.annulee', { fait: avancement.fait })}</p>}
      {avancement.statut === 'interrompue' && <p className="erreur" role="alert">{t('etage.interrompue', { fait: avancement.fait })}</p>}

      {avancement.resultat.map((r) => (
        <section key={r.patient_id ?? r.chambre} className="carte-rapport">
          <h3>{t('etage.carte', { chambre: r.chambre, resident: r.resident })}</h3>
          {r.erreur ? (
            <p className="erreur" role="alert">{t('etage.erreurResident', { detail: r.erreur })}</p>
          ) : (
            <>
              <textarea
                rows={7}
                value={texteDe(r)}
                aria-label={t('etage.carte', { chambre: r.chambre, resident: r.resident })}
                disabled={Boolean(validation)}
                onChange={(e) => setTextes({ ...textes, [r.brouillon_id]: e.target.value })}
              />
              <ul className="liste-sources">
                {r.sources.map((s) => <li key={s} className="source">[{s}]</li>)}
              </ul>
              <Avertissements liste={r.avertissements} />
              <PhrasesRetirees liste={r.retirees} />
            </>
          )}
        </section>
      ))}

      {termine && rapports.length > 0 && !validation && (
        <>
          <p className="astuce">{t('etage.relire')}</p>
          <button type="button" className="bouton-principal" onClick={valider} disabled={enValidation || rapports.some((r) => texteDe(r).trim() === '')}>
            {t('etage.valider', { n: rapports.length })}
          </button>
        </>
      )}
      {erreurValidation && <p className="erreur" role="alert">{t('reponse.erreurEnregistrement')}</p>}
      {validation && (
        <>
          <p className="confirmation" role="status">{t('etage.confirmation', { n: validation.resultat.nb_valides, heure: validation.heure })}</p>
          {validation.resultat.refuses?.length > 0 && <p className="erreur" role="alert">{t('etage.refuses', { n: validation.resultat.refuses.length })}</p>}
          <ApresValidation info={validation.resultat.apres_validation} />
        </>
      )}
      {tache && avancement.statut === 'termine_avec_erreurs' && <p className="astuce">{t('etage.avecErreurs')}</p>}
    </div>
  );
}
