import { CalendarDays, ClipboardList, Home, UserRound } from "lucide-react";
import { Outlet } from "react-router-dom";
import PrimaryNavigation, {
  type PrimaryNavigationItem,
} from "../navigation/PrimaryNavigation";

const customerLinks: PrimaryNavigationItem[] = [
  { label: "Home", to: "/customer/dashboard", icon: Home },
  {
    label: "Orders",
    to: "/customer/orders",
    icon: ClipboardList,
    activePaths: ["/customer/track"],
  },
  {
    label: "Subscription",
    to: "/customer/subscriptions",
    icon: CalendarDays,
    activePaths: ["/customer/order-types"],
  },
  { label: "Profile", to: "/customer/profile", icon: UserRound },
];

export default function CustomerLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PrimaryNavigation roleName="Customer" items={customerLinks} />
      <div className="min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
        <Outlet />
      </div>
    </div>
  );
}
