import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { detectLang } from './i18n'
import { Home } from './shell/Home'
import { LangLayout } from './shell/LangLayout'
import { ToolRoute } from './shell/ToolRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/${detectLang()}/`} replace />} />
        <Route path="/:lang" element={<LangLayout />}>
          <Route index element={<Home />} />
          <Route path=":toolId" element={<ToolRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
