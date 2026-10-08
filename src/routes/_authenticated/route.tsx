import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { prefetchSection } from "@/lib/prefetch";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
  ArrowLeftRight,
  LogOut,
  Shield,
  Users,
  Receipt,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useOrgStatusNotifier } from "@/hooks/use-org-status-notifier";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { invite: undefined } });
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, org_id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.status !== "approved") {
      throw redirect({ to: "/pending" });
    }
    // Super admin bypasses org suspension gate below.
    const { data: superRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!superRole && profile.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", profile.org_id)
        .maybeSingle();
      if (!org || org.status === "suspended" || org.status === "rejected") {
        throw redirect({ to: "/pending" });
      }
    }
    if (superRole && location.pathname !== "/admin") {
      throw redirect({ to: "/admin" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

const navItems = [
  { title: "Billing", short: "Billing", url: "/billing", icon: Receipt },
  { title: "Dashboard", short: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", short: "Products", url: "/products", icon: Package },
  { title: "Categories", short: "Tags", url: "/categories", icon: Tags },
  { title: "Suppliers", short: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Transactions", short: "Activity", url: "/transactions", icon: ArrowLeftRight },
] as const;

/** How many destinations fit comfortably in a phone-width tab bar. */
const MAX_MOBILE_TABS = 4;

function AuthedLayout() {
  return (
    <SidebarProvider>
      <LayoutShell />
    </SidebarProvider>
  );
}

function LayoutShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const { setOpenMobile, isMobile } = useSidebar();

  const { data: isSuperAdmin } = useQuery({
    queryKey: ["is_super_admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  const { data: myOrgId } = useQuery({
    queryKey: ["my-org-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      return (data?.org_id as string | null) ?? null;
    },
    staleTime: 60_000,
  });

  // Notify non-super-admins when their org status changes (suspended / reactivated).
  useOrgStatusNotifier(myOrgId ?? null, !isSuperAdmin);

  const { data: isOrgAdmin } = useQuery({
    queryKey: ["is_org_admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Staff accounts live in Billing: no Dashboard nav, and /dashboard bounces there.
  const rolesResolved = isSuperAdmin !== undefined && isOrgAdmin !== undefined;
  const isStaffOnly = isSuperAdmin === false && isOrgAdmin === false;
  const homePath = isSuperAdmin ? "/admin" : isOrgAdmin ? "/dashboard" : "/billing";

  useEffect(() => {
    if (rolesResolved && isStaffOnly && pathname === "/dashboard") {
      navigate({ to: "/billing", replace: true });
    }
  }, [rolesResolved, isStaffOnly, pathname, navigate]);

  // Hide Dashboard from staff-only users.
  const visibleNavItems = isStaffOnly
    ? navItems.filter((item) => item.url !== "/dashboard")
    : [...navItems];

  // Admins get Dashboard as the top menu item; everyone else keeps Billing first.
  const navForRole = (() => {
    if (!isOrgAdmin) return visibleNavItems;
    const dash = visibleNavItems.find((item) => item.url === "/dashboard");
    return dash ? [dash, ...visibleNavItems.filter((item) => item !== dash)] : visibleNavItems;
  })();

  // Phone tab bar shows the top N; the rest live behind the "More" drawer.
  const mobileTabs = navForRole.slice(0, MAX_MOBILE_TABS);
  const overflow = navForRole.slice(MAX_MOBILE_TABS);

  const signOut = async () => {
    closeOnMobile();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", search: { invite: undefined }, replace: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-muted/20 pt-safe">
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <Link to={homePath} className="flex items-center gap-2 px-2 py-2">
            <img
              src="/logo.png"
              alt="StockLine"
              className="h-8 w-8 rounded-md object-contain bg-background"
            />
            <div className="font-semibold group-data-[collapsible=icon]:hidden">StockLine</div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {!isSuperAdmin &&
                  navForRole.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.url}
                        onMouseEnter={() => prefetchSection(qc, item.url)}
                        onFocus={() => prefetchSection(qc, item.url)}
                      >
                        <Link to={item.url} onClick={closeOnMobile}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                {isOrgAdmin && !isSuperAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/members"}>
                      <Link to="/members" onClick={closeOnMobile}>
                        <Users className="h-4 w-4" />
                        <span>Team members</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isSuperAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/admin"}>
                      <Link to="/admin" onClick={closeOnMobile}>
                        <Shield className="h-4 w-4" />
                        <span>Admin</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t">
          <div className="px-2 py-2 text-xs text-sidebar-foreground/80 truncate group-data-[collapsible=icon]:hidden">
            {(user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email}
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
            <LogOut className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center gap-2 border-b bg-background px-4 sticky top-0 z-10">
          <SidebarTrigger aria-label="Open navigation menu" />
          <h1 className="font-semibold capitalize truncate">
            {navItems.find((n) => n.url === pathname)?.title ?? "StockLine"}
          </h1>
        </header>
        <main className="flex-1 p-3 pb-safe-tab sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile tab bar — the sidebar drawer stays reachable via the header trigger */}
      {!isSuperAdmin && (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-5">
            {mobileTabs.map((item) => {
              const active = pathname === item.url;
              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="w-full truncate text-center">{item.short}</span>
                  </Link>
                </li>
              );
            })}
            {overflow.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setOpenMobile(true)}
                  className="flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground transition-colors"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="w-full truncate text-center">More</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </div>
  );
}
