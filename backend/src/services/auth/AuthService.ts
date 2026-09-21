import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/db/prisma";
import { env } from "@/config/env";
import { AuthenticationError, ConflictError } from "@/utils/errors";

const SALT_ROUNDS = 12;

export interface AuthResult {
  user: { id: string; email: string; name: string | null };
  token: string;
}

/**
 * Registration/login/session issuance. Passwords are hashed with bcrypt
 * (never stored or logged in plaintext); sessions are stateless JWTs
 * signed with JWT_SECRET. See middleware/auth.ts for how the token is
 * verified on protected routes.
 */
export class AuthService {
  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    return { user: { id: user.id, email: user.email, name: user.name }, token: this.issueToken(user.id, user.email) };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthenticationError("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AuthenticationError("Invalid email or password");
    }

    return { user: { id: user.id, email: user.email, name: user.name }, token: this.issueToken(user.id, user.email) };
  }

  private issueToken(userId: string, email: string): string {
    return jwt.sign({ sub: userId, email }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
  }
}

export const authService = new AuthService();
