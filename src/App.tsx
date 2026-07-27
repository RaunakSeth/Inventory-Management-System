import { useState } from "react";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { SettingsProvider } from "./lib/settings";
import { NotificationsProvider } from "./components/Notifications";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { AppSidebar } from "./components/AppSidebar";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Scan } from "./pages/Scan";
import { Activity } from "./pages/Activity";
import { Locations } from "./pages/Locations";
import { ShoppingList } from "./pages/ShoppingList";
import SettingsPage from "./pages/Settings";
import { AppShell } from "@astryxdesign/core/AppShell";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import { TopNav } from "@astryxdesign/core/TopNav";
import { TopNavItem } from "@astryxdesign/core/TopNav";
import { LayoutDashboard, ScanLine, Package, Settings, Menu } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Stock", icon: Package },
  { to: "/settings", label: "Settings", icon: Settings },
];

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 flex safe-area-pb z-30">
      {NAV_ITEMS.map((t) => {
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
        <ConfirmProvider>
          <HashRouter>
            <AppLayout />
          </HashRouter>
        </ConfirmProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isDashboard = pathname === "/";

  return (
    <AppShell
      height="auto"
      variant="elevated"
      topNav={
        <TopNav
          heading="Inventory Management"
          startContent={
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-700/50 transition"
            >
              <Menu className="w-5 h-5" />
            </button>
          }
        />
      }
      mobileNav={
        <MobileNav
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
          header="Inventory Management"
        >
          <AppSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            showFieldVisibility={isDashboard}
          />
        </MobileNav>
      }
    >
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
    </AppShell>
  );
}
