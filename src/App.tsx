import { useState } from "react";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { SettingsProvider } from "./lib/settings";
import { NotificationsProvider } from "./components/Notifications";
import { AppSidebar } from "./components/AppSidebar";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Scan } from "./pages/Scan";
import { Activity } from "./pages/Activity";
import { Locations } from "./pages/Locations";
import { ShoppingList } from "./pages/ShoppingList";
import SettingsPage from "./pages/Settings";
import { LayoutDashboard, ScanLine, Package, Settings, Menu } from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Stock", icon: Package },
  { to: "/settings", label: "Settings", icon: Settings },
];

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex safe-area-pb z-30">
      {tabs.map((t) => {
        const active = pathname === t.to;
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
              active ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? "text-emerald-400" : ""}`} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </NotificationsProvider>
    </SettingsProvider>
  );
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isDashboard = pathname === "/";

  return (
    <div className="min-h-screen pb-16">
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-lg bg-slate-800/90 backdrop-blur border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition"
      >
        <Menu className="w-4 h-4 text-slate-300" />
      </button>

      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        showFieldVisibility={isDashboard}
      />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/products" element={<Products />} />
        <Route path="/shopping" element={<ShoppingList />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <BottomNav />
    </div>
  );
}
