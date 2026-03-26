import { useState, useEffect } from "react";
import { Outlet } from "react-router";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { cn } from "@/react-app/lib/utils";

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "lg:block",
          isMobile && !mobileMenuOpen && "hidden",
          isMobile && mobileMenuOpen && "block"
        )}
      >
        <Sidebar
          collapsed={isMobile ? false : sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content */}
      <div
        className={cn(
          "transition-all duration-300",
          isMobile ? "ml-0" : sidebarCollapsed ? "ml-16" : "ml-64"
        )}
      >
        <Header
          onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          isMobile={isMobile}
        />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
