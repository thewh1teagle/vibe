import { useContext } from 'react'
import { ErrorModalContext } from '~/providers/error-modal'
import ErrorModal from './error-modal'

export default function ErrorModalWithContext() {
	const context = useContext(ErrorModalContext)
	return <ErrorModal {...context} />
}
