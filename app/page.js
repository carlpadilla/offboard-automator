'use client';

import { useSession } from "next-auth/react";
import SignInButton from "./components/SignInButton";
import OffboarderUI from "./components/OffboarderUI";
import ThemeToggle from './components/ThemeToggle';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <main style={{ minHeight: "100vh" }}>
        Loading...
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main style={{
        minHeight: "100vh",
        padding: "2em",
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <ThemeToggle />
        </div>
        <h1 style={{ fontSize: "2.5em", marginBottom: "1em" }}>Welcome to Offboarder</h1>
        <SignInButton />
        <section className="card" style={{
          marginTop: "3em",
          width: "100%",
          maxWidth: "520px"
        }}>
          <h2>Get Started</h2>
          <ol>
            <li>Sign in with your Microsoft account.</li>
            <li>Access the offboarding tools after authentication.</li>
          </ol>
        </section>
      </main>
    );
  }

  // Authenticated users
  return (
    <main style={{
      minHeight: "100vh",
      padding: "2em",
      fontFamily: "sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <ThemeToggle />
      </div>
      <h1 style={{ fontSize: "2.5em", marginBottom: "1em" }}>
        Welcome, {session.user?.name || session.user?.email}!
      </h1>
      <SignInButton />
      <section className="card" style={{
        marginTop: "3em",
        width: "100%",
        maxWidth: "520px"
      }}>
        <h2>Offboarding Tools</h2>
        <OffboarderUI />
      </section>
    </main>
  );
}
