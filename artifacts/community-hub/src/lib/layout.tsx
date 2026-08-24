import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAppContext } from "./contexts";
import {
  LayoutDashboard,
  ListTodo,
  Map as MapIcon,
  Users,
  ClipboardList,
  MessageSquare,
  UploadCloud,
  Settings,
  Menu,
  ChevronDown,
  ChevronRight,
  LogOut,
  AlertTriangle,
  LayoutGrid,
  HardDrive,
} from "lucide-react";
import { useGetPendingAssignments } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LayoutProps {
  children: ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  icon: any;
};

type NavGroup = {
  id: string;
  label: string;
  icon: any;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const SMART_HUB_STORAGE_KEY = "smartHubExpanded";

export function AppLayout({ children }: LayoutProps) {
  const { pathname: location } = useLocation();
  const navigate = useNavigate();
  const {
    organizationId,
    setOrganizationId,
    language,
    setLanguage,
    t,
    simpleMode,
    user,
    logout,
    organizations,
    currentOrg
  } = useAppContext();
  const queryClient = useQueryClient();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [smartHubExpanded, setSmartHubExpanded] = useState(() => {
    const saved = localStorage.getItem(SMART_HUB_STORAGE_KEY);
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(SMART_HUB_STORAGE_KEY, String(smartHubExpanded));
  }, [smartHubExpanded]);

  // Auto-expand Smart Hub if the current route is inside it
  // and ensure mobile menu collapses explicitly on any route changes
  useEffect(() => {
    if (["/smart-drive", "/upload-hub"].some(p => location === p || location.startsWith(p + "/"))) {
      setSmartHubExpanded(true);
    }
    setMobileMenuOpen(false);
  }, [location]);

  const handleOrgSwitch = (id: number) => {
    setOrganizationId(id);
    queryClient.invalidateQueries();
  };

  const { data: pendingRequests } = useGetPendingAssignments(
    { organizationId: organizationId! },
    { query: { enabled: !!organizationId && (user?.role === "admin" || user?.role === "coordinator" || user?.role === "super_admin"), refetchInterval: 10000 } as any }
  );
  const pendingCount = (pendingRequests as any)?.length || 0;

  const isAdminLike = user?.role === "admin" || user?.role === "coordinator" || user?.role === "super_admin";

  const navEntries: NavEntry[] = [
    { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
    { href: "/needs", label: "nav.needs", icon: ListTodo },
    { href: "/map", label: "nav.map", icon: MapIcon },
    { href: "/volunteers", label: "nav.volunteers", icon: Users },
    // Smart Hub group — only visible to admin roles
    ...(isAdminLike ? [{
      id: "smart-hub",
      label: "nav.smartHub",
      icon: LayoutGrid,
      children: [
        { href: "/smart-drive", label: "nav.smartDrive", icon: HardDrive },
        { href: "/upload-hub", label: "nav.uploadHub", icon: UploadCloud },
      ]
    } as NavGroup] : []),
    { href: "/surveys", label: "nav.surveys", icon: ClipboardList },
    { href: "/chat", label: "nav.chat", icon: MessageSquare },
    { href: "/settings", label: "nav.settings", icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    window.location.href = import.meta.env.BASE_URL;
  };

  const formattedRole = user?.role ? user.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : "User";
  const displayName = user?.name || "Admin";
  const showRole = displayName.toLowerCase() !== formattedRole.toLowerCase();

  const NavLinks = () => (
    <div className="flex flex-col gap-1 w-full relative">
      {navEntries.map((entry, entryIdx) => {
        if (isGroup(entry)) {
          const groupActive = entry.children.some(
            child => location === child.href || location.startsWith(child.href + "/")
          );
          const expanded = smartHubExpanded;

          const handleNavClick = (href: string) => {
            if (mobileMenuOpen) {
              setMobileMenuOpen(false);
              setTimeout(() => navigate({ to: href }), 150);
            } else {
              navigate({ to: href });
            }
          };

          return (
            <div key={entry.id}>
              {/* Group header */}
              <div
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer transition-all duration-[130ms] ease-out ${
                  groupActive && !expanded ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                } ${simpleMode ? 'py-4 text-lg' : 'text-sm'}`}
                onClick={() => setSmartHubExpanded(!expanded)}
              >
                <div className="flex items-center gap-3">
                  <entry.icon className={`${simpleMode ? 'w-6 h-6' : 'w-4 h-4'}`} />
                  <span>{t(entry.label)}</span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-sidebar-foreground/50 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                />
              </div>

              {/* Children */}
              <div
                className={`overflow-hidden transition-all duration-200 ease-out ${
                  expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="ml-3 pl-3 border-l border-sidebar-border/50 mt-0.5 mb-1 space-y-0.5">
                  {entry.children.map((child) => {
                    const isActive = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                    return (
                        <div key={child.href} onClick={() => handleNavClick(child.href)} className={`group relative flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all duration-[130ms] ease-out ${
                          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        } ${simpleMode ? 'py-3 text-base' : 'text-[13px]'}`}>
                          <child.icon className={`${simpleMode ? 'w-5 h-5' : 'w-3.5 h-3.5'}`} />
                          <span>{t(child.label)}</span>
                          {isActive && (
                            <div
                              className="absolute left-0 w-1 bg-primary rounded-r-full animate-[accent-slide_200ms_ease-out]"
                              style={{ height: '100%' }}
                            />
                          )}
                        </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        // Regular nav item
        const item = entry as NavItem;
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        
        const handleNavClick = (href: string) => {
          if (mobileMenuOpen) {
            setMobileMenuOpen(false);
            setTimeout(() => navigate({ to: href }), 150);
          } else {
            navigate({ to: href });
          }
        };

        return (
            <div key={item.href} onClick={() => handleNavClick(item.href)} className={`group relative flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer transition-all duration-[130ms] ease-out ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'} ${simpleMode ? 'py-4 text-lg' : 'text-sm'}`}>
              <div className="flex items-center gap-3">
                <item.icon className={`${simpleMode ? 'w-6 h-6' : 'w-4 h-4'}`} />
                <span>{t(item.label)}</span>
              </div>

              {isActive && (
                <div
                  className="absolute left-0 w-1 bg-primary rounded-r-full animate-[accent-slide_200ms_ease-out]"
                  style={{ height: '100%' }}
                />
              )}

              {item.href === "/" && pendingCount > 0 && (
                <div className={`bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${pendingCount > 0 ? 'animate-scale-pulse' : ''}`}>
                  {pendingCount}
                </div>
              )}
            </div>
        );
      })}
    </div>
  );

  return (
    <div className={`h-[100dvh] overflow-hidden bg-background flex flex-col md:flex-row w-full ${simpleMode ? 'text-lg' : ''}`}>
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border shadow-sm">
        <div className="flex items-center gap-2 font-bold text-lg">
          <img src="/favicon.png" alt="CommUnity Hub Logo" className="w-8 h-8 object-contain drop-shadow-sm" />
          CommUnity Hub
        </div>
        <div className="flex items-center gap-2">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0 border-r-sidebar-border text-sidebar-foreground flex flex-col h-[100dvh]">
              <div className="p-4 border-b border-sidebar-border">
                <div className="font-bold text-xl mb-4">CommUnity Hub</div>
                {(organizations?.length > 0 || user?.role === "super_admin") && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between bg-sidebar-accent border-sidebar-accent-border text-sidebar-foreground h-9 px-2">
                        <span className="truncate text-xs font-medium">{organizationId === 0 ? "All Organizations" : (currentOrg?.name || "Select Org")}</span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      {user?.role === "super_admin" && (
                        <DropdownMenuItem onClick={() => handleOrgSwitch(0)} className="font-bold border-b mb-1">
                          All Organizations
                        </DropdownMenuItem>
                      )}
                      {organizations.map((org) => (
                        <DropdownMenuItem key={org.id} onClick={() => handleOrgSwitch(org.id)}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${org.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                            {org.name}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <ScrollArea className="flex-1 min-h-0 px-2 py-4">
                <NavLinks />
              </ScrollArea>
              <div className="p-4 border-t border-sidebar-border mt-auto">
                <div className="px-3 pb-3">
                  <div className="font-medium text-sidebar-foreground text-sm truncate">{displayName}</div>
                  {showRole && <div className="text-xs text-sidebar-foreground/70 truncate">{formattedRole}</div>}
                  <div className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">{user?.email}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 shadow-lg relative z-20">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3 font-bold text-xl tracking-tight text-white mb-6">
            <img src="/favicon.png" alt="CommUnity Hub Logo" className="w-8 h-8 object-contain drop-shadow-md" />
            CommUnity Hub
          </div>

          {(organizations?.length > 0 || user?.role === "super_admin") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground h-10 px-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Avatar className="w-5 h-5 rounded-sm bg-primary/20">
                      <AvatarFallback className="text-[10px] rounded-sm bg-transparent text-primary-foreground font-bold">
                        {organizationId === 0 ? "ALL" : (currentOrg?.name?.substring(0, 2).toUpperCase() || "O")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{organizationId === 0 ? "All Organizations" : (currentOrg?.name || "Select Organization")}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {user?.role === "super_admin" && (
                  <DropdownMenuItem onClick={() => handleOrgSwitch(0)} className="font-bold border-b mb-1">
                    All Organizations
                  </DropdownMenuItem>
                )}
                {organizations.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => handleOrgSwitch(org.id)}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${org.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      {org.name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 px-3 py-4">
          <NavLinks />
        </ScrollArea>

        <div className="p-4 border-t border-sidebar-border space-y-3 mt-auto">
          <div className="px-3">
            <div className="font-medium text-sidebar-foreground text-sm truncate">{displayName}</div>
            {showRole && <div className="text-xs text-sidebar-foreground/70 truncate">{formattedRole}</div>}
            <div className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">{user?.email}</div>
          </div>
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-[10px] text-sidebar-foreground/30 font-mono">
              v1.0.0
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors group">
            <LogOut className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-background relative overflow-y-auto">
        <div className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-6xl animate-page-entrance">
            {children}
          </div>
        </div>

        {/* Global Deactivation Lockdown Overlay */}
        {currentOrg && !currentOrg.isActive && !location.startsWith("/settings") && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 text-center backdrop-blur-md bg-background/60 animate-in fade-in duration-500">
            <div className="max-w-md p-10 glass-card border-none shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 mx-auto bg-destructive/10 rounded-full flex items-center justify-center mb-2">
                <AlertTriangle className="w-12 h-12 text-destructive animate-pulse" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Service Suspended</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  The organization <strong className="text-foreground">"{currentOrg.name}"</strong> has been deactivated.
                </p>
                <p className="text-muted-foreground text-sm">
                  All administrative actions, volunteer registrations, and AI services are currently barred for this entity.
                </p>
              </div>

              {user?.role === "super_admin" && (
                <div className="pt-4 flex flex-col gap-3">
                  <Link href="/settings">
                    <Button variant="outline" className="w-full">
                      Go to Organization Management
                    </Button>
                  </Link>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Or switch context below</p>
                </div>
              )}

              <div className="p-4 bg-muted/30 rounded-2xl text-sm border border-border/50 text-muted-foreground italic">
                Please contact a super-administrator or switch to an active organization from the sidebar to continue.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
