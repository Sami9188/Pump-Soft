import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "../config/firebase";
import { signOut, createUserWithEmailAndPassword } from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    query, deleteDoc
} from "firebase/firestore";
import Cookies from "js-cookie";
import CryptoJS from "crypto-js";

const SECRET_KEY = import.meta.env.VITE_SECRET_KEY;

// Helper functions for encryption and decryption
const encryptData = (data) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

const decryptData = (ciphertext) => {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};

// Create Context
const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);


    const checkAdminStatus = async () => {
        try {
            if (user) {
                setIsAdmin(user?.role.includes('admin'));
            }
        } catch (error) {
            console.error("Error checking admin status:", error);
            setIsAdmin(false);
        }
    };
    useEffect(() => {
        checkAdminStatus()
    }, [user])
    const fetchUserDetails = async (uid) => {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    };

    useEffect(() => {
        const cookieUser = Cookies.get("user");
        if (cookieUser) {
            try {
                const decryptedUser = decryptData(cookieUser);
                setUser(decryptedUser);
            } catch (error) {
                console.error("Error decrypting user data:", error);
            }
        }

        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            if (currentUser) {
                const userDetails = await fetchUserDetails(currentUser.uid);
                if (userDetails && !userDetails.deleted) {
                    setUser(userDetails);
                    const encryptedUser = encryptData(userDetails);
                    Cookies.set("user", encryptedUser, {
                        expires: 7,
                        secure: true,
                        sameSite: "strict",
                    });
                } else {
                    await signOut(auth);
                    setUser(null);
                    Cookies.remove("user");
                }
            } else {
                setUser(null);
                Cookies.remove("user");
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const logout = async () => {
        Cookies.remove("user");
        return signOut(auth);
    };

    const updateUser = async (uid, updatedData) => {
        const userDocRef = doc(db, "users", uid);
        await updateDoc(userDocRef, updatedData);
        if (user && user.uid === uid) {
            const updatedUser = { ...user, ...updatedData };
            setUser(updatedUser);
            const encryptedUser = encryptData(updatedUser);
            Cookies.set("user", encryptedUser, {
                expires: 7,
                secure: true,
                sameSite: "strict",
            });
        }
    };

    const getAllUsers = async () => {
        const q = query(collection(db, "users"));
        const querySnapshot = await getDocs(q);
        const usersData = [];
        querySnapshot.forEach((doc) => {
            usersData.push({ uid: doc.id, ...doc.data() });
        });
        console.log('usersData', usersData);
        return usersData;
    };

    const addUser = async (uid, data) => {
        // Ensure role is an array
        if (data.role && !Array.isArray(data.role)) {
            data.role = [data.role];
        } else if (!data.role) {
            data.role = ["user"]; // Default role
        }

        await setDoc(doc(db, "users", uid), { ...data, deleted: false });
    };

    const createNewUser = async (email, password, additionalData = {}) => {
        // Ensure role is an array
        if (additionalData.role && !Array.isArray(additionalData.role)) {
            additionalData.role = [additionalData.role];
        } else if (!additionalData.role) {
            additionalData.role = ["user"]; // Default role
        }

        const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
        const userData = { uid: newUser.uid, email, ...additionalData, deleted: false };
        await addUser(newUser.uid, userData);
        setUser(userData);
        const encryptedUser = encryptData(userData);
        Cookies.set("user", encryptedUser, {
            expires: 7,
            secure: true,
            sameSite: "strict",
        });
        return userData;
    };

    const createUserForAdmin = async (email, password, additionalData = {}) => {
        if (!user || !user.role || !user.role.includes("admin")) {
            throw new Error('Only admins can create new users.');
        }

        // Ensure role is an array
        if (additionalData.role && !Array.isArray(additionalData.role)) {
            additionalData.role = [additionalData.role];
        } else if (!additionalData.role) {
            additionalData.role = ["user"]; // Default role
        }

        try {
            const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
            const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    returnSecureToken: true, // Changed to true to get localId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message);
            }

            const data = await response.json();
            const uid = data.localId;

            if (!uid) {
                throw new Error('Failed to create user: No user ID returned');
            }

            const userData = { uid, email, ...additionalData, deleted: false };
            await addUser(uid, userData);
            return userData;
        } catch (error) {
            console.error("Error creating user:", error);
            throw new Error(`Failed to create user: ${error.message}`);
        }
    };

    const updateUserRole = async (uid, newRoles) => {
        if (!user || !user.role || !user.role.includes("admin")) {
            throw new Error('Only admins can update user roles.');
        }

        // Ensure newRoles is an array
        const roleArray = Array.isArray(newRoles) ? newRoles : [newRoles];

        const userDocRef = doc(db, "users", uid);
        await updateDoc(userDocRef, { role: roleArray });
    };
    const deleteUser = async (uid) => {
        if (!user || !user.role || !user.role.includes("admin")) {
            throw new Error('Only admins can delete users.');
        }
        const userDocRef = doc(db, "users", uid);
        await deleteDoc(userDocRef);
    };


    return (
        <AuthContext.Provider
            value={{
                user,
                logout,
                loading,
                updateUser,
                getAllUsers,
                addUser,
                createNewUser,
                createUserForAdmin,
                updateUserRole,
                deleteUser, isAdmin
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};