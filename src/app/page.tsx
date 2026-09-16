import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect(session.role === "cajero" ? "/pos" : "/dashboard");
  }

  return <LoginForm />;
}
