import React, { createContext, useState, useEffect, useContext } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { message } from 'antd';
import { db } from '../config/firebase';

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch settings from Firestore
    const fetchSettings = async () => {
        try {
            const settingsRef = doc(db, 'settings', 'website');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setSettings(docSnap.data());
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            message.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    // Update settings in Firestore and update local state
    const updateSettings = async (newSettings) => {
        setLoading(true);
        try {
            const settingsRef = doc(db, 'settings', 'website');
            const updatedData = { ...settings, ...newSettings, updatedAt: new Date().toISOString() };
            await setDoc(settingsRef, updatedData);
            setSettings(updatedData);
            message.success('Settings updated successfully');
        } catch (error) {
            console.error('Error updating settings:', error);
            message.error('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => useContext(SettingsContext);
