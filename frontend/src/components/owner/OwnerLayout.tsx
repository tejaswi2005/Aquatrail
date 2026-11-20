import { ClipboardList, Home, Settings, Users } from "lucide-react";
import { Outlet } from "react-router-dom";
import PrimaryNavigation, {
  type PrimaryNavigationItem,
} from "../navigation/PrimaryNavigation";

const ownerLinks: PrimaryNavigationItem[] = [
  { label: "Home", to: "/owner/dashboard", icon: Home },
  {
    label: "Orders",
    to: "/owner/orders",
    icon: ClipboardList,
    activePaths: ["/owner/scheduled-deliveries"],
  },
  { label: "Customers", to: "/owner/customers", icon: Users },
  {
    label: "Settings",
    to: "/owner/settings",
    icon: Settings,
    activePaths: ["/owner/change-password"],
  },
];

export default function OwnerLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PrimaryNavigation roleName="Owner" items={ownerLinks} />
      <div className="min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
        <Outlet />
      </div>
    </div>
  );
}
