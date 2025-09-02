'use client';

import { useSession } from "next-auth/react";
import SignInButton from "./components/SignInButton";
import OffboarderUI from "./components/OffboarderUI";
import ThemeToggle from './components/ThemeToggle';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <main className="min-h-screen grid place-items-center text-[var(--foreground)]">
        <div className="text-sm opacity-80">Loading...</div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen px-6 py-8 text-[var(--foreground)]">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <div className="mb-6 flex w-full items-center justify-end">
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Offboarder!!</h1>
          <SignInButton />
          <section className="card mt-10 w-full max-w-xl">
            <h2 className="mb-3 text-xl font-semibold">Get Started</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm opacity-90">
              <li>Sign in with your Microsoft account.</li>
              <li>Access the offboarding tools after authentication.</li>
            </ol>
          </section>
        </div>
      </main>
    );
  }

  // Authenticated users
  return (
    <main className="min-h-screen px-6 py-8 text-[var(--foreground)]">
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        <div className="mb-6 flex w-full items-center justify-end">
          <ThemeToggle />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Welcome, {session.user?.name || session.user?.email}!
        </h1>
        <SignInButton />
        <section className="card mt-10 w-full max-w-xl">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Offboarding Tools</h2>
            <p className="mt-1 text-sm opacity-80">Select users and optionally disable their assigned devices.</p>
          </div>
          <OffboarderUI />
        </section>
      </div>
    </main>
  );
}
