import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { MOCK, deciderCotisations, deposerQuestionnaire, dossierCotisations, etatAgentCotisations, lancerAgentCotisations } from '../api.js';

const ETAPES = ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'];
const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

function Pastille({ statut }) {
  return <span className={`pastille pastille-${statut}`} role="img" aria-label={t(`cotisations.regles.${statut}`)} title={t(`cotisations.regles.${statut}`)} />;
}

// Seite „Rentenbeiträge“: Ein KI-Agent bearbeitet die Fragebögen pflegender Angehöriger (fiktive Daten).
// Der Agent liest, prüft, berechnet und bereitet vor; Bestätigen, Ablehnen oder eine Überprüfung anfordern bleibt eine menschliche Handlung.
// Gewähltes Modell, im Browser gemerkt (nur zur Bequemlichkeit: n8n prüft den Namen bei jedem Start gegen seine geschlossene Liste).
const CLE_MODELE = 'aicare-sgb6-modele';
const modeleRetenu = () => {
  try {
    return localStorage.getItem(CLE_MODELE) || '';
  } catch {
    return '';
  }
};
export default function PageCotisations({ dossiers, modele, modeles = [], erreurChargement, onChange }) {
  const [choisi, setChoisi] = useState(null);
  const [pilote, setPilote] = useState('modele'); // modele: von einem lokalen Modell gesteuert; guidee: vom Code geführte Mission
  const [choixModele, setChoixModele] = useState(modeleRetenu);
  const [lectureIA, setLectureIA] = useState(MOCK); // simuliert: angehakt; real: nicht angehakt (das Lesen durch die KI dauert mehrere Minuten)
  const [suivi, setSuivi] = useState({}); // id -> { fait, termine, resultat, lecture_ia, pilote, tours, erreur }
  const [decisions, setDecisions] = useState({}); // id -> { type, motif } (Bestätigungsmeldung)
  const [enLot, setEnLot] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreurDecision, setErreurDecision] = useState(false);
  const [enDecision, setEnDecision] = useState(false);
  const [depot, setDepot] = useState(null); // { ok, message } der letzten Ablage
  const champFichier = useRef(null);
  const actif = useRef(true);
  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  // verwendetes Modell: die Wahl der Person, falls installiert, sonst das Standardmodell, falls installiert, sonst das erste installierte
  const installes = modeles.filter((m) => m.installe).map((m) => m.nom);
  const modeleActif = installes.includes(choixModele) ? choixModele : installes.includes(modele) ? modele : (installes[0] ?? modele);
  const choisirModele = (nom) => {
    setChoixModele(nom);
    try {
      localStorage.setItem(CLE_MODELE, nom);
    } catch {
      /* nur zur Bequemlichkeit */
    }
  };
  const enCours = Object.values(suivi).some((s) => !s.termine && !s.erreur);
  const mettreAJour = (id, partie) => actif.current && setSuivi((s) => ({ ...s, [id]: { ...s[id], ...partie } }));

  async function traiter(id) {
    setChoisi(id);
    setMotif('');
    setErreurDecision(false);
    setSuivi((s) => ({ ...s, [id]: { fait: 0, termine: false, pilote, tours: [] } }));
    try {
      const tache = await lancerAgentCotisations(id, { lectureIA, pilote, modele: modeleActif });
      let a;
      do {
        if (!actif.current) return;
        a = await etatAgentCotisations(tache.tache_id);
        mettreAJour(id, { fait: a.fait, termine: a.statut === 'termine', resultat: a.resultat, lecture_ia: a.lecture_ia, tours: a.tours ?? [] });
      } while (a.statut === 'en_cours');
    } catch {
      mettreAJour(id, { erreur: true });
    }
    if (actif.current) onChange();
  }

  // Eine bereits bearbeitete Akte wählen: Es wird das zuletzt GESPEICHERTE Ergebnis angezeigt, ohne den Agenten neu zu starten.
  async function choisir(id) {
    setChoisi(id);
    setMotif('');
    setErreurDecision(false);
    const d = dossiers.find((x) => x.id === id);
    if (!d?.traite || suivi[id]) return;
    try {
      const r = await dossierCotisations(id);
      if (r.resultat && actif.current) setSuivi((s) => (s[id] ? s : { ...s, [id]: { fait: 7, termine: true, resultat: r.resultat, lecture_ia: r.resultat.lecture_ia ?? null, decision: r.derniere_decision } }));
    } catch {
      mettreAJour(id, { erreur: true });
    }
  }

  async function deposer(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 1048576) {
      setDepot({ ok: false, message: t('cotisations.deposer.tropGros') });
      return;
    }
    setDepot({ enCours: true });
    try {
      const contenu = await new Promise((resolu, rejete) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolu(String(lecteur.result).split(',')[1] ?? '');
        lecteur.onerror = rejete;
        lecteur.readAsDataURL(fichier);
      });
      const r = await deposerQuestionnaire({ nom: fichier.name, contenu_base64: contenu });
      if (!actif.current) return;
      if (r.ok) {
        setDepot({ ok: true, message: t('cotisations.deposer.ok') });
        onChange();
        setChoisi(r.id);
      } else setDepot({ ok: false, message: r.message ?? t('cotisations.deposer.erreur') });
    } catch {
      if (actif.current) setDepot({ ok: false, message: t('cotisations.deposer.erreur') });
    }
  }

  async function traiterTous() {
    setEnLot(true);
    for (const d of dossiers.filter((x) => x.statut === 'a_traiter')) {
      if (!actif.current) break;
      await traiter(d.id);
    }
    if (actif.current) setEnLot(false);
  }

  async function decider(id, decision) {
    setErreurDecision(false);
    setEnDecision(true);
    try {
      await deciderCotisations({ id, decision, motif });
      setDecisions((d) => ({ ...d, [id]: { type: decision, motif: motif.trim() } }));
      onChange();
    } catch {
      setErreurDecision(true);
    } finally {
      setEnDecision(false);
    }
  }

  const dossier = dossiers.find((d) => d.id === choisi);
  const s = choisi ? suivi[choisi] : null;
  const r = s?.resultat;
  const fait = s?.fait ?? 0;
  const termine = Boolean(s?.termine);
  const faitAff = termine ? 7 : fait; // die Abschnitte des Ergebnisses erscheinen, wenn der Agent fertig ist
  const tours = s?.tours ?? [];
  const piloteModele = r?.pilote?.mode === 'modele' || (s?.pilote === 'modele' && !r);
  const avecEtapes = !piloteModele; // Steuerung durch das Modell: Die Runden ersetzen die Liste der Schritte (außer bei Rückfall auf die geführte Mission)
  const decide = dossier && ['valide', 'refuse'].includes(dossier.statut);
  const enAttente = termine && dossier && ['pret_a_valider', 'exception'].includes(dossier.statut);

  return (
    <>
      <section className="panneau">
        <div className="panneau-entete">
          <h2>{t('cotisations.titre')}</h2>
          <p className="panneau-aide">{t('cotisations.aide')}</p>
        </div>
        {erreurChargement ? (
          <p className="erreur" role="alert">{t('cotisations.erreur')}</p>
        ) : !dossiers.length ? (
          <p className="chargement" role="status">{t('cotisations.chargement')}</p>
        ) : (
          <ul className="dossiers-cot">
            {dossiers.map((d) => (
              <li key={d.id} className={d.id === choisi ? 'dossier-cot choisi' : 'dossier-cot'}>
                <button type="button" className="dossier-cot-choix" onClick={() => choisir(d.id)} aria-pressed={d.id === choisi}>
                  <span className="dossier-cot-nom">{d.aidant}</span>
                  <span className="dossier-cot-detail">{t('cotisations.pour', { personne: d.personne_soignee })} · {t('cotisations.recuLe', { date: dateFr(d.recu_le) })}</span>
                </button>
                <span className={`statut-cot statut-${d.statut}`}>{t(`cotisations.statuts.${d.statut}`)}{d.revue ? ` · ${t('cotisations.revueCreee')}` : ''}</span>
                <button type="button" className="lien-bouton" disabled={enCours || enLot || ['valide', 'refuse'].includes(d.statut)} onClick={() => traiter(d.id)}>
                  {t('cotisations.lancer')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="bouton-principal" onClick={traiterTous} disabled={enCours || enLot || !dossiers.some((d) => d.statut === 'a_traiter')}>
          {enLot ? t('cotisations.traiterTousEnCours') : t('cotisations.traiterTous')}
        </button>
        <input ref={champFichier} type="file" accept=".txt,.pdf,text/plain,application/pdf" hidden onChange={deposer} />
        <button type="button" className="bouton-secondaire bouton-deposer" onClick={() => champFichier.current?.click()} disabled={Boolean(depot?.enCours)}>
          {depot?.enCours ? t('cotisations.deposer.enCours') : t('cotisations.deposer.bouton')}
        </button>
        <p className="astuce">{t('cotisations.deposer.aide')}</p>
        {depot && !depot.enCours && <p className={depot.ok ? 'confirmation-cot' : 'erreur'} role="status">{depot.message}</p>}
        <fieldset className="choix-pilote" disabled={enCours || enLot}>
          <legend>{t('cotisations.pilote.choix')}</legend>
          <label><input type="radio" name="pilote" value="modele" checked={pilote === 'modele'} onChange={() => setPilote('modele')} /> <span>{t('cotisations.pilote.modele')}</span></label>
          {pilote === 'modele' && (
            <label className="choix-modele">
              <span>{t('cotisations.pilote.modeleChoix')}</span>
              <select value={modeleActif} onChange={(e) => choisirModele(e.target.value)} aria-label={t('cotisations.pilote.modeleChoix')}>
                {(modeles.length ? modeles : [{ nom: modeleActif, installe: true }]).map((m) => (
                  <option key={m.nom} value={m.nom} disabled={!m.installe}>{m.installe ? m.nom : t('cotisations.pilote.nonInstalle', { nom: m.nom })}</option>
                ))}
              </select>
            </label>
          )}
          {pilote === 'modele' && installes.length === 0 && modeles.length > 0 && <p className="astuce">{t('cotisations.pilote.aucunInstalle')}</p>}
          <label><input type="radio" name="pilote" value="guidee" checked={pilote === 'guidee'} onChange={() => setPilote('guidee')} /> <span>{t('cotisations.pilote.guidee')}</span></label>
        </fieldset>
        {pilote === 'guidee' && (
        <label className="reglage">
          <input type="checkbox" checked={lectureIA} onChange={(e) => setLectureIA(e.target.checked)} />
          <span>{t('cotisations.lectureIA')}</span>
        </label>
        )}
      </section>

      <section className="panneau">
        <div className="panneau-entete">
          <h2>{t('cotisations.resultat.titre')}</h2>
        </div>
        {!dossier ? (
          <div className="vide">
            <p>{t('cotisations.resultat.vide')}</p>
          </div>
        ) : !s ? (
          <p className="astuce">{dossier.statut === 'a_traiter' ? t('cotisations.resultat.nonTraite') : t('cotisations.resultat.relancer')}</p>
        ) : s.erreur ? (
          <p className="erreur" role="alert">{t('cotisations.erreur')}</p>
        ) : (
          <div className="reponse resultat-cot">
            <p className="contexte-demande">{t('cotisations.resultat.contexte', { id: dossier.id, aidant: dossier.aidant, personne: dossier.personne_soignee })}</p>

            {(piloteModele || tours.length > 0) && (
              <>
                <h3 className="section-cot">{t('cotisations.pilote.toursTitre')}</h3>
                <ol className="tours-cot">
                  {tours.map((x, i) => (
                    <li key={i} className={x.accepte ? 'tour tour-accepte' : 'tour tour-refuse'}>
                      <span className={`pastille pastille-${x.accepte ? 'ok' : 'non'}`} role="img" aria-label={t(x.accepte ? 'cotisations.pilote.accepte' : 'cotisations.pilote.refuse')} title={t(x.accepte ? 'cotisations.pilote.accepte' : 'cotisations.pilote.refuse')} />
                      <div>
                        <strong>{x.outil}</strong> <small className="source-cot">{(x.duree_ms / 1000).toFixed(x.duree_ms < 10000 ? 1 : 0)} s</small>
                        {x.raison && <p className="raison-tour">{x.raison}</p>}
                        {!x.accepte && <p className="refus-tour">{t('cotisations.pilote.refuseGarde', { motif: x.resultat })}</p>}
                      </div>
                    </li>
                  ))}
                  {!termine && <li className="tour tour-courant"><span className="coche" aria-hidden="true">…</span>{t('cotisations.pilote.reflexion')}</li>}
                </ol>
              </>
            )}
            {r?.pilote?.mention && <p className="abandon-cot" role="status">{t('cotisations.pilote.abandon', { motif: r.pilote.abandon })}</p>}
            {r?.pilote?.mode === 'modele' && <p className="astuce">{t('cotisations.pilote.resume', { modele: r.pilote.modele, tours: r.pilote.tours, refus: r.pilote.refus })}{r.pilote.complete_par_le_code?.length > 0 && ` ${t('cotisations.pilote.completeParCode', { etapes: r.pilote.complete_par_le_code.join(', ') })}`}</p>}
            {avecEtapes && (<>
            <h3 className="section-cot">{t('cotisations.etapes.titre')}</h3>
            <ol className="etapes-cot">
              {ETAPES.map((e, i) => (
                <li key={e} className={i < fait ? 'fait' : i === fait && !termine ? 'courante' : ''}>
                  <span className="coche" aria-hidden="true">{i < fait ? '✓' : i === fait && !termine ? '…' : ''}</span>
                  {t(`cotisations.etapes.${e}`)}
                </li>
              ))}
            </ol>
            </>)}
            {s.lecture_ia === true && fait >= 2 && <p className="astuce">{t('cotisations.lectureIASimulee')}</p>}
            {s.lecture_ia?.demande && (
              <p className="astuce">
                {s.lecture_ia.utilise
                  ? t('cotisations.lecture.ia', { modele: s.lecture_ia.modele, lus: s.lecture_ia.lus, ecartes: s.lecture_ia.ecartes.length, duree: Math.round(s.lecture_ia.duree_ms / 1000) })
                  : t('cotisations.lecture.repli', { motif: s.lecture_ia.motif })}
                {s.lecture_ia.utilise && s.lecture_ia.differences?.length > 0 && ` ${t('cotisations.lecture.differences', { champs: s.lecture_ia.differences.map((c) => t(`cotisations.champs.${c}`)).join(', ') })}`}
              </p>
            )}

            {faitAff >= 2 && r && (
              <>
                <h3 className="section-cot">{t('cotisations.donnees.titre')}</h3>
                <table className="tableau-cot">
                  <thead><tr><th>{t('cotisations.donnees.champ')}</th><th>{t('cotisations.donnees.valeur')}</th><th>{t('cotisations.donnees.source')}</th></tr></thead>
                  <tbody>
                    {r.extraction.map((x) => (
                      <tr key={x.cle}><td>{t(`cotisations.champs.${x.cle}`)}</td><td>{x.valeur}</td><td className="source-cot">{x.source}</td></tr>
                    ))}
                    {faitAff >= 4 && r.caisse_lignes.map((x) => (
                      <tr key={x.cle}><td>{t(`cotisations.champs.${x.cle}`)}</td><td>{x.valeur}</td><td className="source-cot">{x.source}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {faitAff >= 3 && r && (
              r.controle.ok ? (
                <p className="confirmation-cot">{t('cotisations.donnees.controleOk')}</p>
              ) : (
                <div className="controle-cot">
                  <p>{t('cotisations.donnees.controleErreurs')}</p>
                  <ul>{r.controle.erreurs.map((e) => <li key={`${e.champ}-${e.motif}`}>{e.message}</li>)}</ul>
                </div>
              )
            )}

            {faitAff >= 5 && r && (
              <>
                <h3 className="section-cot">{t('cotisations.regles.titre')}</h3>
                <table className="tableau-cot tableau-regles">
                  <thead><tr><th>{t('cotisations.regles.regle')}</th><th>{t('cotisations.regles.statut')}</th><th>{t('cotisations.regles.valeur')}</th><th>{t('cotisations.regles.paragraphe')}</th></tr></thead>
                  <tbody>
                    {r.regles.map((x, i) => (
                      <tr key={`${x.regle}-${x.champ ?? i}`}>
                        <td><strong>{x.regle === 'ECART' ? t(`cotisations.regles.ecarts.${x.champ}`) : x.regle}</strong>{x.regle !== 'ECART' && <><br /><small>{x.libelle}</small></>}</td>
                        <td><Pastille statut={x.statut} /></td>
                        <td>{x.valeur}<br /><small className="source-cot">{x.source}</small></td>
                        <td className="source-cot">{x.paragraphe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {faitAff >= 6 && r && (
              <>
                <h3 className="section-cot">{t('cotisations.calcul.titre')}</h3>
                {r.calcul ? (
                  <>
                    <ol className="protocole-cot">{r.calcul.protocole.map((l) => <li key={l}>{l}</li>)}</ol>
                  </>
                ) : (
                  <p className="astuce">{r.calcul_motif === 'donnees_a_verifier' ? t('cotisations.calcul.donneesAVerifier') : t('cotisations.calcul.pasDeCalcul')}</p>
                )}
              </>
            )}

            {faitAff >= 7 && r && (
              <>
                <h3 className="section-cot">{t('cotisations.declaration.titre')}</h3>
                {r.declaration ? (
                  <>
                    <table className="tableau-cot">
                      <tbody>
                        {r.declaration.map((x) => (
                          <tr key={x.cle}><td>{t(`cotisations.declaration.champs.${x.cle}`)}</td><td>{x.valeur || '—'}</td><td className="source-cot">{x.source}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {r.provisoire && <p className="astuce">{t('cotisations.declaration.provisoire')}</p>}
                  </>
                ) : (
                  <p className="astuce">{t('cotisations.declaration.aucune')}</p>
                )}
              </>
            )}

            {termine && r && r.motifs.length > 0 && (
              <div className="exception-cot" role="alert">
                <h3>{t('cotisations.exception.titre')}</h3>
                <ul>{r.motifs.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="astuce">{t('cotisations.exception.aide')}</p>
              </div>
            )}

            {termine && r?.pilote?.mode === 'modele' && (
              <div className="compte-rendu-cot">
                <h3 className="section-cot">{t('cotisations.pilote.compteRendu')}</h3>
                {r.pilote.compte_rendu ? <p>{r.pilote.compte_rendu}</p> : <p className="astuce">{t('cotisations.pilote.aucunCompteRendu')}</p>}
                {r.pilote.contradictions?.length > 0 && (
                  <p className="contradiction-cot" role="alert">{t('cotisations.pilote.contradiction', { liste: r.pilote.contradictions.join(' ; ') })}</p>
                )}
                {r.revue_agent && <p className="astuce">{t('cotisations.pilote.revue', { motif: r.revue_agent.motif })}</p>}
              </div>
            )}

            {termine && r && (
              <div className="decision-cot">
                <h3 className="section-cot">{t('cotisations.decision.titre')}</h3>
                {decide ? (
                  <p className="confirmation-cot" role="status">
                    {dossier.statut === 'valide' ? t('cotisations.decision.validee') : t('cotisations.decision.refusee', { motif: decisions[dossier.id]?.motif ?? s.decision?.motif ?? '' })}
                  </p>
                ) : (
                  <>
                    {dossier.statut === 'exception' && (
                      <label className="champ-motif">
                        <span>{t('cotisations.decision.motif')}</span>
                        <textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t('cotisations.decision.motifPlaceholder')} />
                      </label>
                    )}
                    <div className="boutons-decision">
                      <button type="button" className="bouton-principal" disabled={!enAttente || dossier.statut !== 'pret_a_valider' || enDecision} onClick={() => decider(dossier.id, 'valider')}>
                        {t('cotisations.decision.valider')}
                      </button>
                      <button type="button" className="bouton-secondaire" disabled={!enAttente || dossier.revue || enDecision} onClick={() => decider(dossier.id, 'revue')}>
                        {t('cotisations.decision.revue')}
                      </button>
                      <button type="button" className="bouton-refus" disabled={!enAttente || dossier.statut !== 'exception' || !motif.trim() || enDecision} onClick={() => decider(dossier.id, 'refuser')}>
                        {t('cotisations.decision.refuser')}
                      </button>
                    </div>
                    <p className="astuce">{dossier.statut === 'exception' ? t('cotisations.decision.aideRefuser') : t('cotisations.decision.aideValider')}</p>
                    {dossier.revue && <p className="confirmation-cot" role="status">{t('cotisations.decision.revueCreee')}</p>}
                  </>
                )}
                {erreurDecision && <p className="erreur" role="alert">{t('cotisations.decision.erreur')}</p>}
              </div>
            )}
          </div>
        )}
        <p className="rappel-cot">{t('cotisations.rappel')}</p>
      </section>
    </>
  );
}
