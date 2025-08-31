import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme as NavLight, DarkTheme as NavDark } from "@react-navigation/native";

import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext"; // 👈 provider thème
import AppNavigator from "./src/navigation/AppNavigator";

import Toast from "react-native-toast-message";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";

const queryClient = new QueryClient();

const fetchConnectionToken = async () => {
    try {
        const res = await fetch("https://backend-azirm.onrender.com/connection_token", {
            method: "GET",
        });

        if (!res.ok) {
            throw new Error("Erreur lors de la récupération du token");
        }

        const { secret } = await res.json();
        return secret;
    } catch (error) {
        console.error("Erreur dans fetchConnectionToken:", error);
        throw error;
    }
};

// Ce composant s'occupe juste de brancher le thème à la navigation
function AppInner() {
    const { isDark } = useTheme(); // lit l'état du thème

    return (
        <>
            <StatusBar style={isDark ? "light" : "dark"} />
            <NavigationContainer theme={isDark ? NavDark : NavLight}>
                <AppNavigator />
            </NavigationContainer>
            <Toast />
        </>
    );
}

export default function App() {
    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    {/* 👇 Fournit clair/sombre/système à toute l'app */}
                    <ThemeProvider>
                        <AppInner />
                    </ThemeProvider>
                </AuthProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}
