import { t } from '../i18n';
import PhrasesRetirees from './PhrasesRetirees.jsx';

export function heure(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Ein Alarm: Sensoralarm (codierte Fakten sofort, Kontext des KI-Assistenten danach) oder Dokumentmeldung
// (eingegangenes Schreiben: Widerspruch, nicht zugeordnetes Schreiben, nichts zu melden; Neuigkeit aus der ePA).
export function CarteAlarme({ alarme: a, onAcquitter, onOuvrir }) {
  const f = a.faits ?? {};
  const c = a.contexte ?? { statut: 'aucun' };
  const document = a.type === 'document';
  const gravite = document ? f.gravite ?? 'attention' : 'rouge';
  const titre = document
    ? `${a.libelle}${f.resident ? ` – ${f.resident}` : ''}${a.chambre ? ` – ${t('alarmes.chambre', { chambre: a.chambre })}` : ''}`
    : `${t('alarmes.entete', { libelle: a.libelle, chambre: a.chambre })}${f.resident ? ` – ${f.resident}` : ''}`;
  return (
    <article className={`alarme-capteur alarme-${gravite}`}>
      <header>
        <h2>{titre}</h2>
        <span className="alarme-heure">{heure(a.recue_le)}</span>
        {document && a.chambre && onOuvrir && f.courrier?.ref && (
          <button type="button" className="bouton-acquitter" onClick={() => onOuvrir(a)}>{t('alarmes.ouvrirVerification')}</button>
        )}
        <button type="button" className="bouton-acquitter" onClick={() => onAcquitter(a.id)}>{t('alarmes.acquitter')}</button>
      </header>
      {document && f.courrier && <p className="alarme-courrier">{t('alarmes.courrier', { titre: f.courrier.titre, expediteur: f.courrier.expediteur })}</p>}
      {f.contradictions?.length > 0 && (
        <dl className="alarme-faits"><dt>{t('alarmes.contradictions')}</dt><dd><ul>{f.contradictions.map((x, k) => <li key={k}>{x}</li>)}</ul></dd></dl>
      )}
      {f.avertissement && <p>{f.avertissement}</p>}
      {f.resident && !document && (
        <dl className="alarme-faits">
          {f.risques?.length > 0 && (<><dt>{t('alarmes.risques')}</dt><dd>{f.risques.join(' ; ')}</dd></>)}
          {f.allergies?.length > 0 && (<><dt>{t('alarmes.allergies')}</dt><dd>{f.allergies.join(' ; ')}</dd></>)}
          {f.medication_a_risque?.length > 0 && (
            <><dt>{t('alarmes.medication')}</dt><dd>{f.medication_a_risque.map((m) => `${m.medicaments.join(', ')} (${m.libelle})`).join(' ; ')}</dd></>
          )}
        </dl>
      )}
      {f.source && <p className="alarme-source">[{f.source}]</p>}
      {!document && (
        <div className="alarme-contexte">
          {c.statut === 'en_cours' && <p className="analyse-en-cours" role="status">{t('alarmes.contexteEnCours')}</p>}
          {c.statut === 'differe' && <p className="astuce">{t('alarmes.contexteDiffere')}</p>}
          {c.statut === 'indisponible' && <p className="astuce">{t('alarmes.contexteIndisponible')}</p>}
          {c.statut === 'pret' && (
            <>
              <h3>{t('alarmes.contexte')}</h3>
              <p className="alarme-texte">{c.texte}</p>
              <PhrasesRetirees liste={c.retirees} />
            </>
          )}
        </div>
      )}
    </article>
  );
}
// ROTES Banner oben auf den Arbeitsseiten: Ein Alarm bleibt angezeigt, bis eine Pflegekraft ihn quittiert.
export default function AlarmesCapteurs({ alarmes, onAcquitter, onOuvrir, onVoirTout }) {
  if (!alarmes.length) return null;
  return (
    <section className="alarmes-capteurs" aria-label={t('alarmes.titre')} role="alert">
      {alarmes.map((a) => <CarteAlarme key={a.id} alarme={a} onAcquitter={onAcquitter} onOuvrir={onOuvrir} />)}
      {onVoirTout && <button type="button" className="lien-bouton alarmes-voir-tout" onClick={onVoirTout}>{t('alarmes.voirPage')}</button>}
    </section>
  );
}