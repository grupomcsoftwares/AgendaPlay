import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Sidebar } from "./components/layout";
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
import Landing from "./pages/landing";
import Login from "./pages/login";
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
      <Route path="/dashboard">
        <Sidebar>
          <Dashboard />
        </Sidebar>
      </Route>
      <Route path="/appointments">
        <Sidebar><Appointments /></Sidebar>
      </Route>
      <Route path="/clients">
        <Sidebar><Clients /></Sidebar>
      </Route>
      <Route path="/services">
        <Sidebar><Services /></Sidebar>
      </Route>
      <Route path="/barbers">
        <Sidebar><Barbers /></Sidebar>
      </Route>
      <Route path="/financial">
        <Sidebar><Financial /></Sidebar>
      </Route>
      <Route path="/settings">
        <Sidebar><Settings /></Sidebar>
      </Route>
      <Route path="/queue">
        <Queue />
      </Route>
      <Route path="/booking">
        <Booking />
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
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeWrapper>
  );
}

export default App;
