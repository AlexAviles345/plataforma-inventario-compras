const foundations = [
  ['React 19', 'Interfaz modular y tipada'],
  ['Vite 6', 'Desarrollo rápido en el puerto 5173'],
  ['Tailwind CSS 4', 'Sistema visual basado en tokens'],
];

export function FoundationPage() {
  const appName = import.meta.env.VITE_APP_NAME || 'TechDistribution';

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="max-w-3xl space-y-5">
          <p className="text-sm font-semibold tracking-[0.22em] text-teal-400 uppercase">
            Fase 1 · Fundamentos
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            {appName}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            Base del frontend empresarial para administrar autenticación,
            inventario y compras a través del API Gateway.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {foundations.map(([title, description]) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30"
            >
              <h2 className="font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
