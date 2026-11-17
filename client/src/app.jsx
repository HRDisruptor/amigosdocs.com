import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { STRINGS } from './strings.js';

const LOCALES = ['es', 'en', 'pt'];

// Each language is shown under its own name, whatever the interface language is.
export const LANGUAGE_NAMES = {
  es: 'Español', pt: 'Português', en: 'English', qu: 'Runasimi (Quechua)', gn: 'Avañe’ẽ (Guaraní)',
  ay: 'Aymar aru (Aymara)', quc: 'K’iche’', mam: 'Mam',
};

function initialLocale() {
  try {
    const saved = localStorage.getItem('amigodocs-locale');
    if (LOCALES.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable in private windows. The browser language is used instead.
  }
  const browser = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return LOCALES.includes(browser) ? browser : 'es';
}

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// The fields PATCH /me expects, taken from the current account.
export function profileBody(user, changes = {}) {
  return {
    name: user.name, locale: user.locale, residenceCountry: user.residenceCountry, residenceCity: user.residenceCity,
    languages: user.languages, bio: user.bio, isHelper: user.isHelper, helperCountry: user.helperCountry,
    helperRegion: user.helperRegion, helperCity: user.helperCity, expertise: user.expertise, available: user.available,
    ...changes,
  };
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined while loading, null when signed out
  const [meta, setMeta] = useState(null);
  const [failed, setFailed] = useState(false);
  const [guestLocale, setGuestLocale] = useState(initialLocale);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api('/auth/me'), api('/meta')])
      .then(([me, metaData]) => {
        setUser(me.user);
        setMeta(metaData);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const locale = user?.locale || guestLocale;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => {
    const table = STRINGS[locale] || STRINGS.en;
    const t = (key, vars) => {
      let textValue = table[key] ?? STRINGS.en[key] ?? key;
      if (vars) for (const [name, replacement] of Object.entries(vars)) textValue = textValue.replaceAll(`{${name}}`, replacement);
      return textValue;
    };
    const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

    return {
      user,
      setUser,
      meta,
      locale,
      t,
      country: (code) => (code ? regionNames.of(code) : ''),
      doc: (code) => t(`doc.${code}`),
      language: (code) => LANGUAGE_NAMES[code] || code,
      date: (value) => dateFormat.format(new Date(value)),
      dateTime: (value) => timeFormat.format(new Date(value)),
      errorText: (error) => (error ? (table[`err.${error.code}`] ?? STRINGS.en[`err.${error.code}`] ?? t('err.server_error')) : ''),
      async setLocale(next) {
        try {
          localStorage.setItem('amigodocs-locale', next);
        } catch {
          // Not being able to remember the choice is harmless.
        }
        setGuestLocale(next);
        if (user) {
          const result = await api('/me', { method: 'PATCH', body: profileBody(user, { locale: next }) });
          setUser(result.user);
        }
      },
    };
  }, [user, meta, locale]);

  if (failed) {
    return (
      <div className="page center">
        <p>{value.t('err.offline')}</p>
        <button className="btn" onClick={load}>{value.t('common.retry')}</button>
      </div>
    );
  }
  if (user === undefined || !meta) return <div className="page center muted" aria-busy="true">AmigoDocs…</div>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Loads data for a page and exposes loading, error, and reload.
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);
  const reload = useCallback(
    () => run().then((data) => setState({ data, error: null, loading: false })).catch((error) => setState((s) => ({ ...s, error, loading: false }))),
    [run],
  );
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [reload]);
  return { ...state, reload };
}

// Runs an action from a button or form, tracking "busy" and the last error.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (action) => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
