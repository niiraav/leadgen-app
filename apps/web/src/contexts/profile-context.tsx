import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface UserProfile {
  id: string;
  user_email?: string;
  full_name: string | null;
  company_name: string | null;
  role: string | null;
  services: string[];
  custom_services: string[];
  usp: string | null;
  tone: string;
  signoff_style: string;
  cta_preference: string;
  target_geography: string | null;
  target_categories: string[];
  working_days: string[];
  working_hours_start: string;
  working_hours_end: string;
  sales_cycle_days: number;
  onboarding_step: number;
  profile_complete: boolean;
  profile_score?: number;
  average_deal_value: number | null;
  calendly_link: string | null;
  linkedin_url: string | null;
}

export type NudgeTrigger = "on_search" | "on_email" | "on_sequence" | "on_win" | "on_stale";

export interface SeenNudges {
  on_search?: boolean;
  on_email?: boolean;
  on_sequence?: boolean;
  on_win?: boolean;
  on_stale?: boolean;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  generateUsp: (data: Record<string, unknown>) => Promise<{ pitches: string[] }>;
  seenNudges: SeenNudges;
  markNudgeSeen: (trigger: NudgeTrigger) => void;
  showNudge: (trigger: NudgeTrigger) => boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // In-memory nudge tracking — lost on refresh, per session
  const [seenNudges, setSeenNudges] = useState<SeenNudges>({});

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.profile.get();
      setProfile(data);
    } catch {
      // not logged in or no profile yet
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data: Partial<UserProfile>) => {
    try {
      const updated = await api.profile.patch(data as Record<string, unknown>);
      setProfile((prev) => prev ? { ...prev, ...updated } : updated);
    } catch (err: any) {
      console.error("[Profile] Update failed:", err.message);
    }
  }, []);

  const generateUsp = useCallback(async (data: Record<string, unknown>) => {
    return api.profile.generateUsp(data);
  }, []);

  const markNudgeSeen = useCallback((trigger: NudgeTrigger) => {
    setSeenNudges((prev) => ({ ...prev, [trigger]: true }));
  }, []);

  const showNudge = useCallback((trigger: NudgeTrigger) => {
    if (seenNudges[trigger]) return false;

    // Also check profile data — some nudges shouldn't show if profile is already set
    if (!profile) return false;
    switch (trigger) {
      case "on_search":
        return !profile.target_geography;
      case "on_email":
        return profile.signoff_style === "Best regards";
      case "on_sequence":
        return profile.working_hours_start === "09:00" && profile.working_hours_end === "18:00";
      default:
        return true;
    }
  }, [seenNudges, profile]);

  // Load profile on mount
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <ProfileContext.Provider
      value={{ profile, loading, refreshProfile, updateProfile, generateUsp, seenNudges, markNudgeSeen, showNudge }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
