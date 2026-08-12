import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { AddressPage } from './pages/AddressPage';
import { AdminPage } from './pages/AdminPage';
import { useApiHealth } from './hooks/useApiHealth';

function HierarchyMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-brand"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="4" cy="20" r="2" />
      <circle cx="19" cy="16" r="2" />
      <path d="M4 6v12M4 4h9a2 2 0 0 1 2 2v0M4 12h9a2 2 0 0 1 2 2v0M17 16h0" />
      <path d="M13 6a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2" />
    </svg>
  );
}

function HealthBadge() {
  const status = useApiHealth();
  const label =
    status === 'online' ? 'API aktif' : status === 'offline' ? 'API tidak terhubung' : 'Memeriksa API…';
  const dotClass =
    status === 'online'
      ? 'bg-success'
      : status === 'offline'
        ? 'bg-danger'
        : 'animate-pulse bg-faint';

  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function NavTab({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'border-brand text-ink'
            : 'border-transparent text-muted hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6">
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint">
                <HierarchyMark />
              </span>
              <div className="leading-tight">
                <p className="font-display text-base font-semibold tracking-tight text-ink">
                  Wilindo
                </p>
                <p className="hidden text-[11px] text-faint sm:block">Registry Wilayah Indonesia</p>
              </div>
            </div>
            <HealthBadge />
          </div>
          <nav className="-mb-px flex gap-5">
            <NavTab to="/" end>
              Alamat
            </NavTab>
            <NavTab to="/admin">Admin CRUD</NavTab>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<AddressPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
