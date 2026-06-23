import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { useAuthStore } from '../../store/authStore';
import { useSchemeStore } from '../../store/schemeStore';

type Mode = 'login' | 'register';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loadSchemes = useSchemeStore((s) => s.loadSchemes);
  const selectScheme = useSchemeStore((s) => s.selectScheme);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName);
      // Switch context to the now-authenticated account.
      await selectScheme(null);
      await loadSchemes();
      onClose();
    } catch (err) {
      setError((err as Error).message.replace(/^API \d+:\s*/, ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'login' ? 'Sign in' : 'Create account'} onClose={onClose}>
      <div className="mb-3 flex gap-1 rounded-[3px] border border-hairline p-0.5">
        {(['login', 'register'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-[2px] py-1 font-sans text-xs transition-colors ${
              mode === m ? 'bg-signal text-chrome' : 'text-muted hover:text-ink'
            }`}
          >
            {m === 'login' ? 'Sign in' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'register' && (
          <TextInput
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />
        )}
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <TextInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {mode === 'register' && (
          <p className="text-2xs text-muted">Minimum 8 characters.</p>
        )}
        {error && <p className="text-2xs text-danger">{error}</p>}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <div className="mt-3 border-t border-hairline pt-3">
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Continue locally
        </Button>
        <p className="mt-1.5 text-center text-2xs text-muted/70">
          Schemes are saved to this browser without an account.
        </p>
      </div>
    </Modal>
  );
}
