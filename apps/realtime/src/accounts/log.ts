/** Error name and message only: account code never puts secrets in errors, and callers never log arguments. */
export function describeError(error: unknown): { readonly name: string; readonly message: string } {
	if (error instanceof Error) return { name: error.name, message: error.message };
	return { name: typeof error, message: 'non-Error thrown' };
}
