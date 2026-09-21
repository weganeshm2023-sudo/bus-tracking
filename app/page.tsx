import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl font-bold">
              Bus Tracking System
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Real-time student bus tracking
            </p>
          </div>

          <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
            ● System Online
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-400">
              Live Bus Tracking
            </p>

            <h2 className="text-5xl font-bold leading-tight md:text-6xl">
              Track your bus.
              <br />
              Know when it arrives.
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              A real-time bus tracking platform for administrators,
              drivers and students. Monitor live bus locations and
              receive pickup notifications.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Link
              href="/admin/login"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-blue-400/50 hover:bg-white/10"
            >
              <div className="mb-4 text-3xl">🛠️</div>

              <h3 className="text-xl font-semibold">
                Admin
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Manage buses, drivers, students, routes and
                monitor live buses.
              </p>

              <span className="mt-5 inline-block text-sm font-medium text-blue-400">
                Admin Login →
              </span>
            </Link>

            <Link
              href="/driver/login"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-emerald-400/50 hover:bg-white/10"
            >
              <div className="mb-4 text-3xl">🚌</div>

              <h3 className="text-xl font-semibold">
                Driver
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Start today's trip, share GPS location and
                complete the trip.
              </p>

              <span className="mt-5 inline-block text-sm font-medium text-emerald-400">
                Driver Login →
              </span>
            </Link>

            <Link
              href="/student/login"
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-purple-400/50 hover:bg-white/10"
            >
              <div className="mb-4 text-3xl">🎓</div>

              <h3 className="text-xl font-semibold">
                Student
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                See your assigned bus, live location and
                pickup notifications.
              </p>

              <span className="mt-5 inline-block text-sm font-medium text-purple-400">
                Student Login →
              </span>
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-6 text-center text-sm text-slate-500">
          Bus Tracking System · Real-time GPS monitoring
        </footer>
      </div>
    </main>
  );
}