import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
