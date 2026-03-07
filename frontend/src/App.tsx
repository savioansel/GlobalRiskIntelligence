import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Aviation = lazy(() => import("./pages/Aviation"));
const Maritime = lazy(() => import("./pages/Maritime"));
const Railway = lazy(() => import("./pages/Railway"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const AICenter = lazy(() => import("./pages/AICenter"));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

const NAV = [
  { to: "/", icon: "dashboard", label: "Dashboard" },
  { to: "/aviation", icon: "flight", label: "Aviation Risk" },
  { to: "/maritime", icon: "sailing", label: "Maritime Risk" },
  { to: "/railway", icon: "train", label: "Railway Risk" },
  { to: "/portfolio", icon: "business_center", label: "Portfolio" },
  { to: "/ai", icon: "smart_toy", label: "AI Center" },
];

function Sidebar() {
  return (
    <aside className="w-[240px] flex-shrink-0 flex flex-col bg-white border-r border-border-col z-20">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-border-col gap-3">
        <div className="bg-primary text-white rounded-lg p-1.5 w-8 h-8 flex items-center justify-center font-display font-bold text-sm">GR</div>
        <div>
          <h1 className="font-display font-bold text-text-main text-[15px] leading-none">GlobalRisk</h1>
          <p className="text-[10px] text-text-muted mt-0.5">Intelligence Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-1">
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}>
            <span className="ms text-[20px]">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border-col">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-primary flex items-center justify-center font-display font-bold text-xs">AU</div>
          <div>
            <p className="text-sm font-semibold text-text-main">Analyst User</p>
            <p className="text-xs text-text-muted">user@globalrisk.io</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function AppLayout({ children, title, breadcrumb }: { children: React.ReactNode; title: string; breadcrumb?: string }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
      <header className="h-14 bg-white border-b border-border-col flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center text-sm font-display font-medium text-text-muted gap-1">
          <span>GlobalRisk</span>
          <span className="ms text-sm mx-1">chevron_right</span>
          <span className="text-text-main">{title}</span>
          {breadcrumb && <><span className="ms text-sm mx-1">chevron_right</span><span className="text-text-muted">{breadcrumb}</span></>}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <span className="ms absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">search</span>
            <input className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm w-[240px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-main placeholder:text-text-muted/60" placeholder="Search intelligence..." />
          </div>
          <button className="relative p-2 text-text-muted hover:text-text-main rounded-full hover:bg-gray-100 transition-colors">
            <span className="ms text-[20px]">notifications</span>
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto bg-bg-app p-6">{children}</main>
    </div>
  );
}

export { AppLayout };

import { Toaster } from "react-hot-toast";

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-bg-app">
              <div className="flex flex-col items-center gap-3">
                <span className="ms text-primary text-4xl animate-spin">autorenew</span>
                <p className="text-text-muted text-sm animate-pulse">Loading module...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/aviation" element={<Aviation />} />
              <Route path="/maritime" element={<Maritime />} />
              <Route path="/railway" element={<Railway />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/ai" element={<AICenter />} />
            </Routes>
          </Suspense>
        </div>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
