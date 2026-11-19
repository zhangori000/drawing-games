/** Error name and message only. Room errors never embed tokens or commands. */
export function describeError(error: unknown): { readonly name: string; readonly message: string } {
	if (error instanceof Error) return { name: error.name, message: error.message };
	return { name: typeof error, message: 'non-Error thrown' };
}
