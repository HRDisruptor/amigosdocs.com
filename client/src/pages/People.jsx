import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, post } from '../api.js';
import { profileBody, useAction, useApp, useLoad } from '../app.jsx';
import { ErrorNote, Field, Loading, Stars, VerifiedBadge } from '../components.jsx';

function CheckGroup({ legend, options, label, value, onChange }) {
  const toggle = (code) => onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
  return (
    <fieldset className="field">
      <legend className="field-label">{legend}</legend>
      <div className="check-grid">
        {options.map((code) => (
          <label key={code} className="check">
            <input type="checkbox" checked={value.includes(code)} onChange={() => toggle(code)} />
            <span>{label(code)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Verification() {
  const { t, user, setUser } = useApp();
  const action = useAction();
  const [note, setNote] = useState(user.verificationNote || '');
  const submit = (e) => {
    e.preventDefault();
    action.run(async () => setUser((await post('/me/verification', { note })).user));
  };

  if (user.verification === 'verified') return <p className="note ok">✓ {t('verify.verified')}</p>;
  if (user.verification === 'pending') return <p className="note info">{t('verify.pending')}</p>;
  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('verify.title')}</h2>
      <p>{t('verify.intro')}</p>
      {user.verification === 'rejected' && <p className="note warn">{t('verify.rejected')}</p>}
      <Field label={t('verify.note')} hint={t('verify.note_hint')}>
        <textarea rows={3} required minLength={10} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <button className="btn accent" disabled={action.busy}>{t('verify.send')}</button>
    </form>
  );
}

export function EditProfile() {
  const { t, user, setUser, meta, country, doc, language } = useApp();
  const [params] = useSearchParams();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => profileBody(user, params.get('helper') ? { isHelper: true } : {}));
  const set = (name) => (e) => {
    setSaved(false);
    setForm({ ...form, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  };
  const setValue = (name) => (value) => {
    setSaved(false);
    setForm({ ...form, [name]: value });
  };

  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      const body = { ...form, helperCountry: form.helperCountry || null };
      setUser((await api('/me', { method: 'PATCH', body })).user);
      setSaved(true);
    });
  };

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h1>{t('profile.edit_title')}</h1>
        <Field label={t('auth.name')} hint={t('auth.name_hint')}>
          <input required minLength={2} maxLength={80} value={form.name} onChange={set('name')} />
        </Field>
        <div className="two">
          <Field label={t('profile.residence_country')}>
            <input maxLength={60} value={form.residenceCountry} onChange={set('residenceCountry')} />
          </Field>
          <Field label={t('profile.residence_city')}>
            <input maxLength={80} value={form.residenceCity} onChange={set('residenceCity')} />
          </Field>
        </div>
        <CheckGroup legend={t('profile.languages')} options={meta.languages} label={language} value={form.languages} onChange={setValue('languages')} />
        <Field label={t('profile.bio')} hint={t('profile.bio_hint')}>
          <textarea rows={3} maxLength={600} value={form.bio} onChange={set('bio')} />
        </Field>

        <label className="check big-check">
          <input type="checkbox" checked={form.isHelper} onChange={set('isHelper')} />
          <span><strong>{t('profile.is_helper')}</strong><br /><span className="muted">{t('profile.is_helper_hint')}</span></span>
        </label>

        {form.isHelper && (
          <div className="subform">
            <Field label={t('profile.helper_country')}>
              <select required value={form.helperCountry || ''} onChange={set('helperCountry')}>
                <option value="" disabled>{t('common.choose')}</option>
                {[...meta.countries].sort((a, b) => country(a).localeCompare(country(b))).map((code) => (
                  <option key={code} value={code}>{country(code)}</option>
                ))}
              </select>
            </Field>
            <div className="two">
              <Field label={t('profile.helper_city')} hint={t('profile.helper_city_hint')}>
                <input required maxLength={80} value={form.helperCity} onChange={set('helperCity')} />
              </Field>
              <Field label={t('req.region')}>
                <input maxLength={80} value={form.helperRegion} onChange={set('helperRegion')} />
              </Field>
            </div>
            <CheckGroup legend={t('profile.expertise')} options={meta.docTypes} label={doc} value={form.expertise} onChange={setValue('expertise')} />
            <label className="check">
              <input type="checkbox" checked={form.available} onChange={set('available')} />
              <span>{t('profile.available')}</span>
            </label>
          </div>
        )}

        <ErrorNote error={action.error} />
        {saved && <p className="note ok" role="status">{t('common.saved')}</p>}
        <button className="btn accent wide" disabled={action.busy}>{t('common.save')}</button>
      </form>

      {user.isHelper && <Verification />}
    </>
  );
}

// What other members see about a person.
export function Person() {
  const { id } = useParams();
  const { t, country, doc, language, date } = useApp();
  const state = useLoad(() => api(`/users/${id}`), [id]);
  return (
    <Loading state={state}>
      {({ user: person, reviews }) => (
        <>
          <section className="card">
            <div className="row">
              <h1 className="tight">{person.name}</h1>
              {person.isHelper && <VerifiedBadge verified={person.verified} />}
            </div>
            {person.isHelper && person.helperCity && <p className="muted">{person.helperCity}{person.helperRegion ? `, ${person.helperRegion}` : ''}, {country(person.helperCountry)}</p>}
            <p><Stars rating={person.rating} count={person.reviewCount} /></p>
            {person.bio && <p>{person.bio}</p>}
            <dl className="facts">
              {person.languages.length > 0 && (<><dt>{t('profile.languages')}</dt><dd>{person.languages.map(language).join(', ')}</dd></>)}
              {person.expertise.length > 0 && (<><dt>{t('profile.expertise')}</dt><dd>{person.expertise.map(doc).join(', ')}</dd></>)}
              {person.completedCount > 0 && (<><dt>{t('profile.completed_label')}</dt><dd>{person.completedCount}</dd></>)}
              <dt>{t('profile.member_since')}</dt><dd>{date(person.memberSince)}</dd>
            </dl>
          </section>
          <section>
            <h2>{t('profile.reviews')}</h2>
            {reviews.length === 0 && <p className="muted">{t('profile.no_reviews')}</p>}
            {reviews.map((review, index) => (
              <article key={index} className="card">
                <div className="row">
                  <span className="stars" aria-label={`${review.rating} / 5`}>{'★'.repeat(review.rating)}<span className="muted">{'★'.repeat(5 - review.rating)}</span></span>
                  <span className="muted small-text">{doc(review.docType)} · {date(review.createdAt)}</span>
                </div>
                {review.comment && <p>{review.comment}</p>}
              </article>
            ))}
          </section>
        </>
      )}
    </Loading>
  );
}
