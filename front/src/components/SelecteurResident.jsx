import { t } from '../i18n';
import residents from '../mock/residents.json';

export function libelleResident(r) {
  return `${r.civilite} ${r.nom}`;
}

// Libellé complet pour la liste : prénom et date de naissance lèvent le doute entre homonymes.
function libelleListe(r) {
  const [a, m, j] = r.naissance.split('-');
  return `${r.civilite} ${r.prenom} ${r.nom} (${j}.${m}.${a})`;
}

export function trouverResident(chambre) {
  return residents.find((r) => r.chambre === chambre);
}

// Liste déroulante chambre / résident, commune aux deux modes.
export default function SelecteurResident({ valeur, onChange, obligatoire = false }) {
  return (
    <label className="champ">
      <span className="champ-label">
        {t('resident.label')}
        {obligatoire && <span className="obligatoire"> {t('resident.obligatoire')}</span>}
      </span>
      <select value={valeur} onChange={(e) => onChange(e.target.value)} required={obligatoire}>
        <option value="">{t('resident.placeholder')}</option>
        {residents.map((r) => (
          <option key={r.chambre} value={r.chambre}>
            {t('resident.option', { chambre: r.chambre, resident: libelleListe(r) })}
          </option>
        ))}
      </select>
    </label>
  );
}
