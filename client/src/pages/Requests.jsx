import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAction, useApp, useLoad } from '../app.jsx';
import {
  ErrorNote, Field, Loading, PersonLine, RequestTitle, SafetyReminder, Stars, StatusBadge, Steps, UrgencyBadge, VerifiedBadge,
} from '../components.jsx';

export function NewRequest() {
  const { t, meta, doc, country, language, user } = useApp();
  const navigate = useNavigate();
  const action = useAction();
  const [form, setForm] = useState({
    docType: '', country: '', region: '', city: '', details: '', urgency: 'normal',
    language: user.languages[0] || (user.locale === 'pt' ? 'pt' : 'es'), thanks: '',
  });
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      const { request } = await post('/requests', form);
      navigate(`/requests/${request.id}`, { replace: true });
    });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>{t('req.new_title')}</h1>
      <p className="muted">{t('req.new_intro')}</p>

      <Field label={t('req.doc_type')}>
        <select required value={form.docType} onChange={set('docType')}>
          <option value="" disabled>{t('common.choose')}</option>
          {meta.docTypes.map((code) => <option key={code} value={code}>{doc(code)}</option>)}
        </select>
      </Field>
      <Field label={t('req.country')}>
        <select required value={form.country} onChange={set('country')}>
          <option value="" disabled>{t('common.choose')}</option>
          {[...meta.countries].sort((a, b) => country(a).localeCompare(country(b))).map((code) => (
            <option key={code} value={code}>{country(code)}</option>
          ))}
        </select>
      </Field>
      <div className="two">
        <Field label={t('req.city')} hint={t('req.city_hint')}>
          <input required minLength={2} maxLength={80} value={form.city} onChange={set('city')} />
        </Field>
        <Field label={t('req.region')}>
          <input maxLength={80} value={form.region} onChange={set('region')} />
        </Field>
      </div>

      <fieldset className="field">
        <legend className="field-label">{t('req.urgency')}</legend>
        <div className="segmented">
          {meta.urgencies.map((code) => (
            <label key={code} className={form.urgency === code ? 'on' : ''}>
              <input type="radio" name="urgency" value={code} checked={form.urgency === code} onChange={set('urgency')} />
              {t(`urgency.${code}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={t('req.language')}>
        <select value={form.language} onChange={set('language')}>
          {meta.languages.map((code) => <option key={code} value={code}>{language(code)}</option>)}
        </select>
      </Field>
      <Field label={t('req.details')} hint={t('req.details_hint')}>
        <textarea rows={4} maxLength={1500} value={form.details} onChange={set('details')} />
      </Field>
      <Field label={t('req.thanks')} hint={t('req.thanks_hint')}>
        <input maxLength={200} value={form.thanks} onChange={set('thanks')} />
      </Field>

      <ErrorNote error={action.error} />
      <button className="btn accent wide" disabled={action.busy}>{t('req.post')}</button>
    </form>
  );
}

function RequestFacts({ request }) {
  const { t, language, date } = useApp();
  return (
    <dl className="facts">
      {request.region && (<><dt>{t('req.region')}</dt><dd>{request.region}</dd></>)}
      <dt>{t('req.urgency')}</dt><dd>{t(`urgency.${request.urgency}`)}</dd>
      <dt>{t('req.language')}</dt><dd>{language(request.language)}</dd>
      <dt>{t('req.posted')}</dt><dd>{date(request.createdAt)}</dd>
      {request.thanks && (<><dt>{t('req.thanks')}</dt><dd>{request.thanks}</dd></>)}
      {request.details && (<><dt>{t('req.details')}</dt><dd className="pre">{request.details}</dd></>)}
    </dl>
  );
}

const REASON_ORDER = ['same_city', 'same_region', 'expertise', 'language', 'top_rated', 'experienced'];

function MatchCard({ match, onAsk, onSkip, busy }) {
  const { t, country, doc } = useApp();
  const { helper } = match;
  return (
    <article className="card match">
      <div className="row">
        <PersonLine person={helper} />
        <VerifiedBadge verified={helper.verified} />
      </div>
      <div className="row">
        <Stars rating={helper.rating} count={helper.reviewCount} />
        {helper.completedCount > 0 && <span className="muted small-text">{t('profile.completed', { count: String(helper.completedCount) })}</span>}
      </div>
      <ul className="chips" aria-label={t('match.why')}>
        {REASON_ORDER.filter((reason) => match.reasons.includes(reason)).map((reason) => (
          <li key={reason}>{t(`match.${reason}`, { city: helper.helperCity, country: country(helper.helperCountry) })}</li>
        ))}
      </ul>
      {helper.bio && <p>{helper.bio}</p>}
      {helper.expertise.length > 0 && <p className="muted small-text">{t('profile.expertise')}: {helper.expertise.map(doc).join(', ')}</p>}
      <div className="actions">
        <button className="btn ghost" onClick={onSkip} disabled={busy}>{t('match.skip')}</button>
        <button className="btn accent" onClick={onAsk} disabled={busy}>{t('match.ask')}</button>
      </div>
    </article>
  );
}

function SeekerView({ data, reload }) {
  const { t, meta } = useApp();
  const navigate = useNavigate();
  const action = useAction();
  const [skipped, setSkipped] = useState([]);
  const { request, threads } = data;
  const matches = useLoad(() => (request.status === 'open' ? api(`/requests/${request.id}/matches`) : Promise.resolve({ matches: [] })), [request.id, request.status]);
  const activeThread = threads.find((thread) => thread.status === 'accepted' && thread.helper.id === request.helperId);

  const ask = (helperId) => action.run(async () => {
    const { threadId } = await post(`/requests/${request.id}/threads`, { helperId });
    navigate(`/chats/${threadId}`);
  });
  const cancel = () => window.confirm(t('req.cancel_confirm')) && action.run(async () => {
    await post(`/requests/${request.id}/cancel`);
    await reload();
  });
  const complete = () => window.confirm(t('req.received_confirm')) && action.run(async () => {
    await post(`/requests/${request.id}/complete`);
    navigate(`/chats/${activeThread.id}`);
  });

  return (
    <>
      {request.status === 'matched' && activeThread && (
        <section className="card">
          <h2>{t('req.your_amigo')}</h2>
          <PersonLine person={activeThread.helper} />
          <Steps step={request.step} />
          <div className="actions">
            <Link className="btn" to={`/chats/${activeThread.id}`}>{t('chat.open')}</Link>
            <button className="btn accent" onClick={complete} disabled={action.busy}>{t('req.received')}</button>
          </div>
        </section>
      )}

      {threads.length > 0 && (
        <section>
          <h2>{t('req.conversations')}</h2>
          {threads.map((thread) => (
            <Link key={thread.id} to={`/chats/${thread.id}`} className="card link-card">
              <div className="row">
                <span><strong>{thread.helper.name}</strong> {thread.helper.verified && <span className="badge ok">✓</span>}</span>
                <StatusBadge status={thread.status} />
              </div>
            </Link>
          ))}
        </section>
      )}

      {request.status === 'open' && (
        <section>
          <h2>{t('match.title')}</h2>
          <SafetyReminder />
          <Loading state={matches}>
            {({ matches: list }) => {
              const visible = list.filter((match) => !skipped.includes(match.helper.id));
              if (visible.length === 0) {
                return (
                  <p className="note info">
                    {t(list.length ? 'match.none_left' : meta.requireVerifiedHelpers ? 'match.none_verified' : 'match.none')}
                    {skipped.length > 0 && <> <button className="linklike" onClick={() => setSkipped([])}>{t('match.show_again')}</button></>}
                  </p>
                );
              }
              return visible.map((match) => (
                <MatchCard
                  key={match.helper.id}
                  match={match}
                  busy={action.busy}
                  onAsk={() => ask(match.helper.id)}
                  onSkip={() => setSkipped([...skipped, match.helper.id])}
                />
              ));
            }}
          </Loading>
        </section>
      )}

      <ErrorNote error={action.error} />
      {['open', 'matched'].includes(request.status) && (
        <button className="btn ghost danger" onClick={cancel} disabled={action.busy}>{t('req.cancel')}</button>
      )}
    </>
  );
}

function HelperView({ data }) {
  const { t } = useApp();
  const navigate = useNavigate();
  const action = useAction();
  const [message, setMessage] = useState('');
  const { request, myThreadId } = data;

  if (myThreadId) return <Link className="btn accent wide" to={`/chats/${myThreadId}`}>{t('chat.open')}</Link>;
  const offer = (e) => {
    e.preventDefault();
    action.run(async () => {
      const { threadId } = await post(`/requests/${request.id}/threads`, message.trim() ? { message } : {});
      navigate(`/chats/${threadId}`);
    });
  };
  return (
    <form className="card" onSubmit={offer}>
      <h2>{t('help.offer_title')}</h2>
      <p className="muted">{t('help.offer_intro')}</p>
      <Field label={t('help.offer_message')}>
        <textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <button className="btn accent wide" disabled={action.busy}>{t('help.offer')}</button>
    </form>
  );
}

export function RequestDetail() {
  const { id } = useParams();
  const state = useLoad(() => api(`/requests/${id}`), [id]);
  return (
    <Loading state={state}>
      {(data) => (
        <>
          <section className="card">
            <div className="row">
              <h1 className="tight"><RequestTitle request={data.request} /></h1>
              <StatusBadge status={data.request.status} />
            </div>
            <RequestFacts request={data.request} />
          </section>
          {data.role === 'seeker' ? <SeekerView data={data} reload={state.reload} /> : <HelperView data={data} />}
        </>
      )}
    </Loading>
  );
}

// Open requests a helper could take on.
export function Browse() {
  const { t, user } = useApp();
  const state = useLoad(() => api('/requests/open'));
  return (
    <>
      <h1>{t('help.title')}</h1>
      <Loading state={state}>
        {({ requests, blocked }) => {
          if (blocked === 'helper_profile') {
            return (
              <div className="card">
                <p>{t('help.need_profile')}</p>
                <Link className="btn accent" to="/profile?helper=1">{t('help.become')}</Link>
              </div>
            );
          }
          if (blocked === 'verification') {
            return (
              <div className="card">
                <p>{t(`help.blocked_${user.verification}`)}</p>
                <Link className="btn" to="/profile">{t('home.verify_link')}</Link>
              </div>
            );
          }
          if (requests.length === 0) return <p className="muted">{t('help.none')}</p>;
          return (
            <>
              <p className="muted">{t('help.intro')}</p>
              {requests.map((request) => (
                <Link key={request.id} to={request.myThreadId ? `/chats/${request.myThreadId}` : `/requests/${request.id}`} className="card link-card">
                  <div className="row">
                    <div><RequestTitle request={request} /></div>
                    <span>
                      <UrgencyBadge urgency={request.urgency} /> {request.sameCity && <span className="badge ok">{t('help.your_city')}</span>}
                    </span>
                  </div>
                  {request.thanks && <div className="muted">{t('req.thanks')}: {request.thanks}</div>}
                  {request.myThreadId && <div className="muted">{t('help.in_conversation')}</div>}
                </Link>
              ))}
            </>
          );
        }}
      </Loading>
    </>
  );
}
