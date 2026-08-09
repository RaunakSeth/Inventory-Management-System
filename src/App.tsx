import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { SettingsProvider } from "./lib/settings";
import { CurrencyProvider } from "./lib/currency";
import { NotificationsProvider } from "./components/Notifications";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { AppSidebar } from "./components/AppSidebar";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Scan } from "./pages/Scan";
import { Barcodes } from "./pages/Barcodes";
import { Activity } from "./pages/Activity";
import { Locations } from "./pages/Locations";
import { ShoppingList } from "./pages/ShoppingList";
import SettingsPage from "./pages/Settings";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav } from "@astryxdesign/core/TopNav";
import { LayoutDashboard, ScanLine, Package, Settings } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Stock", icon: Package },
  { to: "/settings", label: "Settings", icon: Settings },
];

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex safe-area-pb"
      aria-label="Primary"
    >
      {NAV_ITEMS.map((t) => {
        const active = pathname === t.to;
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] py-1.5 text-xs font-medium transition active:bg-slate-800/60 ${
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
      <CurrencyProvider>
        <NotificationsProvider>
          <ConfirmProvider>
            <HashRouter>
              <AppLayout />
            </HashRouter>
          </ConfirmProvider>
        </NotificationsProvider>
      </CurrencyProvider>
    </SettingsProvider>
  );
}

function AppLayout() {
  const { pathname } = useLocation();
  const isDashboard = pathname === "/";

  return (
    <AppShell
      height="auto"
      variant="elevated"
      topNav={<TopNav heading="Inventory Management" />}
      sideNav={<AppSidebar showFieldVisibility={isDashboard} />}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/products" element={<Products />} />
        <Route path="/barcodes" element={<Barcodes />} />
        <Route path="/shopping" element={<ShoppingList />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <BottomNav />
    </AppShell>
  );
}
