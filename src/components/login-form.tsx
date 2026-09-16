"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm border-[3px] border-ink bg-cream-soft px-8 py-10 shadow-[6px_6px_0_0_var(--color-ink)]">
        <div className="text-center">
          <p className="font-serif text-[11px] font-semibold uppercase tracking-[0.35em] text-ink/70">
            The Roasting Lab
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold italic tracking-tight text-gold">
            Café Yanaloma
          </h1>
          <div className="mx-auto mt-4 h-px w-16 bg-ink" />
        </div>

        <form action={formAction} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="username"
              className="block text-[11px] font-bold uppercase tracking-[0.2em] text-ink"
            >
              Usuario
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              disabled={pending}
              className="mt-1.5 w-full border-2 border-ink bg-cream px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-gold disabled:opacity-60"
              placeholder="admin"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-bold uppercase tracking-[0.2em] text-ink"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              className="mt-1.5 w-full border-2 border-ink bg-cream px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-gold disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full border-2 border-ink bg-ink py-3 text-xs font-bold uppercase tracking-[0.25em] text-gold-soft transition-colors hover:bg-ink/90 disabled:opacity-60"
          >
            {pending ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-ink/50">
          © 2026 The Roasting Lab S.R.L.
        </p>
      </div>
    </div>
  );
}
