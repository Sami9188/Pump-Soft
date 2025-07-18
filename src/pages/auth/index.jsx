import React from 'react'
import { Route, Routes } from 'react-router-dom'
import Login from './Login'
import SignUp from './SignUp'

export default function index() {
    return (
        <>
            <Routes>
                <Route path='/login' element={<Login />} />
                <Route path='/signup' element={<SignUp />} />
                <Route path='*' element={<div className='d-flex justify-content-center'><h1>No page Found</h1></div>} />
            </Routes>

        </>
    )
}
