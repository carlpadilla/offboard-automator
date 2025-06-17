import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

export const authOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID,
      authorization: {
        params: {
          scope: "openid profile email User.ReadWrite.All Device.ReadWrite.All offline_access"
        }
      }
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,

  // --- ADD THESE CALLBACKS ---
  callbacks: {
    async jwt({ token, account }) {
      // This adds the access token to the JWT on sign in
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // This exposes the access token in the session object (so your API route can access it)
      if (token?.accessToken) {
        session.accessToken = token.accessToken;
      }
      return session;
    }
  },
  // --- END OF CALLBACKS ---
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
