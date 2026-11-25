import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../../i18n';

// "← Back" at the top-left of every screen except Home: plain text with a red
// arrow, no box. It goes to the previous screen; a page opened straight from a
// link has no previous screen in this app, so it goes Home instead.
export const BackLink: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();

  if (location.pathname === '/dashboard') return null;

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/dashboard');
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="group mb-4 -ml-1 inline-flex items-center gap-1.5 h-9 pl-2 pr-3.5 text-[0.9375rem] font-semibold text-os-muted hover:text-os-ink hover:bg-os-panel transition-colors no-print"
    >
      <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
      <span>{t('Back')}</span>
    </button>
  );
};
