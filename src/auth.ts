import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validation/auth";

async function getSessionUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      fullName: true,
      username: true,
      forcePasswordChange: true,
      role: true,
    },
  });
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        const parsedCredentials = loginSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const user = await db.query.users.findFirst({
          where: eq(users.username, parsedCredentials.data.username),
        });

        if (!user) {
          return null;
        }

        const passwordMatches = await verifyPassword(
          parsedCredentials.data.password,
          user.passwordHash,
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          fullName: user.fullName,
          name: user.fullName,
          username: user.username,
          forcePasswordChange: user.forcePasswordChange,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.fullName = user.fullName;
        token.name = user.fullName;
        token.username = user.username;
        token.forcePasswordChange = user.forcePasswordChange;
        token.role = user.role;
      }

      if (typeof token.sub === "string") {
        const currentUser = await getSessionUserById(token.sub);

        if (!currentUser) {
          return null;
        }

        token.fullName = currentUser.fullName;
        token.name = currentUser.fullName;
        token.username = currentUser.username;
        token.forcePasswordChange = currentUser.forcePasswordChange;
        token.role = currentUser.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (
        session.user &&
        typeof token.sub === "string" &&
        typeof token.fullName === "string" &&
        typeof token.username === "string" &&
        (token.role === "admin" || token.role === "viewer")
      ) {
        session.user.id = token.sub;
        session.user.fullName = token.fullName;
        session.user.name = token.fullName;
        session.user.username = token.username;
        session.user.forcePasswordChange =
          typeof token.forcePasswordChange === "boolean"
            ? token.forcePasswordChange
            : false;
        session.user.role = token.role;
      }

      return session;
    },
  },
});
