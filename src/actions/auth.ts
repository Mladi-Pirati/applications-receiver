"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export type LoginActionState = {
  message?: string;
};

export async function loginAction(
  values: LoginInput,
): Promise<LoginActionState> {
  const parsedCredentials = loginSchema.safeParse(values);

  if (!parsedCredentials.success) {
    return {
      message: "Enter a valid username and password.",
    };
  }

  const payload = new FormData();
  payload.set("username", parsedCredentials.data.username);
  payload.set("password", parsedCredentials.data.password);
  payload.set("redirectTo", "/admin");

  try {
    await signIn("credentials", payload);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message:
          error.type === "CredentialsSignin"
            ? "Invalid username or password."
            : "Unable to sign in right now.",
      };
    }

    throw error;
  }

  return {};
}

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
