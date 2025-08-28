import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

async function getAppGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  return Client.init({
    authProvider: (done) => done(null, token.token),
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = await getAppGraphClient();
    const users = await client.api("/users").select("id,displayName,mail,userPrincipalName").top(100).get();
    return NextResponse.json({ users: users.value || [] });
  } catch (e) {
    return NextResponse.json({ users: [], error: e?.message || String(e) }, { status: 500 });
  }
}
