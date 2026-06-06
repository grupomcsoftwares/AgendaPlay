import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    } else if (!loading && user && !user.canAccess) {
      setLocation("/subscribe");
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "hsl(0 0% 4%)" }}
      >
        <div
          className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
          style={{
            borderColor: "hsl(var(--sidebar-primary))",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  if (!user || !user.canAccess) {
    return null;
  }

  return <>{children}</>;
}
