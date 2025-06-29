import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import RouteScreen from '../screens/RouteScreen';
import PermissionScreen from "../screens/AuthorisationScreen";
import QuebecMapScreen from "../screens/RouteScreen";
import DonationWalletApp from "../screens/WalletScreen";
import EditProfileScreen from "../screens/EditProfilScreen";
import PaymentScreen from "../screens/PaymentScreen";
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AuthNavigator = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Auth" component={LoginScreen} />
        </Stack.Navigator>
    );
};
const MainNavigator = () => {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#0059E4',
                tabBarInactiveTintColor: '#8E8E93',
            }}
        >
            <Tab.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                    tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color} />
                }}
            />
            <Tab.Screen
                name="Route"
                component={RouteScreen}
                options={{
                    tabBarIcon: ({ color }) => <MaterialIcons name="map" size={24} color={color} />
                }}
            />
        </Tab.Navigator>
    );
};
const AppNavigator = () => {
    const { isAuthenticated } = useAuth();
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="AuthNavigator" component={AuthNavigator} />
            ) : (
                <>
                    <Stack.Screen name="Dashboard" component={DashboardScreen} />
                    <Stack.Screen name="route" component={QuebecMapScreen} />
                    <Stack.Screen name="wallet" component={DonationWalletApp} />
                    <Stack.Screen name="Main" component={MainNavigator} />
                    <Stack.Screen name="payment" component={PaymentScreen} />
                    <Stack.Screen name="profile" component={EditProfileScreen} options={{ title: "Modifier mon compte" }} />
                    <Stack.Screen name="Login" component={LoginScreen} />
                </>
            )}
        </Stack.Navigator>
    );
};
export default AppNavigator;
