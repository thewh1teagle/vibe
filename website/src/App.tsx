import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '~/components/Layout'
import Home from '~/pages/Home'
import Features from '~/pages/Features'
import Docs from '~/pages/Docs'

export default function App() {
  return (
    <BrowserRouter basename="/vibe">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="features" element={<Features />} />
          <Route path="docs" element={<Docs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
