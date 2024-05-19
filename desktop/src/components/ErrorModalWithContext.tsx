import { useContext } from 'react'
import { ErrorModalContext } from '~/providers/ErrorModal'
import ErrorModal from './ErrorModal'

export default function ErrorModalWithContext() {
	const context = useContext(ErrorModalContext)
	return <ErrorModal {...context} />
}
