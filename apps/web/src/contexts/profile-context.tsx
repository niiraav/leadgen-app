import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
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
  average_deal_size: string | null;
  custom_stages: string[] | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  calendly_link: string | null;
  // Sprint 8: Billing fields
  plan?: string | null;
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  stripe_customer_id?: string | null;
}

export interface SeenNudges {
  on_search?: boolean;
  on_email?: boolean;
  on_sequence?: boolean;
  on_win?: boolean;
  on_stale?: boolean;
}

export type NudgeTrigger = "on_search" | "on_email" | "on_sequence" | "on_win" | "on_stale";

export interface BillingStatus {
  plan: string;
  status: string;
  label: string;
  limit: number;
  searches_per_month: number;
  email_verifications: number;
  ai_emails_per_month: number;
  sequence_limit: number;
  subscription_ends_at: string | null;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  billingStatus: BillingStatus | null;
  billingLoading: boolean;
  refreshProfile: () => Promise<void>;
  refreshBilling: () => Promise<void>;
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
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  // In-memory nudge tracking — lost on refresh, per session
  const [seenNudges, setSeenNudges] = useState<SeenNudges>({});

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.profile.get();
      setProfile(data);
    } catch (err: any) {
      // Ignore 401 / auth errors — user may not be logged in yet
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        setProfile(null);
        return;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Billing is fetched lazily — only when a page that needs it calls refreshBilling()
  const refreshBilling = useCallback(async () => {
    if (billingStatus) return; // already loaded
    setBillingLoading(true);
    try {
      // Sync from Stripe first to ensure latest state
      await api.billing.sync().catch(() => {});
      const bs = (await api.billing.status()) as unknown as BillingStatus;
      setBillingStatus(bs);
    } catch {
      // billing not available yet (e.g. migration not run)
    } finally {
      setBillingLoading(false);
    }
  }, [billingStatus]);

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

  // Stabilize context value to prevent cascading re-renders in all consumers
  const contextValue = useMemo<ProfileContextValue>(() => ({
    profile, loading, refreshProfile, refreshBilling, updateProfile, generateUsp,
    seenNudges, markNudgeSeen, showNudge, billingStatus, billingLoading,
  }), [profile, loading, refreshProfile, refreshBilling, updateProfile, generateUsp,
    seenNudges, markNudgeSeen, showNudge, billingStatus, billingLoading]);

  return (
    <ProfileContext.Provider value={contextValue}>
      {children}
    </ProfileContext.Provider>
  );
}
