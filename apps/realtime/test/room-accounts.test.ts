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

	it('credits a finished match once to an account linked on the final screen', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
		const roomCode = await createRoom();
		const stub = env.GAME_ROOM.getByName(roomCode);
		const host = await joinRoom(roomCode, 'Gia');
		try {
			for (const team of ['A', 'B', 'B'] as const) await run(host, { type: 'lobby.bot.add', team });
			await run(host, { type: 'lobby.settings', patch: { rounds: 2, showdown: false } });
			await run(host, { type: 'match.start' });
			// Time is frozen: jump to each deadline until the final screen.
			let view = await host.view((entry) => entry.phase === 'word-draft', 'draft');
			for (let step = 0; step < 12 && view.phase !== 'stats'; step += 1) {
				const phase = view.phase;
				vi.setSystemTime((view.phaseDeadlineAtMs ?? Date.now()) + 1);
				expect(await runDurableObjectAlarm(stub)).toBe(true);
				view = await host.view((entry) => entry.phase !== phase, `after ${phase}`);
			}
			expect(view.phase).toBe('stats');
			const playedWordIds = view.final?.rounds.map((round) => round.teams.A.wordId) ?? [];
			expect(playedWordIds).toHaveLength(2);

			// The guest signs up on the final screen and links the new account.
			const account = await signup('late');
			await run(host, { type: 'account.link', accountToken: account.token });
			await host.view((entry) => entry.me?.accountId === account.username, 'linked');

			let credited = await profile(account.token);
			for (let attempt = 0; attempt < 50 && credited.recentMatches.length === 0; attempt += 1) {
				await new Promise((resolve) => setTimeout(resolve, 20));
				credited = await profile(account.token);
			}
			expect(credited.recentMatches).toEqual([expect.objectContaining({ roomCode, matchNumber: 1, team: 'A', roundsPlayed: 2 })]);
			expect(credited.stats.matchesPlayed).toBe(1);
			const roles = credited.recentWords.map((event) => `${event.role}:${event.wordId}`);
			// Gia drew round 1 and guessed (missed) the bot's word in round 2.
			expect(roles).toEqual(expect.arrayContaining([`drew:${playedWordIds[0]}`, `missed:${playedWordIds[1]}`]));

			// Linking again (or re-sending the link) never counts the match twice.
			await run(host, { type: 'account.link', accountToken: account.token });
			await run(host, { type: 'account.link', accountToken: null });
			await run(host, { type: 'account.link', accountToken: account.token });
			await new Promise((resolve) => setTimeout(resolve, 100));
			const again = await profile(account.token);
			expect(again.recentMatches).toHaveLength(1);
			expect(again.stats.matchesPlayed).toBe(1);
			expect(again.recentWords).toHaveLength(credited.recentWords.length);
		} finally {
			host.close();
		}
	});
});
