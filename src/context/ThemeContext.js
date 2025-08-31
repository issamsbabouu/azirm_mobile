import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext(null);
const lightPalette = {
    name: 'light',
    colors: {
        background: '#f7f8fb',
        textPrimary: '#111827',
        textSecondary: '#7b8a97',
        card: '#ffffff',
        cardAlt: '#fff2ee',
        cardAltBorder: '#ffdccf',
        border: '#e5e7eb',
        accent: '#2ecc71',
        trophy: '#f1c40f',
        progressTrack: '#e5e7eb',
        progressFill: '#111827',
    },
};

const darkPalette = {
    name: 'dark',
    colors: {
        background: '#0f1115',
        textPrimary: '#e5e7eb',
        textSecondary: '#9aa3af',
        card: '#151922',
        cardAlt: '#1d2431',
        cardAltBorder: '#2b3444',
        border: '#262c36',
        accent: '#27ae60',
        trophy: '#f1c40f',
        progressTrack: '#2b3341',
        progressFill: '#e5e7eb',
    },
};

const STORAGE_KEY = 'themePreference'; // 'light' | 'dark' | 'system'

export const ThemeProvider = ({ children }) => {
    const systemScheme = useColorScheme(); // 'light' | 'dark' | null
    const [preference, setPreference] = useState('system'); // utilisateur
    const [ready, setReady] = useState(false);

    // charger depuis AsyncStorage
    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) setPreference(saved);
            } catch {}
            setReady(true);
        })();
    }, []);

    // palette effective
    const isDark = useMemo(() => {
        if (preference === 'system') return systemScheme === 'dark';
        return preference === 'dark';
    }, [preference, systemScheme]);

    const theme = isDark ? darkPalette : lightPalette;

    const setThemePreference = async (value) => {
        setPreference(value); // 'light' | 'dark' | 'system'
        try {
            await AsyncStorage.setItem(STORAGE_KEY, value);
        } catch {}
    };

    // helpers
    const toggleTheme = () => {
        setThemePreference(isDark ? 'light' : 'dark');
    };

    const cycleTheme = () => {
        // system -> light -> dark -> system
        if (preference === 'system') setThemePreference('light');
        else if (preference === 'light') setThemePreference('dark');
        else setThemePreference('system');
    };

    const value = useMemo(
        () => ({
            ready,
            preference,            // 'light' | 'dark' | 'system'
            setThemePreference,
            isDark,
            theme,                 // { name, colors: {...} }
            toggleTheme,           // inverse light/dark
            cycleTheme,            // parcourt system -> light -> dark
        }),
        [ready, preference, isDark, theme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};
