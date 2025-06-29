import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import Toast from "react-native-toast-message";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';

const queryClient = new QueryClient();

const fetchConnectionToken = async () => {
    try {
        const res = await fetch('https://backend-azirm.onrender.com/connection_token', {
            method: 'GET',
        });

        if (!res.ok) {
            throw new Error('Erreur lors de la récupération du token');
        }

        const { secret } = await res.json();
        return secret;
    } catch (error) {
        console.error("Erreur dans fetchConnectionToken:", error);
        throw error;
    }
};

export default function App() {
    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <SafeAreaProvider>
            <StatusBar style="dark" />
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <StripeTerminalProvider tokenProvider={fetchConnectionToken} logLevel="verbose">
                        <NavigationContainer>
                            <AppNavigator />
                        </NavigationContainer>
                        <Toast />
                    </StripeTerminalProvider>
                </AuthProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}
