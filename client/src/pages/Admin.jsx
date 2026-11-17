import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAction, useApp, useLoad } from '../app.jsx';
import { ErrorNote, Field, Loading } from '../components.jsx';

function GuideManager() {
  const { t, meta, country, doc } = useApp();
  const guides = useLoad(() => api('/guides'));
  const action = useAction();
  const empty = { title: '', body: '', language: 'es', country: '', docType: '', sourceUrl: '' };
  const [form, setForm] = useState(empty);
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  const add = (e) => {
    e.preventDefault();
    action.run(async () => {
      await post('/admin/guides', { ...form, country: form.country || null, docType: form.docType || null });
      setForm(empty);
      await guides.reload();
    });
  };
  const remove = (id) => window.confirm(t('admin.delete_guide_confirm')) && action.run(async () => {
    await api(`/admin/guides/${id}`, { method: 'DELETE' });
    await guides.reload();
  });

  return (
    <section>
      <h2>{t('guides.title')}</h2>
      <Loading state={guides}>
        {(data) => data.guides.map((guide) => (
          <div key={guide.id} className="card row">
            <span><strong>{guide.title}</strong> <span className="muted">({guide.language})</span></span>
            <button className="linklike danger" onClick={() => remove(guide.id)}>{t('common.delete')}</button>
          </div>
        ))}
      </Loading>
      <form className="card" onSubmit={add}>
        <h3>{t('admin.add_guide')}</h3>
        <p className="muted small-text">{t('admin.guide_hint')}</p>
        <Field label={t('admin.guide_title')}><input required minLength={3} maxLength={140} value={form.title} onChange={set('title')} /></Field>
        <Field label={t('admin.guide_body')}><textarea required rows={6} minLength={10} maxLength={6000} value={form.body} onChange={set('body')} /></Field>
        <div className="two">
          <Field label={t('common.language')}>
            <select value={form.language} onChange={set('language')}>
              <option value="es">Español</option><option value="en">English</option><option value="pt">Português</option>
            </select>
          </Field>
          <Field label={t('req.country')}>
            <select value={form.country} onChange={set('country')}>
              <option value="">{t('admin.any')}</option>
              {meta.countries.map((code) => <option key={code} value={code}>{country(code)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('req.doc_type')}>
          <select value={form.docType} onChange={set('docType')}>
            <option value="">{t('admin.any')}</option>
            {meta.docTypes.map((code) => <option key={code} value={code}>{doc(code)}</option>)}
          </select>
        </Field>
        <Field label={t('admin.guide_source')}><input type="url" maxLength={500} placeholder="https://" value={form.sourceUrl} onChange={set('sourceUrl')} /></Field>
        <ErrorNote error={action.error} />
        <button className="btn" disabled={action.busy}>{t('admin.add_guide')}</button>
      </form>
    </section>
  );
}

export function Admin() {
  const { t, user, country, date } = useApp();
  const state = useLoad(() => api('/admin/overview'));
  const action = useAction();
  if (!user.isAdmin) return <Navigate to="/" replace />;

  const act = (path, body) => action.run(async () => {
    await post(path, body);
    await state.reload();
  });

  return (
    <>
      <h1>{t('nav.admin')}</h1>
      <ErrorNote error={action.error} />
      <Loading state={state}>
        {({ counts, pendingVerifications, reports }) => (
          <>
            <dl className="stat-grid">
              {Object.entries(counts).map(([key, value]) => (
                <div key={key} className="card"><dt>{t(`admin.count_${key}`)}</dt><dd>{value}</dd></div>
              ))}
            </dl>

            <section>
              <h2>{t('admin.verifications')} ({pendingVerifications.length})</h2>
              <p className="muted small-text">{t('admin.verify_hint')}</p>
              {pendingVerifications.length === 0 && <p className="muted">{t('admin.nothing')}</p>}
              {pendingVerifications.map((person) => (
                <article key={person.id} className="card">
                  <div><Link to={`/people/${person.id}`}><strong>{person.name}</strong></Link> · {person.email}</div>
                  <div className="muted">{person.helperCity}, {country(person.helperCountry)}</div>
                  <p className="pre quote">{person.note}</p>
                  <div className="actions">
                    <button className="btn ghost" disabled={action.busy} onClick={() => act(`/admin/users/${person.id}/verification`, { decision: 'rejected' })}>{t('admin.reject')}</button>
                    <button className="btn accent" disabled={action.busy} onClick={() => act(`/admin/users/${person.id}/verification`, { decision: 'verified' })}>{t('admin.approve')}</button>
                  </div>
                </article>
              ))}
            </section>

            <section>
              <h2>{t('admin.reports')} ({reports.length})</h2>
              {reports.length === 0 && <p className="muted">{t('admin.nothing')}</p>}
              {reports.map((report) => (
                <article key={report.id} className="card">
                  <div className="row">
                    <strong>{t(`report.${report.reason}`)}</strong>
                    <span className="muted small-text">{date(report.createdAt)}</span>
                  </div>
                  <div>
                    {t('admin.reported')}: <Link to={`/people/${report.reportedId}`}>{report.reportedName}</Link> · {report.reportedEmail}
                    {report.reportedStatus === 'suspended' && <span className="badge danger"> {t('admin.suspended')}</span>}
                  </div>
                  <div className="muted">{t('admin.reported_by')}: {report.reporterName}</div>
                  {report.details && <p className="pre quote">{report.details}</p>}
                  <div className="actions">
                    {report.reportedStatus === 'active'
                      ? <button className="btn danger-solid" disabled={action.busy} onClick={() => act(`/admin/users/${report.reportedId}/status`, { status: 'suspended' })}>{t('admin.suspend')}</button>
                      : <button className="btn ghost" disabled={action.busy} onClick={() => act(`/admin/users/${report.reportedId}/status`, { status: 'active' })}>{t('admin.reinstate')}</button>}
                    <button className="btn" disabled={action.busy} onClick={() => act(`/admin/reports/${report.id}/resolve`)}>{t('admin.resolve')}</button>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </Loading>
      <GuideManager />
    </>
  );
}
