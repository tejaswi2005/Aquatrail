import { Droplets } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

export interface PrimaryNavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  activePaths?: readonly string[];
}

interface PrimaryNavigationProps {
  roleName: string;
  items: readonly PrimaryNavigationItem[];
}

function isPathActive(pathname: string, item: PrimaryNavigationItem) {
  return [item.to, ...(item.activePaths ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default function PrimaryNavigation({
  roleName,
  items,
}: PrimaryNavigationProps) {
  const { pathname } = useLocation();

  return (
    <>
      <aside className="at-sidebar">
        <Link to={items[0]?.to ?? "/login"} className="at-brand">
          <span className="at-brand-mark" aria-hidden="true">
            <Droplets size={23} />
          </span>
          <span>
            <span className="block text-lg font-extrabold tracking-tight">
              Aqua<span className="text-cyan-500">Trail</span>
            </span>
            <span className="block text-xs text-slate-500">
              {roleName} workspace
            </span>
          </span>
        </Link>

        <nav
          aria-label={`${roleName} primary navigation`}
          className="mt-10 flex flex-col gap-2"
        >
          {items.map((item) => {
            const { label, to, icon: Icon } = item;
            const active = isPathActive(pathname, item);

            return (
              <NavLink
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`at-sidebar-link${active ? " is-active" : ""}`}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">AquaTrail</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Reliable water delivery, made simple.
          </p>
        </div>
      </aside>

      <nav
        aria-label={`${roleName} primary navigation`}
        className="at-mobile-nav"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {items.map((item) => {
            const { label, to, icon: Icon } = item;
            const active = isPathActive(pathname, item);

            return (
              <NavLink
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`at-mobile-nav-link${active ? " is-active" : ""}`}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
