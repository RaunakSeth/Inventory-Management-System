import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SideNav } from "@astryxdesign/core/SideNav";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { SideNavSection } from "@astryxdesign/core/SideNav";
import { SideNavHeading } from "@astryxdesign/core/SideNav";
import { Switch } from "@astryxdesign/core/Switch";
import { useSettings, ALL_FIELDS, type FieldId } from "../lib/settings";
import {
  MapPin, ShoppingCart, History, Settings,
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
        className={`fixed top-0 left-0 bottom-0 w-72 z-50 transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SideNav
          header={
            <SideNavHeading heading="Inventory Management" icon={<Package className="w-5 h-5" />} />
          }
        >
          <SideNavSection title="Navigation" isHeaderHidden>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <SideNavItem
                  key={item.to}
                  label={item.label}
                  icon={<Icon className="w-4 h-4" />}
                  isSelected={pathname === item.to}
                  onClick={() => { onClose(); window.location.hash = item.to === "/" ? "#" : `#${item.to}`; }}
                />
              );
            })}
          </SideNavSection>

          {showFieldVisibility && (
            <SideNavSection
              title="Visible fields"
              subtitle="Choose what to show on stock cards"
            >
              {ALL_FIELDS.map((f) => (
                <SideNavItem
                  key={f.id}
                  label={f.label}
                  icon={<SlidersHorizontal className="w-4 h-4" />}
                  endContent={
                    <Switch
                      label={f.label}
                      isLabelHidden
                      value={settings.visible_fields.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                    />
                  }
                  onClick={() => toggleField(f.id)}
                />
              ))}
            </SideNavSection>
          )}
        </SideNav>
      </div>
    </>
  );
}
