import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id con los parámetros mínimos recomendados por OWASP (19 MiB, t=2,
 * p=1). Los parámetros quedan codificados en cada hash, por lo que subirlos
 * más adelante no invalida los existentes.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  /** Devuelve false ante un hash corrupto en lugar de lanzar. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
