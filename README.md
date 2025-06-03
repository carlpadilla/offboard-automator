---

# **README: Offboard Entra Users Web App**

---

## **Overview**

This project is a secure, modern web application built with **Next.js** for automating the offboarding of users from Microsoft Entra ID (Azure AD).
It allows you to:

* Select one or more users via dropdowns
* Offboard each by:

  * Disabling the account
  * Revoking sign-in sessions
  * Replacing the company name with “Former Employee”
* See a step-by-step summary of all offboarding actions for each user

All actions are performed securely via the Microsoft Graph API using application permissions.

---

## **Table of Contents**

* [Prerequisites](#prerequisites)
* [Azure AD App Registration](#azure-ad-app-registration)
* [Local Setup](#local-setup)
* [Running the App](#running-the-app)
* [Project Structure](#project-structure)
* [API and Frontend Code](#api-and-frontend-code)
* [Usage](#usage)
* [Security Notes](#security-notes)
* [Production Deployment](#production-deployment)
* [Credits](#credits)

---

## **Prerequisites**

* [Node.js](https://nodejs.org/) (v18+ recommended)
* [npm](https://www.npmjs.com/) (comes with Node.js)
* Access to an Azure tenant with permission to register and manage Azure AD apps
* [Git](https://git-scm.com/) (optional but recommended)
* (Recommended) [Visual Studio Code](https://code.visualstudio.com/) or another code editor

---

## **Azure AD App Registration**

**You must register an Azure AD app with Graph API permissions:**

1. Go to the [Azure Portal](https://portal.azure.com/)
   Open **Microsoft Entra ID** (Azure AD).

2. **App registrations > New registration**

   * Name: `OffboardEntraApp`
   * Supported account types: Single tenant (default is fine)
   * Redirect URI: Leave blank

3. After registering:

   * Go to **Certificates & secrets > New client secret**

     * Description: "dev"
     * Expiry: Choose (e.g., 6 or 12 months)
     * **Copy the Value** shown—save it!
   * Go to **API permissions > Add a permission > Microsoft Graph > Application permissions**

     * Add these:

       * `User.Read.All`
       * `User.ReadWrite.All`
       * `Directory.ReadWrite.All`
     * Click **Grant admin consent** for the tenant

4. Note the following from the app’s **Overview**:

   * Application (client) ID
   * Directory (tenant) ID
   * Your secret value (not Secret ID!)

---

## **Local Setup**

1. **Clone the repository or create the project**

   If starting from scratch, create a new Next.js app:

   ```bash
   npx create-next-app@latest offboard-entra-app
   cd offboard-entra-app
   ```

   Select:

   * TypeScript: up to you
   * Tailwind CSS: Yes
   * App Router: Yes
   * ESLint: Yes
   * src directory: Yes or No
   * Turbopack: Yes (recommended)

2. **Install dependencies**

   ```bash
   npm install @microsoft/microsoft-graph-client @azure/identity lucide-react
   ```

3. **Set up environment variables**

   Create a `.env.local` file in your project root:

   ```env
   AZURE_CLIENT_ID=your-app-client-id
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_SECRET=your-app-client-secret
   ```

   *(Replace values with your Azure app credentials!)*

---

## **Running the App**

```bash
npm run dev
```

Go to [http://localhost:3000](http://localhost:3000) in your browser.

---

## **Project Structure**

```
/app
  /api
    /list-users/route.js        <-- Fetches users from Entra ID
    /offboard-user/route.js     <-- Offboards one or more users
  /page.js                     <-- Main frontend code
.env.local                     <-- Secrets (never commit)
```

---

## **API and Frontend Code**

### **A. API: `app/api/list-users/route.js`**

Fetches a list of users (id, displayName, mail) from Entra ID.

```js
import { NextResponse } from 'next/server';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';

export async function GET() {
  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );

    const token = await credential.getToken("https://graph.microsoft.com/.default");
    const client = Client.init({
      authProvider: (done) => done(null, token.token),
    });

    const users = await client.api('/users').select('id,displayName,mail').top(100).get();

    return NextResponse.json(users.value);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### **B. API: `app/api/offboard-user/route.js`**

Offboards all selected users by:

* Disabling account
* Revoking sessions
* Setting company name to “Former Employee”
* Returns a summary for each user

```js
import { NextResponse } from 'next/server';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';

export async function POST(request) {
  try {
    const { userIds } = await request.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'At least one user must be selected.' }, { status: 400 });
    }

    // Auth
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    const client = Client.init({
      authProvider: (done) => done(null, token.token),
    });

    // Results per user
    const results = [];

    for (const userId of userIds) {
      const actions = [];
      let displayName = userId;
      try {
        // Get display name for reporting
        const user = await client.api(`/users/${userId}`).select('displayName').get();
        displayName = user.displayName || userId;

        // 1. Disable the user
        await client.api(`/users/${userId}`).update({ accountEnabled: false });
        actions.push("Disabled account");

        // 2. Revoke sign-in sessions
        await client.api(`/users/${userId}/revokeSignInSessions`).post();
        actions.push("Revoked sign-in sessions");

        // 3. Set companyName to "Former Employee"
        await client.api(`/users/${userId}`).update({ companyName: "Former Employee" });
        actions.push('Replaced company name with "Former Employee"');

        results.push({ displayName, actions });
      } catch (err) {
        results.push({
          displayName,
          actions,
          error: err.message || "Unknown error"
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Users offboarded successfully.",
      results
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### **C. Frontend: `app/page.js`**

Multi-dropdown UI, “+” button to add, shows results.

```jsx
"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

export default function Home() {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState([]);

  useEffect(() => {
    fetch("/api/list-users")
      .then((res) => res.json())
      .then((data) => setUsers(data));
  }, []);

  const handleUserChange = (index, value) => {
    const updated = [...selectedUsers];
    updated[index] = value;
    setSelectedUsers(updated);
  };

  const addDropdown = () => {
    setSelectedUsers([...selectedUsers, ""]);
  };

  const removeDropdown = (index) => {
    const updated = selectedUsers.filter((_, i) => i !== index);
    setSelectedUsers(updated);
  };

  const handleOffboard = async () => {
    setLoading(true);
    setMessage("");
    setSteps([]);
    // Remove empty or duplicate user IDs
    const userIds = [...new Set(selectedUsers.filter((id) => !!id))];
    if (userIds.length === 0) {
      setMessage("Please select at least one user.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/offboard-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      const data = await response.json();
      if (data.success) {
        setMessage("Users successfully offboarded!");
        setSteps(data.results || []);
      } else {
        setMessage(data.error || "An error occurred.");
        setSteps([]);
      }
    } catch (err) {
      setMessage("Network error. Please try again.");
      setSteps([]);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="max-w-md w-full p-8 bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-800">
        <h1 className="text-2xl font-bold mb-4 text-center text-white">Offboard Users</h1>
        <div className="flex flex-col gap-4">
          {selectedUsers.map((selectedUser, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select
                className="flex-1 p-2 rounded bg-neutral-800 text-white border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={selectedUser}
                onChange={(e) => handleUserChange(idx, e.target.value)}
              >
                <option value="" disabled>
                  -- Select a user --
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                    {user.mail ? ` (${user.mail})` : ""}
                  </option>
                ))}
              </select>
              {selectedUsers.length > 1 && (
                <button
                  className="px-2 py-1 text-red-400 hover:text-red-600 rounded"
                  onClick={() => removeDropdown(idx)}
                  aria-label="Remove"
                  type="button"
                >
                  ×
                </button>
              )}
              {idx === selectedUsers.length - 1 && (
                <button
                  className="p-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition"
                  onClick={addDropdown}
                  aria-label="Add another user"
                  type="button"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          disabled={selectedUsers.filter(Boolean).length === 0 || loading}
          onClick={handleOffboard}
          className={`w-full py-2 mt-6 rounded font-semibold transition ${
            selectedUsers.filter(Boolean).length > 0 && !loading
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Offboarding..." : "Offboard Selected Users"}
        </button>
        {message && (
          <div className="mt-4 text-center text-lg text-green-400">{message}</div>
        )}
        {steps.length > 0 && (
          <ul className="mt-4 text-left text-sm text-gray-200 list-disc pl-5">
            {steps.map((result, i) => (
              <li key={i}>
                <span className="font-semibold">{result.displayName}:</span>
                <ul className="list-disc pl-4">
                  {result.actions.map((action, j) => (
                    <li key={j}>{action}</li>
                  ))}
                  {result.error && (
                    <li className="text-red-400">Error: {result.error}</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

*If you haven’t installed `lucide-react`, run:*

```bash
npm install lucide-react
```

---

## **Usage**

1. Start the app with `npm run dev`
2. Open [http://localhost:3000](http://localhost:3000)
3. Select a user from the dropdown.

   * Click **"+"** to add another dropdown for additional users.
   * Remove a dropdown with the **"×"** button.
4. Click **"Offboard Selected Users"**
5. You’ll see a summary of all actions for each user.

---

## **Security Notes**

* **Never commit your `.env.local` file to git.**
* Ensure your Azure AD app secret is kept safe and rotated regularly.
* Restrict who can run this app—offboarding is a powerful action!
* Use HTTPS and authentication for any public deployment.

---

## **Production Deployment**

* Deploy to [Vercel](https://vercel.com/), [Azure Static Web Apps](https://azure.microsoft.com/en-us/products/app-service/static/), or any Node.js-friendly hosting.
* Set environment variables securely in your platform’s dashboard.
* Lock down access—use Azure AD authentication or another provider.
* Rotate secrets before going live.

---

## **Credits**

* Built by \[Carl]
* Inspired by real-world IT offboarding needs

---


