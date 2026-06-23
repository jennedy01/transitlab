import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSchemeStore } from '../../store/schemeStore';
import { AuthModal } from './AuthModal';

export function AccountControl() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const logout = useAuthStore((s) => s.logout);
  const loadSchemes = useSchemeStore((s) => s.loadSchemes);
  const selectScheme = useSchemeStore((s) => s.selectScheme);

  async function handleLogout() {
    logout();
    await selectScheme(null);
    await loadSchemes();
  }

  return (
    <div className="flex items-center gap-2">
      {isAuthed && user ? (
        <>
          <span className="font-sans text-2xs text-muted">
            {user.displayName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="font-sans text-2xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-[3px] border border-hairline px-2 py-1 font-sans text-2xs text-muted hover:text-ink"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />
          Local · sign in
        </button>
      )}
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </div>
  );
}
