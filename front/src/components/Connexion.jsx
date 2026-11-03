import { useState } from 'react';
import { t } from '../i18n';
import logo from '../assets/logo/logo-vertical.jpg';
import { MOCK, seConnecter } from '../api.js';

function Icone({ nom }) {
  const traits = {
    source: <path d="M5 4h10l4 4v12H5zM14 4v5h5M8.5 13h7M8.5 16.5h5" />,
    valide: <path d="M12 3l7 3v5c0 4.4-2.9 8.3-7 10-4.1-1.7-7-5.6-7-10V6zM8.8 12.2l2.2 2.2 4.2-4.4" />,
    local: <path d="M4 6h16v10H4zM9 20h6M12 16v4" />,
    utilisateur: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6" />,
    cadenas: <path d="M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 017 0v3" />,
    oeil: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />,
    oeilBarre: <path d="M3.5 4.5l17 15M9.9 6.1C10.6 5.7 11.3 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5s-1 1.9-2.9 3.7M6.2 8C3.9 9.7 2.5 12 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.4 3.8-.9M10 10.2a3 3 0 004 4" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {traits[nom]}
    </svg>
  );
}

const POINTS = [
  { cle: 'sources', icone: 'source' },
  { cle: 'validation', icone: 'valide' },
  { cle: 'local', icone: 'local' },
];

// Page de connexion : identifiant + code PIN. Le PIN n'est jamais affiché (sauf demande) ni conservé par l'interface ; n8n le compare à son empreinte.
export default function Connexion({ onConnecte, motifInitial = null }) {
  const [identifiant, setIdentifiant] = useState('');
  const [pin, setPin] = useState('');
  const [voirPin, setVoirPin] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [motif, setMotif] = useState(motifInitial); // identifiants | verrouille | reseau | expiree

  async function valider(e) {
    e.preventDefault();
    setEnCours(true);
    setMotif(null);
    const r = await seConnecter(identifiant, pin);
    setEnCours(false);
    if (r.ok) onConnecte(r.soignant);
    else {
      setMotif(r.motif);
      setPin('');
    }
  }

  return (
    <div className="connexion-page">
      <aside className="connexion-vitrine">
        <img className="connexion-logo" src={logo} alt="" width="220" />
        <h1>{t('app.titre')}</h1>
        <p className="connexion-sous-titre">{t('app.sousTitre')}</p>
        <p className="connexion-accroche">{t('connexion.accroche')}</p>
        <ul className="connexion-points">
          {POINTS.map((p) => (
            <li key={p.cle}>
              <span className="connexion-point-icone">
                <Icone nom={p.icone} />
              </span>
              <span>
                <strong>{t(`connexion.points.${p.cle}.titre`)}</strong>
                <span className="connexion-point-texte">{t(`connexion.points.${p.cle}.texte`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="connexion-formulaire">
        <form className="carte-connexion" onSubmit={valider}>
          <h2>{t('connexion.titre')}</h2>
          <p className="connexion-aide">{t('connexion.aide')}</p>

          <label className="champ-connexion">
            <span className="champ-label">{t('connexion.identifiant')}</span>
            <span className="champ-connexion-boite">
              <Icone nom="utilisateur" />
              <input name="identifiant" autoComplete="username" autoCapitalize="none" spellCheck="false" required maxLength={40} value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} />
            </span>
          </label>

          <label className="champ-connexion">
            <span className="champ-label">{t('connexion.pin')}</span>
            <span className="champ-connexion-boite">
              <Icone nom="cadenas" />
              <input
                name="pin"
                type={voirPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{4,8}"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
              <button type="button" className="champ-connexion-oeil" onClick={() => setVoirPin((v) => !v)} aria-label={voirPin ? t('connexion.masquerPin') : t('connexion.afficherPin')} aria-pressed={voirPin}>
                <Icone nom={voirPin ? 'oeilBarre' : 'oeil'} />
              </button>
            </span>
          </label>

          {motif && (
            <p className={motif === 'expiree' ? 'connexion-info' : 'connexion-erreur'} role="alert">
              {t(`connexion.${motif}`)}
            </p>
          )}

          <button className="bouton-principal" type="submit" disabled={enCours || !identifiant || pin.length < 4}>
            {enCours ? t('connexion.enCours') : t('connexion.seConnecter')}
          </button>
          <p className="connexion-note">{t('connexion.sessionDuree')}</p>
          {MOCK && <p className="connexion-simulee">{t('connexion.aideSimulee')}</p>}
        </form>
        <span className="badge-fictif">{t('app.donneesFictives')}</span>
      </main>
    </div>
  );
}
