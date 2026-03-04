export const sonaErrorCodes = {
	INVALID_REQUEST: 'invalid_request',
	INVALID_AUDIO: 'invalid_audio',
	BUSY: 'busy',
	NO_MODEL: 'no_model',
	INTERNAL_ERROR: 'internal_error',
} as const

type UserErrorCode = typeof sonaErrorCodes.INVALID_AUDIO | typeof sonaErrorCodes.INVALID_REQUEST

const userErrorCodes: Set<UserErrorCode> = new Set([sonaErrorCodes.INVALID_AUDIO, sonaErrorCodes.INVALID_REQUEST])

export function isUserError(code: string): code is UserErrorCode {
	return userErrorCodes.has(code as UserErrorCode)
}
