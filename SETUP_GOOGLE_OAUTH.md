# Google OAuth + Slides API setup

You only do this once. It is the part that has to happen inside your own Google
account, because it authorizes the app to create Slides in C-4 Drive. Total time
is about 15 minutes.

Because every user is under `@c-4analytics.com`, set the consent screen to
**Internal**. That skips Google's app verification process entirely, which is
normally the slow part of requesting Slides and Drive access.

---

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com
2. Sign in with your `@c-4analytics.com` account.
3. Top bar project dropdown, then **New Project**. Name it something like
   `TPLA Report`. Create, then select it.

## 2. Enable the APIs

1. Left menu, **APIs & Services**, then **Library**.
2. Search and **Enable** each of these:
   - **Google Slides API**
   - **Google Drive API**

## 3. Configure the OAuth consent screen

1. **APIs & Services**, then **OAuth consent screen**.
2. User type: choose **Internal**. Create.
3. App name: `TPLA Report`. User support email: your email. Developer contact:
   your email. Save and continue.
4. **Scopes**: Add or remove scopes, then add these three (and the openid /
   email / profile basics if shown):
   - `.../auth/presentations`
   - `.../auth/drive.file`
   Save and continue, then back to dashboard.

   (Because it is Internal, you do not need to submit anything for verification.)

## 4. Create the OAuth client ID

1. **APIs & Services**, then **Credentials**.
2. **Create Credentials**, then **OAuth client ID**.
3. Application type: **Web application**. Name: `TPLA Web`.
4. **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - your Vercel URL once deployed, e.g. `https://tpla.vercel.app`
5. **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-VERCEL-URL/api/auth/callback/google`
6. Create. Copy the **Client ID** and **Client secret**.

## 5. Put the values in `.env.local`

Copy `.env.local.example` to `.env.local` and fill in:

```
GOOGLE_CLIENT_ID=...the client id...
GOOGLE_CLIENT_SECRET=...the client secret...
ALLOWED_HD=c-4analytics.com
NEXTAUTH_SECRET=...run: openssl rand -base64 32...
NEXTAUTH_URL=http://localhost:3000
```

## 6. Run it

```
npm install
npm run dev
```

Open http://localhost:3000, build a report, then click **Sign in with Google
to generate slides**. After you authorize, **Generate presentation** creates the
deck in your Drive and opens it in a new tab.

---

## Deploying to Vercel

1. Push the repo to GitHub.
2. In Vercel, **Add New Project**, import the repo.
3. **Environment Variables**: add the same five keys from `.env.local`, but set
   `NEXTAUTH_URL` to your real Vercel URL.
4. Make sure that Vercel URL is in both the **JavaScript origins** and the
   **redirect URIs** in step 4 above.
5. Deploy.

## Troubleshooting

- **redirect_uri_mismatch**: the URL you are on is not in the Authorized redirect
  URIs. Add it exactly, including `/api/auth/callback/google`.
- **access_denied right after choosing your account**: the account is not on the
  `c-4analytics.com` domain, or the consent screen is not Internal.
- **No refresh token / token expired**: sign out and back in. The app requests
  offline access with consent prompt, which returns a fresh token.
- **403 from Slides API**: the Slides or Drive API is not enabled (step 2), or the
  scopes were not added to the consent screen (step 3).
