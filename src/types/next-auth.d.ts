import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubLogin?: string | null;
      githubId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    githubLogin?: string | null;
    githubId?: string | null;
  }
}
