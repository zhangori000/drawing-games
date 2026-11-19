import type { AccountActor } from './accounts/account-actor';
import type { GameRoom } from './room/game-room';

/** Worker bindings. Keep in sync with wrangler.jsonc. */
export interface Env {
	GAME_ROOM: DurableObjectNamespace<GameRoom>;
	ACCOUNTS: DurableObjectNamespace<AccountActor>;
}
