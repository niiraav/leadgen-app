import type { GetServerSideProps } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";
import { useState } from "react";
import { useRouter } from "next/router";
import { Zap, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <Zap className="w-8 h-8 text-primary" aria-hidden="true" />
            <span className="font-bold text-xl text-foreground tracking-tight">LeadGen</span>
          </div>
          <div className="rounded-xl border border-green/20 bg-success/5 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Click the link to activate your account, then sign in.
            </p>
            <a href="/auth/login" className="inline-block mt-6 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm">
              ← Back to sign in
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
      <main className="min-h-dvh flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Zap className="w-8 h-8 text-primary" aria-hidden="true" />
          <span className="font-bold text-xl text-foreground tracking-tight">LeadGen</span>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-8">
          <h1 className="text-xl font-bold text-foreground mb-1">Create account</h1>
          <p className="text-sm text-muted-foreground mb-6">Start managing your leads</p>

          {error && (
            <div role="alert" aria-live="assertive" className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className="input"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Already have an account?{" "}
            <a href="/auth/login" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const supabase = createServerSupabaseClient(req, res);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }

  return { props: { __authPage: true } };
};
