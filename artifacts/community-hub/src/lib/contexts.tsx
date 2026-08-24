import { createContext, useContext, useState, ReactNode, useEffect, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type Language = "en" | "hi" | "gu";

interface AppContextType {
  organizationId: number;
  setOrganizationId: (id: number) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  simpleMode: boolean;
  setSimpleMode: (mode: boolean) => void;
  user: AuthUser | null;
  authLoading: boolean;
  login: (email: string, password: string, role: "admin" | "volunteer") => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  organizations: any[];
  currentOrg: any | null;
  t: (key: string) => string;
}

export type AuthUser = {
  id: number;
  organizationId: number | null;
  volunteerId: number | null;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  isActive: boolean;
};

const translations = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.needs": "Needs",
    "nav.map": "Map View",
    "nav.volunteers": "Volunteers",
    "nav.smartHub": "Smart Hub",
    "nav.smartDrive": "Smart Drive",
    "nav.uploadHub": "Upload Hub",
    "nav.surveys": "Surveys",
    "nav.chat": "AI Assistant",
    "nav.upload": "Upload Hub",
    "nav.settings": "Settings",
    "app.title": "CommUnity Hub",
  },
  hi: {
    "nav.dashboard": "ડેશબોર્ડ",
    "nav.needs": "ઝરૂરતેં",
    "nav.map": "નક્શા",
    "nav.volunteers": "સ્વયંસેવક",
    "nav.smartHub": "स्मार्ट हब",
    "nav.smartDrive": "स्मार्ट ड्राइव",
    "nav.uploadHub": "अपलोड हब",
    "nav.surveys": "સર્વેક્ષણ",
    "nav.chat": "એઆઈ સહાયક",
    "nav.upload": "अपलोड हब",
    "nav.settings": "સેટિંગ્સ",
    "app.title": "કમ્યૂનિટી હબ",
  },
  gu: {
    "nav.dashboard": "ડેશબોર્ડ",
    "nav.needs": "જરૂરિયાતો",
    "nav.map": "નકશો",
    "nav.volunteers": "સ્વયંસેવકો",
    "nav.smartHub": "સ્માર્ટ હબ",
    "nav.smartDrive": "સ્માર્ટ ડ્રાઇવ",
    "nav.uploadHub": "અપલોડ હબ",
    "nav.surveys": "સર્વેક્ષણો",
    "nav.chat": "એઆઈ સહાયક",
    "nav.upload": "અપલોડ હબ",
    "nav.settings": "સેટિંગ્સ",
    "app.title": "કમ્યુનિટી હબ",
  }
};

const AppContext = createContext<AppContextType | undefined>(undefined);
const ORG_STORAGE_KEY = "comm_unity_selected_org_id";

export function AppProvider({ children }: { children: ReactNode }) {
  const [organizationId, setOrganizationIdState] = useState<number>(() => {
    const saved = localStorage.getItem(ORG_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 1;
  });
  const [language, setLanguage] = useState<Language>("en");
  const [simpleMode, setSimpleMode] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const queryClient = useQueryClient();

  // Reactive Organizations Query
  const { data: organizationsList } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiFetch<any[]>("/organizations"),
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true
  });

  const organizations = useMemo(() => organizationsList || [], [organizationsList]);
  const currentOrg = useMemo(() => 
    organizations.find(o => o.id === organizationId) || null,
  [organizations, organizationId]);

  // Invalidate all queries when organization changes
  useEffect(() => {
    if (organizationId) {
      queryClient.invalidateQueries();
    }
  }, [organizationId, queryClient]);

  const setOrganizationId = (id: number) => {
    setOrganizationIdState(id);
    localStorage.setItem(ORG_STORAGE_KEY, id.toString());
  };

  useEffect(() => {
    apiFetch<{ user: AuthUser | null }>("/auth/me")
      .then((result) => {
        setUser(result.user);
        if (result.user) {
          if (result.user.role !== "super_admin" && result.user.organizationId) {
            setOrganizationId(result.user.organizationId);
          } else if (result.user.role === "super_admin") {
            const saved = localStorage.getItem(ORG_STORAGE_KEY);
            if (!saved && result.user.organizationId) {
              setOrganizationId(result.user.organizationId);
            }
          }
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const login = async (email: string, password: string, role: "admin" | "volunteer") => {
    const result = await apiFetch<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, role }),
    });
    setUser(result.user);
    if (result.user.organizationId) {
      setOrganizationId(result.user.organizationId);
    }
    return result.user;
  };

  const logout = async () => {
    await apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    localStorage.removeItem(ORG_STORAGE_KEY);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const result = await apiFetch<{ user: AuthUser }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setUser(result.user);
    return result.user;
  };

  const t = (key: string) => {
    return (translations[language] as any)[key] || translations.en[key as keyof typeof translations.en] || key;
  };

  return (
    <AppContext.Provider value={{
      organizationId,
      setOrganizationId,
      language,
      setLanguage,
      simpleMode,
      setSimpleMode,
      user,
      authLoading,
      login,
      logout,
      changePassword,
      organizations,
      currentOrg,
      t
    }}>
      <div className={simpleMode ? "simple-mode" : ""}>
        {children}
      </div>
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
