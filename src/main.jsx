import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css';
import '@ant-design/v5-patch-for-react-19';
import './index.css'
import "./config/global.js"
import App from './App.jsx'

import { AuthContextProvider } from './context/AuthContext.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx';
import { FirebaseDataProvider } from './context/FirebaseDataContext.jsx';


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthContextProvider>
      <FirebaseDataProvider>
        <SettingsProvider>

          <App />
        </SettingsProvider>
      </FirebaseDataProvider>
    </AuthContextProvider>
  </StrictMode>,
)
