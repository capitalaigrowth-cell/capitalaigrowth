import { redirect } from "next/navigation";

// Always go to login — let the login page handle the auth redirect
export default function Home() {
  redirect("/login");
}
