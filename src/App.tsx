import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Scan } from "./pages/Scan";

function BottomNav() {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/", label: "Home" },
    { to: "/scan", label: "Scan" },
    { to: "/products", label: "Products" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex">
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          className={`flex-1 text-center py-3 text-sm ${
            pathname === t.to ? "text-emerald-400" : "text-slate-500"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen pb-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/products" element={<Products />} />
        </Routes>
        <BottomNav />
      </div>
    </HashRouter>
  );
}
