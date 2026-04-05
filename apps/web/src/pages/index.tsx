import { useEffect } from "react";
import { useRouter } from "next/router";
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);
  return <p>Redirecting to dashboard...</p>;
}
