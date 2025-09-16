import React, { useEffect, useRef, useState } from 'react'
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

const SIGNUP_OPTIONS = [
  {
    id: 'google',
    label: 'Continuar con Google',
    description: 'Conecta con tu cuenta de Google en segundos.',
    Icon: Chrome,
    accent: 'from-amber-200/70 to-orange-200/60 text-slate-900'
  },
  {
    id: 'apple',
    label: 'Continuar con Apple',
    description: 'Privacidad reforzada con inicio de sesión de Apple.',
    Icon: Apple,
    accent: 'from-slate-200/80 to-slate-100/70 text-slate-900'
  },
  {
    id: 'binance',
    label: 'Entrar con Binance',
    description: 'Sincroniza tu cuenta de exchange favorita.',
    Icon: Coins,
    accent: 'from-yellow-200/80 to-amber-200/70 text-yellow-900'
  },
  {
    id: 'wallet',
    label: 'Klever Wallet',
    description: 'Usa tu wallet Web3 o extensión Klever.',
    Icon: Wallet,
    accent: 'from-indigo-200/70 to-sky-200/60 text-indigo-900'
  },
  {
    id: 'passkey',
    label: 'Passkey biométrica',
    description: 'Seguridad de última generación con biometría.',
    Icon: Fingerprint,
    accent: 'from-emerald-200/70 to-teal-200/60 text-emerald-900'
  },
  {
    id: 'email',
    label: 'Correo electrónico',
    description: 'Registro clásico con verificación instantánea.',
    Icon: Mail,
    accent: 'from-purple-200/70 to-fuchsia-200/60 text-purple-900'
  },
  {
    id: 'github',
    label: 'GitHub Enterprise',
    description: 'Perfecto para analistas y equipos técnicos.',
    Icon: Github,
    accent: 'from-zinc-200/70 to-slate-200/70 text-slate-900'
  },
  {
    id: 'kyc',
    label: 'Onboarding KYC',
    description: 'Verifica tu identidad con procesos KleverShield.',
    Icon: ShieldCheck,
    accent: 'from-blue-200/70 to-cyan-200/60 text-blue-900'
  }
]

export default function FloatingMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return

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

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
      aria-hidden="false"
    >
      <div
        ref={containerRef}
        className="pointer-events-auto inline-flex items-center gap-4 rounded-full border border-white/30 bg-white/10 px-4 py-2 shadow-[0_12px_40px_rgba(15,23,42,0.25)]"
        style={{ backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)' }}
      >
        <a
          href="/"
          className="group inline-flex items-center gap-2 rounded-full border border-white/0 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900/90 transition hover:border-white/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/30 text-slate-900/90 shadow-inner shadow-white/40">
            <Home className="h-4 w-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span>Inicio</span>
            <span className="text-[10px] font-normal uppercase tracking-[0.2em] text-slate-700/70">Dashboard</span>
          </span>
        </a>

        <div className="hidden h-10 w-px bg-white/30 sm:block" aria-hidden="true" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center gap-3 rounded-full border border-white/0 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900/90 transition hover:border-white/40 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-haspopup="true"
            aria-expanded={open}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-100/80 to-white/60 text-slate-900 shadow-inner shadow-white/40">
              <UserRoundPlus className="h-4 w-4" />
            </span>
            <span className="flex flex-col text-left leading-tight">
              <span>Crear cuenta</span>
              <span className="text-[10px] font-normal uppercase tracking-[0.2em] text-slate-700/70">Klever ID</span>
            </span>
            <ArrowUpRight className={`h-4 w-4 transition duration-200 ${open ? 'rotate-45' : ''}`} />
          </button>

          {open && (
            <div
              className="absolute right-0 top-full mt-4 w-[320px] rounded-3xl border border-white/30 bg-white/10 p-4 text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.2)]"
              style={{ backdropFilter: 'blur(22px) saturate(200%)', WebkitBackdropFilter: 'blur(22px) saturate(200%)' }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-700/70">Unirse a KleverGold</p>
                  <p className="text-sm text-slate-700/80">Selecciona tu método preferido:</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/20 text-[10px] font-semibold uppercase tracking-wide text-slate-700/80">
                  New
                </div>
              </div>
              <div className="space-y-2">
                {SIGNUP_OPTIONS.map(({ id, label, description, Icon, accent }) => (
                  <button
                    key={id}
                    type="button"
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-3 py-2.5 text-left transition hover:-translate-y-[2px] hover:border-white/40 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} shadow-inner shadow-white/40`}> 
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900/90">{label}</span>
                      <span className="block text-xs text-slate-700/80">{description}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-slate-700/60 transition group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-700/70">
                Al continuar aceptas los términos de KleverGold y nuestra política de protección de datos.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
