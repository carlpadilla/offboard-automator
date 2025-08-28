'use client';

import { signIn, useSession, signOut } from "next-auth/react";

export default function SignInButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return <div>Loading...</div>;

  if (session) {
    return (
      <div className="my-4 flex items-center gap-3">
        <span className="text-sm text-[var(--foreground)]">
          Welcome, {session.user?.name || session.user?.email}!
        </span>
        <button
          onClick={() => signOut()}
          className="rounded-md bg-zinc-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("azure-ad")}
      className="my-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      Sign In with Microsoft
    </button>
  );
}
