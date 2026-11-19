import { DurableObject } from 'cloudflare:workers';

import type { Env } from '../env';

/**
 * One actor per quick account, addressed by `idFromName('user:' + username)`.
 * CONTRACT STUB: the accounts module implements signup/login/session/profile
 * storage and the room-facing record methods.
 */
export class AccountActor extends DurableObject<Env> {}
