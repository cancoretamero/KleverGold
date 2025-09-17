import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  Apple,
  ArrowUpRight,
  Chrome,
  Coins,
  Fingerprint,
  Github,
  Home,
  Mail,
  ShieldCheck,
  UserRoundPlus,
  Wallet
} from 'lucide-react';
import EmailSignupDialog from './EmailSignupDialog.jsx';

const SIGNUP_OPTIONS = [
  {
    id: 'google',
    label: 'Continuar con Google',
    description: 'Conecta con tu cuenta de Google en segundos.',
    Icon: Chrome,
    accent:
      'from-amber-200/80 via-orange-200/70 to-orange-100/70 text-slate-900',
    action: {
      type: 'link',
      href: 'https://accounts.google.com/signup/v2/webcreateaccount?hl=es-419',
      target: '_blank'
    }
  },
  {
    id: 'apple',
    label: 'Continuar con Apple',
    description: 'Privacidad reforzada con inicio de sesión de Apple.',
    Icon: Apple,
    accent:
      'from-slate-200/80 via-slate-100/70 to-white/70 text-slate-900',
    action: {
      type: 'link',
      href: 'https://appleid.apple.com/account',
      target: '_blank'
    }
  },
  {
    id: 'binance',
    label: 'Entrar con Binance',
    description: 'Sincroniza tu cuenta de exchange favorita.',
    Icon: Coins,
    accent:
      'from-yellow-200/80 via-amber-200/70 to-amber-100/70 text-yellow-900',
    action: {
      type: 'link',
      href: 'https://accounts.binance.com/es/register',
      target: '_blank'
    }
  },
  {
    id: 'wallet',
    label: 'Klever Wallet',
    description: 'Usa tu wallet Web3 o extensión Klever.',
    Icon: Wallet,
    accent:
      'from-indigo-200/80 via-sky-200/70 to-sky-100/70 text-indigo-900',
    action: {
      type: 'link',
      href: 'https://klever.finance/klever-wallet',
      target: '_blank'
    }
  },
  {
    id: 'passkey',
    label: 'Passkey biométrica',
    description: 'Seguridad de última generación con biometría.',
    Icon: Fingerprint,
    accent:
      'from-emerald-200/80 via-teal-200/70 to-teal-100/70 text-emerald-900',
    badge: 'Beta',
    action: {
      type: 'link',
      href: 'https://passkeys.dev/docs/use-cases/',
      target: '_blank'
    }
  },
  {
    id: 'email',
    label: 'Correo electrónico',
    description: 'Registro clásico con verificación instantánea.',
    Icon: Mail,
    accent:
      'from-purple-200/80 via-fuchsia-200/70 to-pink-100/70 text-purple-900',
    badge: 'Instantáneo',
    action: { type: 'dialog', name: 'email' }
  },
  {
    id: 'github',
    label: 'GitHub Enterprise',
    description: 'Perfecto para analistas y equipos técnicos.',
    Icon: Github,
    accent:
      'from-zinc-200/80 via-slate-200/70 to-slate-100/70 text-slate-900',
    action: {
      type: 'link',
      href: 'https://github.com/signup?source=klevergold',
      target: '_blank'
    }
  },
  {
    id: 'kyc',
    label: 'Onboarding KYC',
    description: 'Verifica tu identidad con procesos KleverShield.',
    Icon: ShieldCheck,
    accent:
      'from-blue-200/80 via-sky-200/70 to-cyan-100/70 text-blue-900',
    action: {
      type: 'link',
      href: 'https://klever.finance/klevershield',
      target: '_blank'
    }
  }
];

function OptionEntry({ option, onActivate }) {
  const { label, description, Icon, accent, badge, action } = option;
  const target = action?.target || '_self';
  const baseClass =
    'group flex w-full items-center gap-3 rounded-2xl border border-white/40 bg-white/10 px-3.5 py-3 text-left shadow-inner shadow-white/30 transition hover:-translate-y-[2px] hover:shadow-[0_16px_44px_rgba(15,23,42,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
  const content = (
    <>
      <span
        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-semibold leading-none">
          {label}
          {badge ? (
            <span className="ml-2 rounded-md bg-white/30 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-900">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-sm leading-tight text-slate-700/80 dark:text-slate-300/70">
          {description}
        </span>
      </span>
    </>
  );
  if (action?.type === 'dialog') {
    return (
      <button
        onClick={(event) => onActivate(option, event)}
        className={baseClass}
      >
        {content}
      </button>
    );
  }
  return (
    <a
      href={action?.href || '#'}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      onClick={(event) => onActivate(option, event)}
      className={baseClass}
    >
      {content}
    </a>
  );
}

export default function FloatingMenu() {
  const [open, setOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleOptionClick = useCallback((option, event) => {
    if (option.action?.type === 'dialog') {
      event?.preventDefault();
      setActiveDialog(option.action.name || option.id);
      setOpen(false);
      return;
    }
    if (typeof option.action?.onClick === 'function') {
      option.action.onClick(event);
    }
    setOpen(false);
  }, []);

  const handleDialogClose = useCallback(() => {
    setActiveDialog(null);
    if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, []);

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-3 rounded-full border border-white/0 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900/90 transition hover:border-white/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <ArrowUpRight className="h-4 w-4" />
          <span>Crear cuenta</span>
          <span className="hidden sm:inline-block">Klever ID</span>
        </button>
        {open && (
          <div
            ref={containerRef}
            className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-white/40 bg-slate-100 p-4 shadow-lg backdrop-blur-lg dark:bg-slate-800"
          >
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Unirse a KleverGold
            </h3>
            <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
              Selecciona tu método preferido:
            </p>
            <div className="space-y-2">
              {SIGNUP_OPTIONS.map((option) => (
                <OptionEntry
                  key={option.id}
                  option={option}
                  onActivate={handleOptionClick}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
              Al continuar aceptas los{' '}
              <a href="#" className="underline">                términos
              </a>{' '}
              de KleverGold y nuestra{' '}
              <a href="#" className="underline">
                política de protección de datos
              </a>
              .
            </p>
          </div>
        )}
      </div>
      {activeDialog === 'email' && (
        <EmailSignupDialog open onClose={handleDialogClose} />
      )}
    </>
  );
}
