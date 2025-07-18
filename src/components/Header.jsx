import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
    const { user, logout } = useAuth();

    return (
        <nav className="navbar navbar-expand-lg navbar-light bg-light">
            <div className="container">
                {/* Branding: Updated to match the Petrol Pump Management System */}
                <Link className="navbar-brand" to="/">
                    Petrol Pump Management
                </Link>
                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarSupportedContent"
                    aria-controls="navbarSupportedContent"
                    aria-expanded="false"
                    aria-label="Toggle navigation"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                    {/* Main Navigation Links */}
                    <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/" end>
                                Home
                            </NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/accounts">
                                Accounts
                            </NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/purchase">
                                Purchase
                            </NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/inventory">
                                Inventory
                            </NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/payroll">
                                Payroll
                            </NavLink>
                        </li>
                        {/* Dropdown for additional modules */}
                        <li className="nav-item dropdown">
                            <a
                                className="nav-link dropdown-toggle"
                                href="#"
                                id="moreDropdown"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                More
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="moreDropdown">
                                <li>
                                    <NavLink className="dropdown-item" to="/sms">
                                        SMS Alerts
                                    </NavLink>
                                </li>
                                <li>
                                    <NavLink className="dropdown-item" to="/reports">
                                        Daily Report
                                    </NavLink>
                                </li>
                                <li>
                                    <NavLink className="dropdown-item" to="/credit-management">
                                        Credit Management
                                    </NavLink>
                                </li>
                                <li>
                                    <hr className="dropdown-divider" />
                                </li>
                                <li>
                                    <NavLink className="dropdown-item" to="/user-roles">
                                        User Roles
                                    </NavLink>
                                </li>
                            </ul>
                        </li>
                    </ul>
                    {/* User authentication section */}
                    <div className="d-flex align-items-center">
                        {user ? (
                            <>
                                {/* Display user name or email */}
                                <span className="navbar-text me-2">
                                    {user.displayName || user.email}
                                </span>
                                <button className="btn btn-outline-danger me-2" onClick={logout}>
                                    Logout
                                </button>
                                <NavLink className="btn btn-outline-primary" to="/dashboard">
                                    Dashboard
                                </NavLink>
                            </>
                        ) : (
                            <NavLink className="btn btn-primary" to="/auth/login">
                                Login
                            </NavLink>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
