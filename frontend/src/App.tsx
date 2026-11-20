import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import CustomerLayout from "./components/customer/CustomerLayout";
import OwnerLayout from "./components/owner/OwnerLayout";
import ProtectedRoute from "./components/ProtectedRoute";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const OwnerDashboard = lazy(() => import("./pages/owner/OwnerDashboard"));
const OwnerProducts = lazy(() => import("./pages/owner/OwnerProducts"));
const OwnerOrders = lazy(() => import("./pages/owner/OwnerOrders"));
const OwnerScheduledDeliveries = lazy(
  () => import("./pages/owner/OwnerScheduledDeliveries")
);
const Customers = lazy(() => import("./pages/owner/Customers"));
const Drivers = lazy(() => import("./pages/owner/Drivers"));
const OwnerSettings = lazy(() => import("./pages/owner/OwnerSettings"));
const OwnerChangePassword = lazy(
  () => import("./pages/owner/OwnerChangePassword")
);
const Inventory = lazy(() => import("./pages/owner/Inventory"));
const DriverDashboard = lazy(() => import("./pages/driver/DriverDashboard"));
const CustomerDashboard = lazy(
  () => import("./pages/customer/CustomerDashboard")
);
const CustomerProfile = lazy(() => import("./pages/customer/CustomerProfile"));
const CustomerOrders = lazy(() => import("./pages/customer/CustomerOrders"));
const TrackDelivery = lazy(() => import("./pages/customer/TrackDelivery"));
const CustomerOrderDetails = lazy(
  () => import("./pages/customer/CustomerOrderDetails")
);
const CustomerOrderTypeSelection = lazy(
  () => import("./pages/customer/CustomerOrderTypeSelection")
);
const CustomerSubscriptions = lazy(
  () => import("./pages/customer/CustomerSubscriptions")
);

function LoadingPage() {
  return (
    <main
      className="flex min-h-[50vh] items-center justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm">
        <LoaderCircle
          className="animate-spin text-blue-600"
          size={20}
          aria-hidden="true"
        />
        Loading AquaTrail…
      </div>
    </main>
  );
}

function Unauthorized() {
  return (
    <main className="p-10 text-center">
      <h1 className="text-2xl font-bold">Access denied</h1>
      <p className="mt-2 text-slate-500">
        You do not have permission to access this page.
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="p-10 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-500">
        The page you are looking for does not exist or may have moved.
      </p>
      <Link
        to="/login"
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
      >
        Go to sign in
      </Link>
    </main>
  );
}

function TrackDeliveryRoute() {
  const { deliveryId } = useParams<{ deliveryId: string }>();

  if (!deliveryId) {
    return <Navigate to="/customer/orders" replace />;
  }

  return <TrackDelivery deliveryId={deliveryId} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingPage />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<ProtectedRoute allowedRoles={["OWNER"]} />}>
            <Route element={<OwnerLayout />}>
              <Route path="/owner/dashboard" element={<OwnerDashboard />} />
              <Route path="/owner/products" element={<OwnerProducts />} />
              <Route path="/owner/orders" element={<OwnerOrders />} />
              <Route
                path="/owner/scheduled-deliveries"
                element={<OwnerScheduledDeliveries />}
              />
              <Route path="/owner/customers" element={<Customers />} />
              <Route path="/owner/drivers" element={<Drivers />} />
              <Route path="/owner/settings" element={<OwnerSettings />} />
              <Route
                path="/owner/change-password"
                element={<OwnerChangePassword />}
              />
              <Route path="/owner/inventory" element={<Inventory />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["DRIVER"]} />}>
            <Route
              path="/driver/dashboard"
              element={<DriverDashboard />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["CUSTOMER"]} />}>
            <Route element={<CustomerLayout />}>
              <Route
                path="/customer/dashboard"
                element={<CustomerDashboard />}
              />
              <Route
                path="/customer/profile"
                element={<CustomerProfile />}
              />
              <Route
                path="/customer/orders"
                element={<CustomerOrders />}
              />
              <Route
                path="/customer/order-types"
                element={<CustomerOrderTypeSelection />}
              />
              <Route
                path="/customer/subscriptions"
                element={<CustomerSubscriptions />}
              />
              <Route
                path="/customer/track/:deliveryId"
                element={<TrackDeliveryRoute />}
              />
              <Route
                path="/customer/orders/:orderId"
                element={<CustomerOrderDetails />}
              />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}