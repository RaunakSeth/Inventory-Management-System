import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { SettingsProvider } from "./lib/settings";
import { NotificationsProvider } from "./components/Notifications";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Scan } from "./pages/Scan";
import { Activity } from "./pages/Activity";
import { Locations } from "./pages/Locations";
import { ShoppingList } from "./pages/ShoppingList";
import SettingsPage from "./pages/Settings";
import { LayoutDashboard, ScanLine, Package, History, MapPin, ShoppingCart, Settings } from "lucide-react";

const tabs = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Products", icon: Package },
  { to: "/shopping", label: "Shopping", icon: ShoppingCart },
  { to: "/activity", label: "Activity", icon: History },
];

function BottomNav() {
  const { pathname } = useLocation();
  const isSettings = pathname === "/settings";
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex safe-area-pb">
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
      <Link
        to="/settings"
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
          isSettings ? "text-emerald-400" : "text-slate-500"
        }`}
      >
        <Settings className={`w-5 h-5 ${isSettings ? "text-emerald-400" : ""}`} />
        Settings
      </Link>
    </nav>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <HashRouter>
          <div className="min-h-screen pb-16">
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
        </HashRouter>
      </NotificationsProvider>
    </SettingsProvider>
  );
}
