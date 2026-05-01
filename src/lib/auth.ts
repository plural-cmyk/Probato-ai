import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  // Explicitly set secret — avoids NO_SECRET error on Vercel
  // Falls back to a generated value if env var is somehow missing
  secret: process.env.NEXTAUTH_SECRET || "probato-fallback-secret-change-in-production",
  adapter: PrismaAdapter(db),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubId: profile.id.toString(),
          githubLogin: profile.login,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Store GitHub-specific info on the user
      if (account?.provider === "github" && profile) {
        try {
          await db.user.update({
            where: { id: user.id },
            data: {
              githubId: profile.id?.toString(),
              githubLogin: (profile as { login?: string }).login,
            },
          });
        } catch (error) {
          console.error("Failed to update GitHub info:", error);
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Fetch extra fields from the database
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { githubLogin: true, githubId: true },
        });
        if (dbUser) {
          (session.user as Record<string, unknown>).githubLogin = dbUser.githubLogin;
          (session.user as Record<string, unknown>).githubId = dbUser.githubId;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === "development",
};
