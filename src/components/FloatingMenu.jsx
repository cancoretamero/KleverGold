import React, { useCallback, useEffect, useRef, useState, useId } from 'react';

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
const EMAIL_DIALOG_INITIAL_STATE = {
  name: '',
  lastName: '',
  email: '',
  company: '',
  consent: false,
};

function EmailSignupDialog({ open, onClose }) {
  const [formState, setFormState] = useState(EMAIL_DIALOG_INITIAL_STATE);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleClose = useCallback(() => {
    setFormState(EMAIL_DIALOG_INITIAL_STATE);
    setStatus('idle');
    setError('');
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return undefined;
    let animationFrame;
    const previousActiveElement = document.activeElement;
    const focusDialog = () => {
      if (firstFieldRef.current) {
        firstFieldRef.current.focus({ preventScroll: true });
      } else if (dialogRef.current) {
        dialogRef.current.focus({ preventScroll: true });
      }
    };
    animationFrame = requestAnimationFrame(focusDialog);
    return () => {
      cancelAnimationFrame(animationFrame);
      if (
        previousActiveElement &&
        typeof previousActiveElement.focus === 'function' &&
        document.contains(previousActiveElement)
      ) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleFocus = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        dialogRef.current.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focus', handleFocus, true);
    return () => {
      document.removeEventListener('focus', handleFocus, true);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const updateField = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedEmail = formState.email.trim();
    const emailValid = /^(?:[a-z0-9_'^&+-]+)(?:\.[a-z0-9_'^&+-]+)*@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(trimmedEmail);
    if (!emailValid) {
      setError('Introduce un correo electrónico válido.');
      if (firstFieldRef.current) {
        firstFieldRef.current.focus({ preventScroll: true });
      }
      return;
    }
    if (!formState.consent) {
      setError('Debes aceptar el tratamiento de datos para continuar.');
      return;
    }
    setError('');
    setStatus('success');
  };

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 px-4 py-6 backdrop-blur"
      role="presentation"
      onMouseDown={handleBackdropPointerDown}
      onTouchStart={handleBackdropPointerDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-3xl border border-white/20 bg-white/90 p-6 shadow-[0_32px_70px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90"
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full border border-transparent bg-white/40 p-1.5 text-slate-700 transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
          onClick={handleClose}
          aria-label="Cerrar registro por correo"
        >
          <ArrowUpRight className="h-4 w-4 rotate-45" />
        </button>
        <div className="space-y-2 text-center">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">KleverGold</span>
          <h2 id={titleId} className="text-2xl font-semibold text-slate-900 dark:text-white">
            Únete con tu correo electrónico
          </h2>
          <p id={descriptionId} className="text-sm text-slate-600 dark:text-slate-300">
            Crea tu Klever ID en minutos con verificación instantánea y alertas personalizadas.
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-left text-sm font-medium text-slate-700 dark:text-slate-200">
              Nombre
              <input
                ref={firstFieldRef}
                type="text"
                value={formState.name}
                onChange={(event) => updateField('name', event.target.value)}
                className="mt-1 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-sm text-slate-900 shadow-inner transition placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                placeholder="Tu nombre"
              />
            </label>
            <label className="flex flex-col text-left text-sm font-medium text-slate-700 dark:text-slate-200">
              Apellidos
              <input
                type="text"
                value={formState.lastName}
                onChange={(event) => updateField('lastName', event.target.value)}
                className="mt-1 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-sm text-slate-900 shadow-inner transition placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                placeholder="Tus apellidos"
              />
            </label>
          </div>
          <label className="flex flex-col text-left text-sm font-medium text-slate-700 dark:text-slate-200">
            Correo electrónico
            <input
              type="email"
              inputMode="email"
              value={formState.email}
              onChange={(event) => updateField('email', event.target.value)}
              required
              className="mt-1 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-sm text-slate-900 shadow-inner transition placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
              placeholder="nombre@empresa.com"
              aria-invalid={error ? 'true' : 'false'}
            />
          </label>
          <label className="flex flex-col text-left text-sm font-medium text-slate-700 dark:text-slate-200">
            Organización (opcional)
            <input
              type="text"
              value={formState.company}
              onChange={(event) => updateField('company', event.target.value)}
              className="mt-1 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 text-sm text-slate-900 shadow-inner transition placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
              placeholder="Tu empresa o proyecto"
            />
          </label>
          <label className="flex items-start gap-3 text-left text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={formState.consent}
              onChange={(event) => updateField('consent', event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border border-slate-300 text-amber-500 focus:ring-amber-400"
            />
            <span>
              Acepto la{' '}
              <a href="#" className="font-medium underline">
                política de privacidad
              </a>{' '}
              y recibir comunicaciones sobre KleverGold.
            </span>
          </label>
          {error ? (
            <p className="text-sm font-medium text-rose-500" role="alert">
              {error}
            </p>
          ) : null}
          {status === 'success' ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/60 bg-emerald-50/80 p-3 text-sm text-emerald-800 shadow-inner">
              <ShieldCheck className="mt-0.5 h-4 w-4" />
              <span>
                ¡Listo! Hemos registrado tu interés. Revisa tu bandeja de entrada para activar las alertas de Klever Orion.
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Seguridad empresarial con KleverShield®</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">IA 100% supervisada</span>
          </div>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-full border border-slate-200/70 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-white/10 dark:text-slate-200 dark:hover:border-white/30"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:shadow-amber-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              {status === 'success' ? 'Registrado' : 'Crear cuenta con correo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
