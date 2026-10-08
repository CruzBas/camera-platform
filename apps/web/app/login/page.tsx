"use client";

import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { BrandLogo, BrandWordmark } from "@/components/brand";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type FieldErrors = { email?: string; password?: string };

const FIELD =
  "rounded-2xl border bg-white/10 text-base text-white outline-none placeholder:text-white/45 focus-within:border-white/60";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Ingresa tu correo electrónico.";
    if (!password) errors.password = "Ingresa tu contraseña.";
    setFieldErrors(errors);
    setError(null);
    if (errors.email || errors.password) return;

    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-svh flex-1 bg-[url(/images/san-jose.jpg)] bg-cover bg-center">
      <div className="flex flex-1 items-center justify-center bg-[#0b2866]/85 px-6 py-8">
        <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col">
          <header className="mb-10 flex flex-col items-center text-center text-white">
            <BrandLogo size="lg" onDark />
            <BrandWordmark className="mt-4 text-lg" />
            <h1 className="mt-6 text-[30px] font-bold tracking-tight">Bienvenido de vuelta</h1>
            <p className="mt-2 text-base text-white/80">Inicia sesión para ver tus cámaras.</p>
          </header>

          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-[15px] font-medium text-white">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className={cn(FIELD, "w-full px-4 py-4", fieldErrors.email ? "border-red-300" : "border-white/25")}
              />
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 text-[13px] text-red-200">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-[15px] font-medium text-white">
                Contraseña
              </label>
              <div
                className={cn(FIELD, "flex items-center pr-2", fieldErrors.password ? "border-red-300" : "border-white/25")}
              >
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  className="min-w-0 flex-1 bg-transparent px-4 py-4 outline-none placeholder:text-white/45"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="flex size-11 items-center justify-center text-white/75 active:opacity-70"
                >
                  {showPassword ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-[13px] text-red-200">
                  {fieldErrors.password}
                </p>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-center text-[13px] text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-disabled={loading}
            className="mt-10 flex w-full items-center justify-center rounded-full bg-white py-4 text-lg font-bold text-[#1e3a8a] shadow-lg hover:bg-gray-100 active:bg-gray-100 disabled:opacity-70"
          >
            {loading ? <LoaderCircleIcon className="size-6 animate-spin" aria-label="Iniciando sesión" /> : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
