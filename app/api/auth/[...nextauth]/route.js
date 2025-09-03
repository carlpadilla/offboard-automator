// app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

export const authOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID,
      // Delegated Graph scopes (admin consent must be granted in the app reg)
      authorization: {
        params: {
          scope: [
            "openid",
            "profile",
            "email",
            "offline_access",
            "User.Read",
            "User.ReadWrite.All",
            "Group.ReadWrite.All",
            "Directory.AccessAsUser.All"
          ].join(" "),
          prompt: "select_account"
        }
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,

  // Put the Azure AD access_token onto the session so API routes can use it.
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // On initial sign-in, account is present — capture tokens
      if (account) {
        token.accessToken = account.access_token; // <-- the important bit
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken || null; // API will read this
      session.idToken = token.idToken || null;
      session.expiresAt = token.expiresAt || null;
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };



// import NextAuth from "next-auth";
// import AzureADProvider from "next-auth/providers/azure-ad";

// // Toggle delegated mode with an env var.
// // Default = app-only (no Graph write scopes requested from the user)
// const USE_DELEGATED = String(process.env.NEXTAUTH_USE_DELEGATED).toLowerCase() === "true";

// // Base identity scopes (needed for sign-in + refresh)
// const baseScopes = ["openid", "profile", "email", "offline_access"];

// // If you want delegated Graph ops (instead of app-only), we must request Graph scopes here.
// const delegatedGraphScopes = [
//   "User.ReadWrite.All",
//   "Group.ReadWrite.All",
//   "Directory.ReadWrite.All",
//   // Uncomment if you actually disable devices via Graph
//   "Device.ReadWrite.All",
// ];

// const scope = USE_DELEGATED
//   ? [...baseScopes, ...delegatedGraphScopes].join(" ")
//   : baseScopes.join(" ");

// export const authOptions = {
//   providers: [
//     AzureADProvider({
//       clientId: process.env.AZURE_CLIENT_ID,
//       clientSecret: process.env.AZURE_CLIENT_SECRET,
//       tenantId: process.env.AZURE_TENANT_ID,
//       authorization: {
//         params: {
//           scope,
//           prompt: "select_account",
//         },
//       },
//     }),
//   ],
//   secret: process.env.NEXTAUTH_SECRET,

//   // We always use JWT sessions
//   session: { strategy: "jwt" },

//   // Only surface the access token when in delegated mode
//   callbacks: {
//     async jwt({ token, account }) {
//       if (account?.access_token) {
//         token.accessToken = account.access_token;
//         token.expiresAt = account.expires_at;
//       }
//       return token;
//     },
//     async session({ session, token }) {
//       if (USE_DELEGATED) {
//         session.accessToken = token.accessToken;
//         session.expiresAt = token.expiresAt;
//       } else {
//         // In app-only mode we don't expose a user access token
//         delete session.accessToken;
//         delete session.expiresAt;
//       }
//       return session;
//     },
//   },
// };

// const handler = NextAuth(authOptions);
// export { handler as GET, handler as POST };


// import NextAuth from "next-auth";
// import AzureADProvider from "next-auth/providers/azure-ad";

// export const authOptions = {
//   providers: [
//     AzureADProvider({
//       clientId: process.env.AZURE_CLIENT_ID,
//       clientSecret: process.env.AZURE_CLIENT_SECRET,
//       tenantId: process.env.AZURE_TENANT_ID,
//       // ✅ Only identity scopes; no privileged Graph scopes here
//       authorization: {
//         params: {
//           scope: "openid profile email offline_access",
//           prompt: "select_account",
//         },
//       },
//     }),
//   ],
//   secret: process.env.NEXTAUTH_SECRET,
//   // We only gate UI access; we do NOT use the user's access token anymore
//   session: { strategy: "jwt" },
// };

// const handler = NextAuth(authOptions);
// export { handler as GET, handler as POST };
// app/api/auth/[...nextauth]/route.js