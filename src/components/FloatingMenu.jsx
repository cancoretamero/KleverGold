import React, { useCallback, useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import EmailSignupDialog from './EmailSignupDialog.jsx'

const SIGNUP_OPTIONS = [
  {
    id: 'google',
    label: 'Continuar con Google',
    description: 'Conecta con tu cuenta de Google en segundos.',
    Icon: Chrome,
    acct: ',
  {
    id: 'binance',
    label: 'Entrar con Binance',
    description: 'Sincroniza tu cuenta de exchange favorita.',
    Icon: Coins,
    accent: 'from-yellow-200/80 via-amber-200/70 to-amber-100/70 text-yellow-900',
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
    accent: 'from-indigo-200/80 via-sky-200/70 to-sky-100/70 text-indigo-900',
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
    accent: 'from-emerald-200/80 via-teal-200/70 to-teal-100/70 text-emerald-900',
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
    accent: 'from-purple-200/80 via-fuchsia-200/70 to-pink-100/70 text-purple-900',
    badge: 'Instantáneo',
    action: { type: 'dialog', name: 'email' }
  },
  {
    id: 'github',
    label: 'GitHub Enterprise',
    description: 'Perfecto para analistas y equipos técnicos.',
    Icon: Github,
    accent: 'from-zinc-200/80 via-slate-200/70 to-slate-100/70 text-slate-900',
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
    accent: 'from-blue-200/80 via-sky-200/70 to-cyan-100/70 text-blue-900',
    action: {
      type: 'link',
      href: 'https://klever.finance/klevershield',
      target: '_blank'
    }
  }
]

function OptionEntry({ option, onActivate }) {
  const { label, description, Icon, accent, badge, action } = option
  const target = action?.target || '_self'
  const baseClass =
    'group flex w-full items-center gap-3 rounded-2xl border border-white/40 bg-white/10 px-3.5 py-3 text-left shadow-inner shadow-white/30 transition hover:-translate-y-[2px] hover:shadow-[0_16px_44px_rgba(15,23,42,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

  const content = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} shadow-inner shadow-white/60`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {label}
          {badge ? (
            <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="block text-xs text-slate-600">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" aria-hidden="true" />
    </>
  )

  if (action?.type === 'dialog') {
    return (
      <button type="button" onClick={(event) => onActivate(option, event)} className={baseClass}>
        {content}
      </button>
    )
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
  )
}

export default function FloatingMenu() {
  const [open, setOpen] = useState(false)
  const [activeDialog, setActiveDialog] = useState(null)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const handlePointer = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleOptionClick = useCallback((option, event) => {
    if (option.action?.type === 'dialog') {
      event?.preventDefault()
      setActiveDialog(option.action.name || option.id)
      setOpen(false)
      return
    }

    if (typeof option.action?.onClick === 'function') {
      option.action.onClick(event)
    }
    setOpen(false)
  }, [])

  const handleDialogClose = useCallback(() => {
    setActiveDialog(null)
    if (triggerRef.current) {
      triggerRef.current.focus()
    }
  }, [])

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4 sm:px-6" aria-hidden="false">
        <div
          ref={containerRef}
          className="pointer-events-auto inline-flex items-center gap-5 rounded-full border border-white/40 bg-white/10 px-5 py-2.5 shadow-[0_24px_80px_rgba(15,23,42,0.32)] backdrop-blur-2xl backdrop-saturate-150"
          style={{ WebkitBackdropFilter: 'blur(22px) saturate(180%)' }}
        >
          <a
            href="/"
            className="group inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-inner shadow-white/50 transition hover:shadow-[0_12px_30px_rgba(15,23,42,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-inner shadow-white/70">
              <Home className="h-4 w-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span>Inicio</span>
              <span className="text-[10px] font-normal uppercase tracking-[0.22em] text-slate-600">Dashboard</span>
            </span>
          </a>

          <div className="hidden h-10 w-px bg-white/60 sm:block" aria-hidden="true" />

          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-inner shadow-white/50 transition hover:shadow-[0_12px_30px_rgba(15,23,42,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-haspopup="true"
              aria-expanded={open}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 via-white to-white text-slate-900 shadow-inner shadow-white/70">
                <UserRoundPlus className="h-4 w-4" />
              </span>
              <span className="flex flex-col text-left leading-tight">
                <span>Crear cuenta</span>
                <span className="text-[10px] font-normal uppercase tracking-[0.22em] text-slate-600">Klever ID</span>
              </span>
              <ArrowUpRight
                className={`h-4 w-4 text-slate-600 transition duration-200 ${open ? 'rotate-45 text-slate-700' : ''}`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div
                className="absolute right-0 top-full mt-4 w-[360px] rounded-3xl border border-white/50 bg-white/15 p-5 text-slate-900 shadow-[0_32px_120px_rgba(15,23,42,0.28)] backdrop-blur-2xl backdrop-saturate-150"
                style={{ WebkitBackdropFilter: 'blur(26px) saturate(190%)' }}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Unirse a KleverGold</p>
                    <p className="text-sm text-slate-600">Selecciona tu método preferido:</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    New
                  </div>
                </div>
                <div className="space-y-2.5">
                  {SIGNUP_OPTIONS.map((option) => (
                    <OptionEntry key={option.id} option={option} onActivate={handleOptionClick} />
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-white/50 bg-white/20 px-4 py-3 text-xs text-slate-500 shadow-inner shadow-white/40">
                  Al continuar aceptas los términos de KleverGold y nuestra política de protección de datos.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <EmailSignupDialog open={activeDialog === 'email'} onClose={handleDialogClose} />
    </>
  )
}
