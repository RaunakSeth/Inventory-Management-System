import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSettings, ALL_FIELDS, type FieldId } from "../lib/settings";
import {
  MapPin, ShoppingCart, History, Settings, X,
  LayoutDashboard, ScanLine, Package, SlidersHorizontal,
} from "lucide-react";

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  showFieldVisibility?: boolean;
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Products", icon: Package },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/shopping", label: "Shopping list", icon: ShoppingCart },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ open, onClose, showFieldVisibility = false }: AppSidebarProps) {
  const { pathname } = useLocation();
  const { settings, updateSettings } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  function toggleField(fieldId: FieldId) {
    const current = settings.visible_fields;
    const next = current.includes(fieldId)
      ? current.filter((f) => f !== fieldId)
      : [...current, fieldId];
    updateSettings({ visible_fields: next });
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <div
        ref={panelRef}
        className={`fixed top-0 left-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <span className="font-bold text-sm">PG Inventory</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <nav className="p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {showFieldVisibility && (
          <div className="border-t border-slate-800 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <SlidersHorizontal className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">Visible fields</h3>
            </div>
            <p className="text-[10px] text-slate-500">Choose what to show on stock cards.</p>
            <div className="space-y-1">
              {ALL_FIELDS.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={settings.visible_fields.includes(f.id)}
                    onChange={() => toggleField(f.id)}
                    className="accent-emerald-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-300">{f.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
