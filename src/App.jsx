import { BrowserRouter } from 'react-router-dom'

import Routes from "./pages/Routes"
import './App.css'

import "./config/firebase"


function App() {

  return (
    <>
      <BrowserRouter>
        <Routes />
      </BrowserRouter>
    </>
  )
}

export default App
