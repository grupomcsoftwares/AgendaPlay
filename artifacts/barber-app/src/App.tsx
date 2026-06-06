import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Sidebar } from "./components/layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import Dashboard from "./pages/dashboard";
import Services from "./pages/services";
import Barbers from "./pages/barbers";
import Clients from "./pages/clients";
import Settings from "./pages/settings";
import Queue from "./pages/queue";
import Appointments from "./pages/appointments";
import Financial from "./pages/financial";
import Booking from "./pages/booking";
import CancelBooking from "./pages/cancel";
import PublicBooking from "./pages/public-booking";
import Landing from "./pages/landing";
import Login from "./pages/login";
import Register from "./pages/register";
import Subscribe from "./pages/subscribe";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <Sidebar>
            <Dashboard />
          </Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/appointments">
        <ProtectedRoute>
          <Sidebar><Appointments /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/clients">
        <ProtectedRoute>
          <Sidebar><Clients /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/services">
        <ProtectedRoute>
          <Sidebar><Services /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/barbers">
        <ProtectedRoute>
          <Sidebar><Barbers /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/financial">
        <ProtectedRoute>
          <Sidebar><Financial /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Sidebar><Settings /></Sidebar>
        </ProtectedRoute>
      </Route>
      <Route path="/queue">
        <ProtectedRoute>
          <Queue />
        </ProtectedRoute>
      </Route>
      <Route path="/booking">
        <Booking />
      </Route>
      <Route path="/b/:slug">
        <PublicBooking />
      </Route>
      <Route path="/agendamento/:token">
        <CancelBooking />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeWrapper>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeWrapper>
  );
}

export default App;
