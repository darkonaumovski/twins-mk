import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { TextInput } from '@/components/ui';
import { canCheckPassword, checkPassword } from './password';

/** After this long in the background (or closed), the app asks for the password again. */
export const RELOCK_AFTER_MS = 5 * 60_000;
const ACTIVE_KEY = 'twinsmk.lock.activeAt';

function readActiveAt(): number {
  try {
    return Number(sessionStorage.getItem(ACTIVE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function markActive() {
  try {
    sessionStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {
    /* without storage the app simply locks on every start */
  }
}

/** Unlocked if this tab was in use moments ago (e.g. reloaded for an update), otherwise locked. */
function startsLocked() {
  if (!canCheckPassword()) {
    // Only plain-http development (e.g. a phone on the dev server's LAN address) lacks WebCrypto.
    if (import.meta.env.DEV) return false;
  }
  return Date.now() - readActiveAt() > RELOCK_AFTER_MS;
}

const LockContext = createContext<(() => void) | null>(null);

/** Locks the app immediately (Settings → Lock now). */
export function useLockNow() {
  return useContext(LockContext);
}

/**
 * Asks for the family password when the app opens and after it has been in
 * the background for a while. Once unlocked, the app stays mounted under the
 * lock screen when it locks again, so a half-filled form is not lost.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(startsLocked);
  const [shown, setShown] = useState(!locked);

  useEffect(() => {
    if (!locked) markActive();
  }, [locked]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!locked) markActive();
      } else if (Date.now() - readActiveAt() > RELOCK_AFTER_MS) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // While in use, keep the timestamp fresh so a reload does not lock.
    const timer = setInterval(() => !locked && document.visibilityState === 'visible' && markActive(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [locked]);

  const lockNow = useCallback(() => {
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
    setLocked(true);
  }, []);

  return (
    <LockContext.Provider value={lockNow}>
      {shown && (
        <div inert={locked} aria-hidden={locked || undefined}>
          {children}
        </div>
      )}
      {locked && (
        <LockScreen
          onUnlock={() => {
            setLocked(false);
            setShown(true);
          }}
        />
      )}
    </LockContext.Provider>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = t('app.name');
    input.current?.focus();
    // The screen underneath keeps its own title.
    return () => {
      document.title = previous;
    };
  }, [t]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setWrong(false);
    try {
      // Phone keyboards like to add a space after a word.
      if (await checkPassword(password.trim())) return onUnlock();
      setWrong(true);
      setPassword('');
      input.current?.focus();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-bg px-4 pt-[max(env(safe-area-inset-top),3rem)] pb-8">
      <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-20 rounded-3xl shadow" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('app.name')}</h1>
          <p className="text-muted">{t('lock.prompt')}</p>
        </div>
        {!canCheckPassword() ? (
          <p role="alert" className="font-medium text-danger">
            {t('lock.insecure')}
          </p>
        ) : (
          <>
            <div className="relative w-full">
              <label htmlFor="lock-password" className="sr-only">
                {t('lock.password')}
              </label>
              <TextInput
                ref={input}
                id="lock-password"
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setWrong(false);
                }}
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('lock.password')}
                aria-invalid={wrong || undefined}
                aria-describedby={wrong ? 'lock-error' : undefined}
                className="pr-14 text-center text-lg"
              />
              <IconButton
                label={visible ? t('lock.hide') : t('lock.show')}
                className="absolute top-0 right-0"
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
              </IconButton>
            </div>
            {wrong && (
              <p id="lock-error" role="alert" className="font-medium text-danger">
                {t('lock.wrong')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!password || checking}>
              <Lock aria-hidden size={18} />
              {t('lock.unlock')}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
