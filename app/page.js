'use client';

import { useSession, signIn } from "next-auth/react";
import SignInButton from "./api/components/SignInButton";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <main style={{ color: "#fff", background: "#111", minHeight: "100vh" }}>Loading...</main>;
  }

  if (status === "unauthenticated") {
    return (
      <main style={{ color: "#fff", background: "#111", minHeight: "100vh" }}>
        <h1 style={{ fontSize: "2.5em", marginBottom: "1em" }}>Welcome to Offboarder</h1>
        <SignInButton />
        <section style={{
          marginTop: "3em",
          width: "100%",
          maxWidth: "520px",
          background: "#222",
          borderRadius: "18px",
          boxShadow: "0 6px 32px #0004",
          padding: "2em",
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

  // Authenticated users see Offboarding UI
  return (
    <main style={{
      minHeight: "100vh",
      background: "#111",
      color: "#eee",
      padding: "2em",
      fontFamily: "sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <h1 style={{ fontSize: "2.5em", marginBottom: "1em" }}>Welcome, {session.user?.name || session.user?.email}!</h1>
      <SignInButton />
      {/* Place your Offboarder UI here */}
      <section style={{
        marginTop: "3em",
        width: "100%",
        maxWidth: "520px",
        background: "#222",
        borderRadius: "18px",
        boxShadow: "0 6px 32px #0004",
        padding: "2em",
      }}>
        <h2>Offboarding Tools</h2>
        <p>You're now authenticated. You can safely offboard users from Entra ID.</p>
        {/* <OffboarderUI /> */}
      </section>
    </main>
  );
}
