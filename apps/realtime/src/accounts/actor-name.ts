import type { Env } from '../env';
import type { AccountActor } from './account-actor';

/** Account actors are addressed by name, so usernames are unique without a global index. */
export const ACCOUNT_ACTOR_PREFIX = 'user:';

export function accountActorName(username: string): string {
	return ACCOUNT_ACTOR_PREFIX + username;
}

export function accountActor(env: Env, username: string): DurableObjectStub<AccountActor> {
	return env.ACCOUNTS.getByName(accountActorName(username));
}
