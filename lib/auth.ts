import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Scopes: identity + create/edit Slides + manage files this app creates in Drive.
// drive.file is least privilege (only files the app makes), avoids broad Drive access.
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

const ALLOWED_HD = process.env.ALLOWED_HD || 'c-4analytics.com';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: 'offline', // get a refresh token
          prompt: 'consent',      // ensure refresh token is returned
          hd: ALLOWED_HD,         // hint Google to the Workspace domain
        },
      },
    }),
  ],
  callbacks: {
    // Hard block: only allow the configured Workspace domain.
    async signIn({ profile }) {
      const email = (profile as any)?.email as string | undefined;
      const hd = (profile as any)?.hd as string | undefined;
      const okDomain = hd === ALLOWED_HD || (!!email && email.endsWith('@' + ALLOWED_HD));
      return okDomain;
    },
    // Persist the Google access/refresh token so server routes can call the Slides API.
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  pages: {},
  secret: process.env.NEXTAUTH_SECRET,
};
