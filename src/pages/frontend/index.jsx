import { Route, Routes } from 'react-router-dom'
import Home from "./Home"
import About from "./About"
import Header from '../../components/Header'

export default function index() {
    return (
        <>
            <Header />
            <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/about' element={<About />} />
                <Route path='*' element={<div className='d-flex justify-content-center'><h1>No page Found</h1></div>} />
            </Routes>

        </>
    )
}
