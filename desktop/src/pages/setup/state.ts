import type { CatalogModel } from '~/lib/model-catalog'

/** What other pages pass to /setup through router state. Without any of it, setup installs the default model. */
export interface SetupState {
	/** Download this address instead of the default model. */
	downloadURL?: string
	/** The address is this catalog model: download it (and its mirrors) with its size and hash, as `<id>.<ext>`. */
	catalogModel?: CatalogModel
	/** `false` for an unverified deep link: the file is downloaded but not made the active model. */
	select?: boolean
	/** Overwrite exactly this file — used to replace a model that failed its integrity check. */
	replacePath?: string
}
