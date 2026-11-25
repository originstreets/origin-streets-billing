import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { store } from '../services/store';
import { signIn } from '../api/auth';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useT } from '../i18n';
import { LanguageSwitch } from '../components/common/LanguageSwitch';
import { MadeBy } from '../components/common/MadeBy';
import { ThemeSwitch } from '../components/common/ThemeSwitch';
import { BrandLogo } from '../components/common/BrandLogo';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { staff } = await signIn(username, password);
      store.addToast(t('Welcome'), staff.display_name, 'success');
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Two halves: the black Origin panel with the full logo, and the sign-in
    // form on white. On a phone the black panel becomes a band on top.
    <div className="min-h-screen bg-os-page text-os-ink grid lg:grid-cols-2">
      <section className="bg-os-accent text-white flex flex-col justify-center lg:justify-between px-6 py-10 sm:px-10 lg:p-14">
        <span className="hidden lg:block text-sm font-semibold text-white/55">{t('Shop billing')}</span>
        <div className="flex justify-center lg:justify-start">
          <BrandLogo kind="lockup" tone="white" height={140} className="lg:hidden" />
          <BrandLogo kind="lockup" tone="white" height={260} className="hidden lg:block" />
        </div>
        <span className="hidden lg:block" />
      </section>

      <main className="flex flex-col px-5 py-6 sm:px-10 lg:p-14">
        <div className="flex justify-end gap-2">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>

        <div className="flex-1 flex items-center py-10">
          <div className="w-full max-w-md">
          <h1 className="page-title">{t('Shop billing')}</h1>
          <p className="text-lg text-os-muted mt-3">{t('Sign in with your username and password.')}</p>

          <form onSubmit={handleSubmit} className="space-y-5 mt-8">
            {error && (
              <div role="alert" className="text-base text-status-red bg-status-redBg px-4 py-3">
                {error}
              </div>
            )}

            <Input
              label={t('Username')}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />

            <Input
              label={t('Password')}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <Button
              type="submit"
              variant="accent"
              size="lg"
              fullWidth
              disabled={loading}
              icon={loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
              iconPosition="right"
            >
              {loading ? t('Signing in…') : t('Sign in')}
            </Button>
          </form>
          </div>
        </div>
        <MadeBy />
      </main>
    </div>
  );
};
