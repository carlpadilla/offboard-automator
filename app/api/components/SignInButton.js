'use client';

import { signIn, useSession, signOut } from "next-auth/react";

export default function SignInButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return <div>Loading...</div>;

  if (session) {
    return (
      <div style={{ margin: "1em 0" }}>
        <span>Welcome, {session.user?.name || session.user?.email}!</span>
        <button
          onClick={() => signOut()}
          style={{
            marginLeft: "1em",
            background: "#888",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "0.5em 1em",
            cursor: "pointer"
          }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("azure-ad")}
      style={{
        background: "#2563eb",
        color: "white",
        padding: "0.75em 1.5em",
        borderRadius: "8px",
        border: "none",
        fontSize: "1rem",
        cursor: "pointer",
        margin: "1em 0"
      }}
    >
      Sign In with Microsoft
    </button>
  );
}
