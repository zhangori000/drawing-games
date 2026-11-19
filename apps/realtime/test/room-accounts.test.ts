import type { AccountProfileView } from '@drawing-games/game-core';
import { env, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRoom, fetchWorker, joinRoom, RoomSocket, run } from './room/harness';

const PASSWORD = 'correct horse battery';

async function signup(prefix: string): Promise<{ readonly username: string; readonly token: string }> {
	const username = `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
	const response = await fetchWorker('/accounts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password: PASSWORD }),
	});
	expect(response.status).toBe(201);
	const body = (await response.json()) as { token: string };
	return { username, token: body.token };
}

async function profile(token: string): Promise<AccountProfileView> {
	const response = await fetchWorker('/accounts/me', { headers: { Authorization: `Bearer ${token}` } });
	expect(response.status).toBe(200);
	return (await response.json()) as AccountProfileView;
}

describe('quick accounts in rooms', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('links a verified account on join and ignores an invalid one', async () => {
		const account = await signup('mina');
		const roomCode = await createRoom();
		const member = await joinRoom(roomCode, 'Mina', { accountToken: account.token });
		const guest = await joinRoom(roomCode, 'Theo', { accountToken: `${account.username}.${'x'.repeat(43)}` });
		try {
			expect((await member.view()).me?.accountId).toBe(account.username);
			const guestView = await guest.view();
			expect(guestView.me?.accountId).toBeNull();
			expect(guestView.members.map((entry) => entry.hasAccount)).toEqual([true, false]);
		} finally {
			member.close();
			guest.close();
		}
	});

	it('links, rejects, and unlinks accounts mid-session with account.link', async () => {
		const account = await signup('link');
		const roomCode = await createRoom();
		const client = await joinRoom(roomCode, 'Lin');
		try {
			const bad = client.send({ type: 'account.link', accountToken: `${account.username}.${'y'.repeat(43)}` });
			expect(await client.error(bad)).toMatchObject({ code: 'UNAUTHORIZED', retryable: false });

			await run(client, { type: 'account.link', accountToken: account.token });
			await client.view((view) => view.me?.accountId === account.username, 'linked');
			await run(client, { type: 'account.link', accountToken: null });
			await client.view((view) => view.me?.accountId === null, 'unlinked');
		} finally {
			client.close();
		}
	});

	it('links the account sent with a resume when the seat has none', async () => {
		const account = await signup('back');
		const roomCode = await createRoom();
		const first = await joinRoom(roomCode, 'Bea');
		const resumed = await RoomSocket.open(roomCode);
		try {
			const commandId = resumed.send({ type: 'room.resume', resumeToken: first.resumeToken ?? '', accountToken: account.token });
			await resumed.ack(commandId);
			expect((await resumed.view()).me).toMatchObject({ memberId: first.memberId, accountId: account.username });
		} finally {
			resumed.close();
		}
	});

	it('records the words a member drew once the round ends', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
		const account = await signup('drew');
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Dru', { accountToken: account.token });
		try {
			for (const team of ['A', 'B', 'B'] as const) await run(host, { type: 'lobby.bot.add', team });
			await run(host, { type: 'match.start' });
			const draft = await host.view((view) => view.phase === 'word-draft', 'draft');
			const pick = draft.round?.mine?.options?.[0];
			if (pick === undefined) throw new Error('the host should be drawing first');
			await run(host, { type: 'draft.select', optionId: pick.wordId });
			// Time is frozen: let the bot drawer reach its pick.
			vi.setSystemTime((draft.phaseDeadlineAtMs ?? 0) - 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			const drawing = await host.view((view) => view.phase === 'drawing', 'drawing');

			vi.setSystemTime((drawing.phaseDeadlineAtMs ?? 0) + 1);
			expect(await runDurableObjectAlarm(stub)).toBe(true);
			await host.view((view) => view.phase === 'round-results', 'results');

			let drew: AccountProfileView['recentWords'][number] | undefined;
			for (let attempt = 0; attempt < 50 && drew === undefined; attempt += 1) {
				drew = (await profile(account.token)).recentWords.find((event) => event.role === 'drew');
				if (drew === undefined) await new Promise((resolve) => setTimeout(resolve, 20));
			}
			expect(drew).toMatchObject({ wordId: pick.wordId, roomCode, solved: false });
		} finally {
			host.close();
		}
	});
});
