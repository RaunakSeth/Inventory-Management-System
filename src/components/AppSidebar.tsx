import { useLocation } from "react-router-dom";
import { SideNav, SideNavItem, SideNavSection, SideNavHeading } from "@astryxdesign/core/SideNav";
import { Switch } from "@astryxdesign/core/Switch";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { useSettings, ALL_FIELDS, type FieldId } from "../lib/settings";
import {
  MapPin, ShoppingCart, History, Settings,
  LayoutDashboard, ScanLine, Package, SlidersHorizontal, Barcode,
} from "lucide-react";

interface AppSidebarProps {
  showFieldVisibility?: boolean;
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/products", label: "Products", icon: Package },
  { to: "/barcodes", label: "Barcodes", icon: Barcode },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/shopping", label: "Shopping list", icon: ShoppingCart },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

const toHref = (to: string) => (to === "/" ? "#/" : `#${to}`);

export function AppSidebar({ showFieldVisibility = false }: AppSidebarProps) {
  const { pathname } = useLocation();
  const { settings, updateSettings } = useSettings();
  const { closeMobileNav } = useAppShellMobile();

  function toggleField(fieldId: FieldId) {
    const current = settings.visible_fields;
    const next = current.includes(fieldId)
      ? current.filter((f) => f !== fieldId)
      : [...current, fieldId];
    updateSettings({ visible_fields: next });
  }

  return (
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
              href={toHref(item.to)}
              onClick={closeMobileNav}
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
  );
}
