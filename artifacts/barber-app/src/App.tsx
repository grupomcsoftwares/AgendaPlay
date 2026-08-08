import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { Sidebar } from "./components/layout";
import { playAlert15, playNewAppointment, playRescheduled } from "@/lib/sounds";
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

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep errors visible inside the mobile WebView instead of rendering a
    // completely black page. The native host can still reload the dashboard.
    window.ReactNativeWebView?.postMessage(JSON.stringify({
      type: "AGENDAPLAY_WEB_ERROR",
      message: error.message,
      componentStack: info.componentStack,
    }));
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Não foi possível abrir esta tela</h1>
          <p className="text-sm text-muted-foreground">
            Feche e abra Configurações novamente. Se o problema continuar, atualize o aplicativo.
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Play alert sound when a push notification arrives and the app is open
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PLAY_SOUND") {
        const s = event.data?.sound;
        if (s === "rescheduled") playRescheduled();
        else if (s === "new") playNewAppointment();
        else playAlert15();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
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
    <AppErrorBoundary>
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
    </AppErrorBoundary>
  );
}

export default App;
