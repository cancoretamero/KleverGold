import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { createEmailSignup } from '../api.js'

const createInitialFormState = () => ({
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  referralCode: ''
})

export default function EmailSignupDialog({ open, onClose }) {
  const [form, setForm] = useState(() => createInitialFormState())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle')
  const [successId, setSuccessId] = useState(null)
  const firstFieldRef = useRef(null)

  const supportsPortal = typeof document !== 'undefined'

  const handleClose = useCallback(() => {
    if (loading) return
    setForm(createInitialFormState())
    setError(null)
    setStatus('idle')
    setSuccessId(null)
    if (typeof onClose === 'function') {
      onClose()
    }
  }, [loading, onClose])

  useEffect(() => {
    if (!open) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, handleClose])

  useEffect(() => {
    if (!open) return undefined
    const id = setTimeout(() => {
      if (firstFieldRef.current) {
        firstFieldRef.current.focus()
      }
    }, 120)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) {
      setLoading(false)
    }
  }, [open])

  const handleChange = useCallback((event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (loading) return
      setError(null)

      const trimmedName = form.fullName.trim()
      if (trimmedName.length < 2) {
        setError('Por favor, escribe tu nombre completo.')
        return
      }

      const trimmedEmail = form.email.trim()
      if (!trimmedEmail) {
        setError('Necesitas un correo electrónico válido.')
        return
      }

      if (form.password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.')
        return
      }

      if (form.password !== form.confirmPassword) {
        setError('Las contraseñas no coinciden.')
        return
      }

      try {
        setLoading(true)
        const { id } = await createEmailSignup({
          fullName: trimmedName,
          email: trimmedEmail,
          password: form.password,
          referralCode: form.referralCode
        })
        setStatus('success')
        setSuccessId(id)
        setForm(createInitialFormState())
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo completar el registro.'
        setError(message)
        setStatus('idle')
      } finally {
        setLoading(false)
      }
    },
    [form, loading]
  )

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) return
      handleClose()
    },
    [handleClose]
  )

  const successMessage = useMemo(() => {
    if (status !== 'success' || !successId) return null
    return `¡Listo! Guardamos tu registro con el identificador ${successId.slice(0, 8)}…`
  }, [status, successId])

  if (!open) return null

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm px-4 py-8"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-signup-title"
        className="relative w-full max-w-md rounded-3xl border border-white/40 bg-gradient-to-br from-white/95 via-white/90 to-white/80 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.35)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/5 text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          aria-label="Cerrar registro por correo"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col gap-2 pr-8">
          <h2 id="email-signup-title" className="text-lg font-semibold text-slate-900">
            Crear cuenta con correo electrónico
          </h2>
          <p className="text-sm text-slate-600">
            Ingresa tus datos para activar tu cuenta KleverGold y recibir la confirmación en minutos.
          </p>
        </div>

        {successMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-5 text-sm text-emerald-800">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <p>
                {successMessage}
                <br />
                Revisa tu bandeja de entrada para continuar con la verificación.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label htmlFor="signup-full-name" className="text-sm font-medium text-slate-700">
                Nombre completo
              </label>
              <input
                id="signup-full-name"
                ref={firstFieldRef}
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={form.fullName}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-white/40 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="signup-email" className="text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-white/40 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="signup-password" className="text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-white/40 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="signup-confirm-password" className="text-sm font-medium text-slate-700">
                  Confirmar contraseña
                </label>
                <input
                  id="signup-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-white/40 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="signup-referral" className="text-sm font-medium text-slate-700">
                Código de referido (opcional)
              </label>
              <input
                id="signup-referral"
                name="referralCode"
                type="text"
                value={form.referralCode}
                onChange={handleChange}
                placeholder="Ingresa tu código Klever si tienes uno"
                className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-white/40 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.25)] transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                'Crear cuenta con correo'
              )}
            </button>

            <p className="text-center text-xs text-slate-500">
              Al continuar aceptas los Términos de servicio y la Política de datos de KleverGold.
            </p>
          </form>
        )}
      </div>
    </div>
  )

  return supportsPortal ? createPortal(content, document.body) : content
}
