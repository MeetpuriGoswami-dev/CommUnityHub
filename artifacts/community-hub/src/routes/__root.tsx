import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/contexts";
import { AppLayout } from "@/lib/layout";
import LoginPage from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";
import VolunteerDashboard from "@/pages/volunteer-dashboard";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function AuthGuard() {
  const { user, authLoading } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user && !location.pathname.startsWith("/forms/")) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, location.pathname]);

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Public form pages - no auth needed
  if (location.pathname.startsWith("/forms/")) {
    return <Outlet />;
  }

  // Not logged in - show login
  if (!user) {
    return <LoginPage />;
  }

  // Must change password
  if (user.mustChangePassword || location.pathname === "/change-password") {
    return <ChangePasswordPage />;
  }

  // Volunteer role gets their own dashboard
  if (user.role === "volunteer") {
    return <VolunteerDashboard />;
  }

  // Admin layout with sidebar
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export const Route = createRootRoute({
  component: () => (
    <TooltipProvider>
      <AppProvider>
        <AuthGuard />
        <Toaster />
      </AppProvider>
    </TooltipProvider>
  ),
  notFoundComponent: () => <NotFound />,
});
