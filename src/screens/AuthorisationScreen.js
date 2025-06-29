import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Switch,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
const PermissionScreen = ({ navigation }) => {
    const [locationEnabled, setLocationEnabled] = useState(true);
    const [isActivating, setIsActivating] = useState(false);
    const [locationStatus, setLocationStatus] = useState('Inactif');
    const [currentLocation, setCurrentLocation] = useState(null);
    useEffect(() => {
        checkExistingPermissions();
    }, []);
    const checkExistingPermissions = async () => {
        try {
            const { status: locationStatus } = await Location.getForegroundPermissionsAsync();
            setLocationEnabled(locationStatus === 'granted');
        } catch (error) {
            console.log('Erreur lors de la vérification des permissions:', error);
        }
    };
    const requestLocationPermission = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                await Location.requestBackgroundPermissionsAsync();
                return true;
            }
            return false;
        } catch (error) {
            console.log('Erreur permission localisation:', error);
            return false;
        }
    };
    const savePermissionsState = async (location) => {
        try {
            await AsyncStorage.setItem('permissions', JSON.stringify({
                location,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.log('Erreur sauvegarde permissions:', error);
        }
    };
    const initializeLocationTracking = async () => {
        try {
            console.log('🗺️ [LOCATION] Initialisation du suivi de localisation...');
            setLocationStatus('Initialisation...');
            const currentPosition = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });
            console.log('🗺️ [LOCATION] Position initiale obtenue:', {
                latitude: currentPosition.coords.latitude,
                longitude: currentPosition.coords.longitude,
                accuracy: currentPosition.coords.accuracy,
                timestamp: new Date(currentPosition.timestamp).toLocaleTimeString()
            });
            setCurrentLocation(currentPosition.coords);
            setLocationStatus('Actif - Position obtenue');
            const locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 5000,
                    distanceInterval: 5,
                },
                (newLocation) => {
                    console.log('🗺️ [LOCATION] Nouvelle position reçue:', {
                        latitude: newLocation.coords.latitude,
                        longitude: newLocation.coords.longitude,
                        accuracy: newLocation.coords.accuracy,
                        speed: newLocation.coords.speed,
                        timestamp: new Date(newLocation.timestamp).toLocaleTimeString()
                    });

                    setCurrentLocation(newLocation.coords);
                    setLocationStatus(`Actif - Dernière MAJ: ${new Date().toLocaleTimeString()}`);
                }
            );
            console.log('🗺️ [LOCATION] ✅ Suivi de localisation en temps réel activé avec succès');
        } catch (error) {
            console.log('🗺️ [LOCATION] ❌ Erreur initialisation localisation:', error);
            setLocationStatus('Erreur');
        }
    };
    const handleLater = () => {
        if (locationEnabled) {
            Alert.alert(
                'Navigation limitée',
                'Sans la permission de localisation, certaines fonctionnalités seront limitées. Souhaitez-vous continuer ?',
                [
                    { text: 'Annuler', style: 'cancel' },
                    {
                        text: 'Continuer',
                        onPress: () => {
                            AsyncStorage.setItem('permissions_deferred', 'true');
                            navigation.navigate('Home');
                        }
                    }
                ]
            );
        } else {
            AsyncStorage.setItem('permissions_deferred', 'true');
            navigation.navigate('Home');
        }
    };
    const handleBack = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        }
    };
    const handleActivate = async () => {
        setIsActivating(true);
        const granted = await requestLocationPermission();
        setLocationEnabled(granted);
        if (granted) {
            await savePermissionsState(true);
            await initializeLocationTracking();
            navigation.navigate('Dashboard');
        } else {
            Alert.alert('Permission refusée', 'La permission de localisation est nécessaire pour accéder au dashboard complet.');
        }
        setIsActivating(false);
    };
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient
                colors={['#8B5CF6', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <Icon name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <View style={styles.card}>
                    <Text style={styles.title}>Autorisation requise</Text>
                    <Text style={styles.description}>
                        Pour accéder au dashboard complet, veuillez activer la fonctionnalité suivante
                    </Text>
                    <View style={styles.permissionItem}>
                        <View style={styles.permissionLeft}>
                            <View style={styles.iconContainer}>
                                <Icon name="location-on" size={24} color="#8B5CF6" />
                            </View>
                            <View style={styles.permissionText}>
                                <Text style={styles.permissionTitle}>Localisation</Text>
                                <Text style={styles.permissionSubtitle}>
                                    Suivi continu de votre position
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={locationEnabled}
                            onValueChange={setLocationEnabled}
                            trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                            thumbColor={locationEnabled ? '#ffffff' : '#f4f3f4'}
                            disabled={isActivating}
                        />
                    </View>
                    {(locationStatus !== 'Inactif') && (
                        <View style={styles.statusContainer}>
                            <Text style={styles.statusTitle}>État des services :</Text>
                            <View style={styles.statusItem}>
                                <View style={[
                                    styles.statusDot,
                                    {
                                        backgroundColor: locationStatus.includes('Actif') ? '#10B981' :
                                            locationStatus.includes('Erreur') ? '#EF4444' : '#F59E0B'
                                    }
                                ]} />
                                <Text style={styles.statusText}>
                                    Localisation: {locationStatus}
                                </Text>
                            </View>
                            {currentLocation && (
                                <View style={styles.locationInfo}>
                                    <Text style={styles.locationText}>
                                        📍 Lat: {currentLocation.latitude.toFixed(6)}
                                    </Text>
                                    <Text style={styles.locationText}>
                                        📍 Lng: {currentLocation.longitude.toFixed(6)}
                                    </Text>
                                    <Text style={styles.locationText}>
                                        🎯 Précision: {currentLocation.accuracy?.toFixed(0)}m
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                    {!locationEnabled && (
                        <View style={styles.warningContainer}>
                            <Icon name="warning" size={20} color="#FFC107" />
                            <Text style={styles.warningText}>
                                La permission de localisation est requise pour accéder au dashboard
                            </Text>
                        </View>
                    )}
                    <TouchableOpacity
                        style={[
                            styles.activateButton,
                            isActivating && styles.activateButtonDisabled,
                            !locationEnabled && styles.activateButtonIncomplete
                        ]}
                        onPress={handleActivate}
                        disabled={isActivating}
                    >
                        <Text style={[
                            styles.activateButtonText,
                            !locationEnabled && styles.activateButtonTextIncomplete
                        ]}>
                            {isActivating ? 'Activation...' :
                                locationEnabled ? 'Accéder au Dashboard' : 'Activer la permission'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.laterButton}
                        onPress={handleLater}
                        disabled={isActivating}
                    >
                        <Text style={styles.laterButtonText}>Plus tard</Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        </View>
    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    gradient: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        padding: 70,
        alignItems: 'center',
        backdropFilter: 'blur(10px)',
        flex: 1,
        maxHeight: 700,
        marginTop: 180,
        width: 800,
        marginLeft: 100,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 15,
    },
    description: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 40,
    },
    permissionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 15,
        padding: 20,
        marginBottom: 15,
        width: '100%',
    },
    permissionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    permissionText: {
        flex: 1,
    },
    permissionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
        marginBottom: 2,
    },
    permissionSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 193, 7, 0.2)',
        borderRadius: 10,
        padding: 15,
        marginBottom: 20,
        width: '100%',
    },
    warningText: {
        fontSize: 14,
        color: '#FFC107',
        marginLeft: 10,
        flex: 1,
        textAlign: 'center',
    },
    activateButton: {
        backgroundColor: 'white',
        borderRadius: 15,
        paddingVertical: 15,
        paddingHorizontal: 40,
        width: '100%',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 35,
    },
    activateButtonDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
    },
    activateButtonIncomplete: {
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },
    activateButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#8B5CF6',
    },
    activateButtonTextIncomplete: {
        color: 'rgba(139, 92, 246, 0.7)',
    },
    laterButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 15,
        paddingVertical: 15,
        paddingHorizontal: 40,
        width: '100%',
        alignItems: 'center',
    },
    laterButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.8)',
    },
    statusContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        width: '100%',
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
        marginBottom: 15,
        textAlign: 'center',
    },
    statusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        position: 'relative',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 10,
    },
    statusText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
        flex: 1,
    },
    locationInfo: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
        padding: 10,
        marginLeft: 18,
        marginBottom: 10,
    },
    locationText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 2,
    },
});
export default PermissionScreen;
