import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import StatistiqueScreen from '../screens/StatistiqueScreen';
import RouteScreen from '../screens/RouteScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WalletScreen from "../screens/WalletScreen";
import EditProfileScreen from "../screens/EditProfilScreen";
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthNavigator = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={LoginScreen} />
    </Stack.Navigator>
);

const MainTabs = () => (
    <Tab.Navigator
        screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0059E4', tabBarInactiveTintColor: '#8E8E93' }}
    >
        <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Statistique"
            component={StatistiqueScreen}
            options={{ tabBarIcon: ({ color }) => <MaterialIcons name="bar-chart" size={24} color={color} /> }}
        />
        <Tab.Screen
            name="wallet"
            component={WalletScreen}
            options={{ tabBarIcon: ({ color }) => <MaterialIcons name="wallet" size={24} color={color} /> }}
        />
        <Tab.Screen
            name="Route"
            component={RouteScreen}
            options={{ tabBarIcon: ({ color }) => <MaterialIcons name="map" size={24} color={color} /> }}
        />
        <Tab.Screen
            name="EditProfil"
            component={EditProfileScreen}
            options={{ tabBarIcon: ({ color }) => <MaterialIcons name="person-outline" size={24} color={color} /> }}
        />
    </Tab.Navigator>
);

const AppNavigator = () => {
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        console.log('[AppNavigator] isAuthenticated =', isAuthenticated);
    }, [isAuthenticated]);

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="AuthNavigator" component={AuthNavigator} />
            ) : (
                <Stack.Screen name="Main" component={MainTabs} />
            )}
        </Stack.Navigator>
    );
};

export default AppNavigator;
