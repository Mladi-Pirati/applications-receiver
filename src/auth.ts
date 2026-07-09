import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

import {
  ensureLocalUserForSignIn,
  getKeycloakProfileSub,
  getSessionMemberByKeycloakUserId,
} from "@/lib/auth/sign-in-gate";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: process.env.KEYCLOAK_ISSUER,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "keycloak") {
        return false;
      }

      return ensureLocalUserForSignIn(profile, account.access_token);
    },
    async jwt({ token, account, profile }) {
      const profileSub = getKeycloakProfileSub(profile);

      if (profileSub) {
        token.keycloakUserId = profileSub;
      }

      if (account?.provider === "keycloak" && !token.keycloakUserId) {
        return null;
      }

      if (typeof token.keycloakUserId === "string") {
        const currentMember = await getSessionMemberByKeycloakUserId(
          token.keycloakUserId,
        );

        if (!currentMember || currentMember.disabledAt !== null) {
          return null;
        }

        const fullName = `${currentMember.firstName} ${currentMember.lastName}`.trim();
        token.sub = currentMember.id;
        token.fullName = fullName;
        token.keycloakUserId = currentMember.keycloakId;
        token.name = fullName;
        token.username = currentMember.username;
      }

      return token;
    },
    async session({ session, token }) {
      if (
        session.user &&
        typeof token.sub === "string" &&
        typeof token.fullName === "string" &&
        typeof token.keycloakUserId === "string" &&
        typeof token.username === "string"
      ) {
        session.user.id = token.sub;
        session.user.fullName = token.fullName;
        session.user.keycloakUserId = token.keycloakUserId;
        session.user.name = token.fullName;
        session.user.username = token.username;
      }

      return session;
    },
  },
});
