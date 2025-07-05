import React, { useEffect, useState, useRef } from 'react';
import {View, Text, Alert, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, Linking, Modal, Animated, Image, ScrollView, TextInput, SafeAreaView, AppState} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from "expo-linear-gradient";
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import { PermissionsAndroid, Platform } from 'react-native';
const { height: screenHeight } = Dimensions.get('window');

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const QuebecMapScreen = ({ navigation }) => {
    const hasCenteredMapRef = useRef(false);
    const lastLocationInsert = useRef(0);
    const locationUpdateTimeout = useRef(null);
    const [isModalVisible, setModalVisible] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [visitData, setVisitData] = useState({
        status: '',
        contactPerson: '',
        email: '',
        donationAmount: '',
        donationType: ''
    });
    const [statusCounts, setStatusCounts] = useState({
        'non visité': 0,
        'visité et accepté': 0,
        'visité et refusé': 0,
        'absent': 0
    });
    const [todaysCommissions, setTodaysCommissions] = useState(0);
    const [missions, setMissions] = useState([]);
    const [filteredStatus, setFilteredStatus] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [recordAddress, setRecordAddress] = useState(null);
    const [loading, setLoading] = useState(true);
    const [watchId, setWatchId] = useState(null);
    const [showFreeDonationModal, setShowFreeDonationModal] = useState(false);
    const [freeDonationData, setFreeDonationData] = useState({
        contactPerson: '',
        email: '',
        donationAmount: '',
        donationType: 'Espèces'
    });
    const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;
    const [isRecording, setIsRecording] = useState(false);
    const [recordPath, setRecordPath] = useState('');
    const [recordStartTime, setRecordStartTime] = useState(null);
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [userProfileImage, setUserProfileImage] = useState('https://via.placeholder.com/150');
    const [walletBalance, setWalletBalance] = useState(0);
    const [totalCollected, setTotalCollected] = useState(0);
    const [donations, setDonations] = useState([]);
    const [profileLoading, setProfileLoading] = useState(false);
    const [showProfileOptions, setShowProfileOptions] = useState(false);
    const popupAnimation = useRef(new Animated.Value(0)).current;
    const mapRef = useRef(null);
    const { user, userName } = useAuth();
    const [collectorId, setCollectorId] = useState(null);
    const requestAudioPermission = async () => {
        if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
    };
    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigation.reset({
            index: 0,
            routes: [{ name: 'AuthNavigator' }],
        });
    };
    const fetchMissions = async () => {
        setLoading(true);
        try {
            const { data: collectorData, error: collectorError } = await supabase
                .from('collectors')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (collectorError || !collectorData) {
                console.error("Erreur collector ID:", collectorError);
                Alert.alert("Erreur", "Profil collecteur introuvable");
                setLoading(false);
                return;
            }

            setCollectorId(collectorData.id);

            const { data, error } = await supabase
                .from('donor_addresses')
                .select(`
                id,
                address,
                code_postal,
                location_lat,
                location_lng,
                status,
                updated_at,
                collector_id
            `)
                .eq('collector_id', collectorData.id);

            if (error) {
                console.error("Erreur adresses:", error);
                Alert.alert("Erreur", "Impossible de charger les adresses");
                return;
            }

            const processed = data.map(addr => {
                const lat = parseFloat(addr.adjusted_lat ?? addr.location_lat);
                const lng = parseFloat(addr.adjusted_lng ?? addr.location_lng);

                if (
                    isNaN(lat) || isNaN(lng) ||
                    lat < -90 || lat > 90 ||
                    lng < -180 || lng > 180
                ) {
                    console.warn(`❌ Coordonnées invalides pour: ${addr.address} → (${lat}, ${lng})`);
                    return null;
                }

                return {
                    ...addr,
                    location_lat: lat,
                    location_lng: lng,
                    address: addr.address,
                    postal_code: addr.code_postal,
                    status: addr.status || 'non visité',
                };
            }).filter(addr => addr !== null);

            // 🔁 Supprimer les missions en absent_3 depuis plus de 2 jours
            const now = new Date();
            const validMissions = [];

            for (let addr of processed) {
                if (addr.status === 'absent_3') {
                    const updatedAt = new Date(addr.updated_at);
                    const diffDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
                    if (diffDays >= 2) {
                        await supabase
                            .from('donor_addresses')
                            .delete()
                            .eq('id', addr.id);
                        continue;
                    }
                }
                validMissions.push(addr);
            }

            setMissions(validMissions);

            const counts = {
                'non visité': 0,
                'visité et accepté': 0,
                'visité et refusé': 0,
                'absent_1': 0,
                'absent_2': 0,
                'absent_3': 0
            };

            validMissions.forEach(addr => {
                const status = addr.status || 'non visité';
                counts[status] = (counts[status] || 0) + 1;
            });

            setStatusCounts(counts);

        } catch (err) {
            console.error('Erreur fetchMissions:', err);
            Alert.alert("Erreur", "Problème de chargement");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.id) {
            hasCenteredMapRef.current = false;
            fetchMissions();
            fetchUserProfile();
            requestLocationPermission();
        }
        return () => stopLocationTracking();
    }, [user]);

    // Center map on markers when they load
    useEffect(() => {
        if (!hasCenteredMapRef.current && missions.length > 0 && mapRef.current) {
            const validMissions = missions.filter(m =>
                !isNaN(m.location_lat) && !isNaN(m.location_lng)
            );

            if (validMissions.length === 0) return;

            const latitudes = validMissions.map(m => m.location_lat);
            const longitudes = validMissions.map(m => m.location_lng);

            const minLat = Math.min(...latitudes);
            const maxLat = Math.max(...latitudes);
            const minLng = Math.min(...longitudes);
            const maxLng = Math.max(...longitudes);

            const midLat = (minLat + maxLat) / 2;
            const midLng = (minLng + maxLng) / 2;

            const latitudeDelta = Math.max((maxLat - minLat) * 1.5, 0.02);
            const longitudeDelta = Math.max((maxLng - minLng) * 1.5, 0.02);

            mapRef.current.animateToRegion({
                latitude: midLat,
                longitude: midLng,
                latitudeDelta,
                longitudeDelta
            }, 1000);

            hasCenteredMapRef.current = true;
        }
    }, [missions]);

    // Other functions remain the same as in your original code
    const fetchUserProfile = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('profile_image')
            .eq('id', user.id)
            .single();
        if (data && !error) setUserProfileImage(data.profile_image);
    };

    const fetchProfileData = async () => {
        if (!user?.id) return;

        setProfileLoading(true);

        try {
            const userRes = await supabase
                .from('users')
                .select('profile_image')
                .eq('id', user.id)
                .single();

            if (userRes.data && !userRes.error) {
                setUserProfileImage(userRes.data.profile_image || 'https://via.placeholder.com/150');
            }

            const collectorRes = await supabase
                .from('collectors')
                .select('id, wallet_balance, total_collected')
                .eq('user_id', user.id)
                .single();

            if (!collectorRes.data || collectorRes.error) return;

            const collectorId = collectorRes.data.id;
            setWalletBalance(collectorRes.data.wallet_balance || 0);
            setTotalCollected(collectorRes.data.total_collected || 0);

            const donationsRes = await supabase
                .from('donations')
                .select('*')
                .eq('collector_id', collectorId)
                .order('created_at', { ascending: false });

            if (donationsRes.data && !donationsRes.error) {
                const donations = donationsRes.data || [];
                setDonations(donations);
            }

        } catch (err) {
            console.error('Erreur lors du chargement des données profil:', err);
        } finally {
            setProfileLoading(false);
        }
    };
    const insertCollectorLocation = async (coords) => {
        if (!collectorId) return;
        const now = Date.now();
        // Only insert every 30 seconds instead of 5 seconds
        if (now - lastLocationInsert.current < 30000) {
            return;
        }
        try {
            const { error } = await supabase.from('collector_locations').insert([{
                collector_id: collectorId,
                latitude: coords.latitude,
                longitude: coords.longitude,
                status: 'actif',
                timestamp: new Date().toISOString()
            }]);

            if (!error) {
                lastLocationInsert.current = now;
            }
        } catch (err) {
            console.error('Location insert error:', err);
            // Don't throw - just log and continue
        }
    };
    const startRecording = async () => {
        if (isRecording || recordPath) {
            console.log("🔁 Enregistrement déjà actif.");
            return;
        }

        const granted = await requestAudioPermission();
        if (!granted) {
            Alert.alert("Micro refusé", "Veuillez activer le micro dans les réglages.");
            return;
        }

        const path = `${RNFS.DocumentDirectoryPath}/recording_${Date.now()}.mp4`;

        try {
            setRecordPath(path); // définir AVANT pour éviter double appel
            await audioRecorderPlayer.startRecorder(path);
            setRecordStartTime(Date.now());
            setIsRecording(true);
            console.log("🎙️ Démarré:", path);
        } catch (error) {
            setRecordPath('');
            setIsRecording(false);
        }
    };
    const stopRecordingAndSave = async () => {
        if (!recordPath || !isRecording || !recordStartTime) {
            console.log("⛔ Aucun enregistrement valide à sauvegarder.");
            return;
        }

        try {
            await audioRecorderPlayer.stopRecorder();
            audioRecorderPlayer.removeRecordBackListener();
            setIsRecording(false);

            const durationSec = Math.max(1, Math.round((Date.now() - recordStartTime) / 1000));

            const { error } = await supabase.from('donation_recordings').insert([
                {
                    collector_id: user?.id,
                    audio_url: recordPath,
                    duration: durationSec,
                    created_at: new Date().toISOString(),
                },
            ]);

            if (error) {
                console.error("❌ Erreur insertion Supabase:", error);
            } else {
                console.log(`✅ Enregistrement sauvegardé localement (${durationSec}s)`);
            }
        } catch (err) {
            console.error("❌ stopRecordingAndSave:", err);
        } finally {
            setRecordPath('');
            setRecordStartTime(null);
        }
    };
    const requestLocationPermission = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission refusée', 'La localisation est requise.');
            return;
        }
        startLocationTracking();
    };

    const fetchTodaysCommissions = async () => {
        if (!collectorId) return;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: donations, error } = await supabase
            .from('donations')
            .select('amount')
            .eq('collector_id', collectorId)
            .eq('status', 'completed')
            .gte('created_at', startOfDay.toISOString());

        if (error || !donations) return;

        const totalCollectedToday = donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
        const commission = totalCollectedToday * 0.35;

        await supabase
            .from('collectors')
            .update({ commission })
            .eq('id', collectorId);

        setTodaysCommissions(commission);
    };

    const startLocationTracking = async () => {
        try {
            // Check if already tracking
            if (watchId) {
                return;
            }

            const sub = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced, // Changed from High to Balanced
                    timeInterval: 10000, // Increased from 5000 to 10000
                    distanceInterval: 10  // Increased from 5 to 10
                },
                handleLocationUpdate,
            );
            setWatchId(sub);
        } catch (error) {
            console.error('Location tracking error:', error);
        }
    };
    const handleLocationUpdate = (coords) => {
        setUserLocation(coords);

        if (locationUpdateTimeout.current) {
            clearTimeout(locationUpdateTimeout.current);
        }

        locationUpdateTimeout.current = setTimeout(() => {
            insertCollectorLocation(coords);
        }, 1000);
    };

    const stopLocationTracking = () => {
        if (watchId) {
            watchId.remove();
            setWatchId(null);
        }
        if (locationUpdateTimeout.current) {
            clearTimeout(locationUpdateTimeout.current);
            locationUpdateTimeout.current = null;
        }
    };
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            if (user?.id && mounted) {
                await fetchMissions();
                await requestLocationPermission();
                await startRecording(); // ▶️
            }
        };

        init();

        return () => {
            mounted = false;
            stopLocationTracking();
            stopRecordingAndSave(); // ⏹️
        };
    }, []);
    useEffect(() => {
        const handleAppStateChange = (state) => {
            if (state === 'background' || state === 'inactive') {
                stopRecordingAndSave();
            } else if (state === 'active' && user?.id) {
                if (!isRecording) startRecording();
            }
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => sub.remove();
    }, [user?.id, isRecording]);

    useEffect(() => {
        const handleAppStateChange = (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                stopLocationTracking();
            } else if (nextAppState === 'active' && user?.id) {
                startLocationTracking();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription?.remove();
        };
    }, [user?.id]);

    const showPopup = mission => {
        setSelectedAddress(mission);
        Animated.spring(popupAnimation, { toValue: 1, useNativeDriver: true }).start();
    };

    const hidePopup = () => {
        Animated.spring(popupAnimation, { toValue: 0, useNativeDriver: true }).start(() => {
            setSelectedAddress(null);
        });
    };

    const openRecordModal = () => {
        if (!selectedAddress) return;

        if (!selectedAddress?.location_lat || !selectedAddress?.location_lng ||
            isNaN(selectedAddress.location_lat) || isNaN(selectedAddress.location_lng)) {
            Alert.alert("Erreur", "Coordonnées de l'adresse invalides");
            return;
        }

        setRecordAddress(selectedAddress);
        hidePopup();
        setShowRecordModal(true);
        setCurrentPage(1);

        if (userLocation && userLocation.latitude && userLocation.longitude) {
            const distance = getDistanceFromLatLonInMeters(
                userLocation.latitude,
                userLocation.longitude,
                selectedAddress.location_lat,
                selectedAddress.location_lng
            );
            console.log('Distance exacte:', distance, 'mètres');
        }
// toujours autorisé

    };
    const closeModal = () => {
        setShowRecordModal(false);
        setCurrentPage(1);
        setVisitData({ status:'', contactPerson:'', email:'', donationAmount:'', donationType:'' });
        setRecordAddress(null);
    };

    const openProfileModal = () => {
        setModalVisible(true);
        fetchProfileData();
    };

    const closeProfileModal = () => {
        setModalVisible(false);
    };

    const renderPageContent = () => {
        switch (currentPage) {
            case 1:
                return (
                    <View>
                        <Text>Statut de la visite</Text>
                        {['visité et accepté','visité et refusé'].map(s => (
                            <TouchableOpacity
                                key={s}
                                onPress={() => setVisitData({ ...visitData, status: s })}
                                style={[styles.optionButton, visitData.status === s && styles.optionButtonActive]}>
                                <Text style={visitData.status === s ? styles.optionTextActive : styles.optionText}>
                                    {s}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            onPress={() => {
                                const current = recordAddress?.status || 'non visité';
                                let nextAbsent = null;

                                switch (current) {
                                    case 'absent_1':
                                        nextAbsent = 'absent_2';
                                        break;
                                    case 'absent_2':
                                        nextAbsent = 'absent_3';
                                        break;
                                    case 'absent_3':
                                        nextAbsent = 'absent_4';
                                        break;
                                    default:
                                        nextAbsent = 'absent_1';
                                }

                                setVisitData({ ...visitData, status: nextAbsent });
                            }}
                            style={[
                                styles.optionButton,
                                visitData.status?.startsWith('absent') && styles.optionButtonActive
                            ]}
                        >
                            <Text style={visitData.status?.startsWith('absent') ? styles.optionTextActive : styles.optionText}>
                                {visitData.status?.startsWith('absent') ? visitData.status.replace('_', ' ').toUpperCase() : 'Absent'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );
            case 2:
                return (
                    <View>
                        <Text>Nom de la personne</Text>
                        <TextInput
                            placeholder="Nom complet"
                            value={visitData.contactPerson}
                            onChangeText={text => setVisitData({ ...visitData, contactPerson: text })}
                            style={styles.textInput}
                        />
                        <Text>Email</Text>
                        <TextInput
                            placeholder="exemple@email.com"
                            value={visitData.email}
                            onChangeText={text => setVisitData({ ...visitData, email: text })}
                            keyboardType="email-address"
                            style={styles.textInput}
                        />
                    </View>
                );
            case 3:
                return (
                    <View>
                        <Text>Montant du don</Text>
                        <TextInput
                            placeholder="Ex: 50"
                            keyboardType="numeric"
                            value={visitData.donationAmount}
                            onChangeText={text => setVisitData({ ...visitData, donationAmount: text })}
                            style={styles.textInput}
                        />
                        <Text>Type de don</Text>
                        {['Espèces','Carte bancaire'].map(type => (
                            <TouchableOpacity
                                key={type}
                                onPress={() => setVisitData({ ...visitData, donationType: type })}
                                style={[styles.optionButton, visitData.donationType === type && styles.optionButtonActive]}>
                                <Text style={visitData.donationType === type ? styles.optionTextActive : styles.optionText}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );
            case 4:
                return (
                    <View>
                        <Text style={styles.summaryTitle}>Résumé</Text>
                        <Text>Statut: {visitData.status}</Text>
                        <Text>Contact: {visitData.contactPerson}</Text>
                        <Text>Email: {visitData.email}</Text>
                        <Text>Montant: {visitData.donationAmount} ({visitData.donationType})</Text>
                    </View>
                );
            default:
                return null;
        }
    };

    const submitFreeDonation = async () => {
        const amount = parseFloat(freeDonationData.donationAmount);
        if (!freeDonationData.contactPerson || !freeDonationData.email || isNaN(amount) || amount <= 0) {
            Alert.alert('Erreur', 'Tous les champs sont obligatoires avec un montant valide.');
            return;
        }
        const { data: collector, error: collectorError } = await supabase
            .from('collectors')
            .select('id, total_collected')
            .eq('user_id', user.id)
            .single();

        if (collectorError || !collector) {
            Alert.alert('Erreur', 'Impossible de récupérer le collecteur.');
            return;
        }

        const { error: donationError } = await supabase
            .from('donations')
            .insert([{
                address_id: null,
                donor_name: freeDonationData.contactPerson.trim(),
                donor_email: freeDonationData.email.trim(),
                amount,
                payment_method: freeDonationData.donationType,
                status: 'completed',
                collector_id: collector.id,
                created_at: new Date().toISOString()
            }]);

        if (donationError) {
            Alert.alert('Erreur', 'Donation non enregistrée.');
        } else {
            const newTotal = (collector.total_collected || 0) + amount;
            await supabase
                .from('collectors')
                .update({ total_collected: newTotal })
                .eq('id', collector.id);

            setShowFreeDonationModal(false);
            fetchMissions();
            await fetchTodaysCommissions();
            Alert.alert('Succès', 'Donation enregistrée !');
        }
    };

    const nextPage = () => {
        if (currentPage === 1 && !visitData.status) {
            Alert.alert('Attention','Veuillez sélectionner un statut avant de continuer.');
            return;
        }
        if (visitData.status !== 'visité et accepté') {
            setCurrentPage(4);
        } else if (currentPage < 4) {
            setCurrentPage(currentPage + 1);
        }
    };

    const prevPage = () => {
        if (visitData.status !== 'visité et accepté') {
            setCurrentPage(1);
        } else if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };
    const submitVisitRecord = async () => {
        try {
            if (!recordAddress?.id) {
                Alert.alert('Erreur', 'Adresse introuvable.');
                return;
            }

            const statusMapping = {
                'absent_1': 'absent_1',
                'absent_2': 'absent_2',
                'absent_3': 'absent_3',
                'absent_4': 'absent_4',
                'visité et accepté': 'visité et accepté',
                'visité et refusé': 'visité et refusé'
            };
            const mappedStatus = statusMapping[visitData.status] || visitData.status;


            const { error: addrError } = await supabase
                .from('donor_addresses')
                .update({
                    status: mappedStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', recordAddress.id);

            if (addrError) {
                Alert.alert('Erreur', `Impossible de mettre à jour le statut : ${addrError.message}`);
                return;
            }

            // Enregistrer donation si accepté
            if (mappedStatus === 'visité et accepté') {
                const amount = parseFloat(visitData.donationAmount);
                if (!visitData.contactPerson || !visitData.email || isNaN(amount) || amount <= 0) {
                    Alert.alert('Erreur', 'Nom, email et montant valides obligatoires.');
                    return;
                }

                const { data: collector, error: collectorError } = await supabase
                    .from('collectors')
                    .select('id, wallet_balance, total_collected')
                    .eq('user_id', user.id)
                    .single();

                if (collectorError || !collector) {
                    Alert.alert('Erreur', 'Impossible de récupérer les infos collecteur.');
                    return;
                }

                const { error: donationError } = await supabase
                    .from('donations')
                    .insert([{
                        address_id: recordAddress.id,
                        donor_name: visitData.contactPerson.trim(),
                        donor_email: visitData.email.trim(),
                        amount,
                        payment_method: visitData.donationType,
                        status: 'completed',
                        collector_id: collector.id,
                        created_at: new Date().toISOString()
                    }]);

                if (donationError) {
                    Alert.alert('Attention', 'Donation non enregistrée malgré la mise à jour du statut.');
                } else {
                    const newTotal = (collector.total_collected || 0) + amount;
                    await supabase
                        .from('collectors')
                        .update({ total_collected: newTotal })
                        .eq('id', collector.id);
                }
            }

            await fetchMissions();
            closeModal();
            Alert.alert('Succès', 'Visite enregistrée !');

        } catch (err) {
            Alert.alert('Erreur', err.message || 'Une erreur est survenue.');
        }
        await fetchTodaysCommissions();
    };

    useEffect(() => {
        if (missions.length > 0 && mapRef.current) {
            const latitudes = missions.map(m => m.location_lat);
            const longitudes = missions.map(m => m.location_lng);

            const minLat = Math.min(...latitudes);
            const maxLat = Math.max(...latitudes);
            const minLng = Math.min(...longitudes);
            const maxLng = Math.max(...longitudes);

            const midLat = (minLat + maxLat) / 2;
            const midLng = (minLng + maxLng) / 2;

            mapRef.current.animateToRegion({
                latitude: midLat,
                longitude: midLng,
                latitudeDelta: (maxLat - minLat) * 1.5,
                longitudeDelta: (maxLng - minLng) * 1.5,
            }, 1000);
        }
    }, [missions]);
    const renderNavItem = (iconName, label, isActive, onPress) => {
        return (
            <TouchableOpacity style={styles.navItem} onPress={onPress}>
                <MaterialIcons name={iconName} size={24} color={isActive ? '#8B5CF6' : '#9CA3AF'} />
                <Text style={[styles.navText, isActive && styles.activeNavText]}>{label}</Text>
            </TouchableOpacity>
        );
    };

    const getStatusColor = status => {
        switch(status){
            case 'visité et accepté': return '#7ED321';
            case 'visité et refusé':  return '#D0021B';
            case 'absent_1': return '#CCCCCC';
            case 'absent_2': return '#FFD700';
            case 'absent_3': return '#FFA500';
            case 'absent_4': return '#AAAAAA';
            default:                  return 'blue';
        }
    };

    if (loading) return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#0000ff"/>
            <Text>Chargement...</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                showsUserLocation
                showsMyLocationButton
            >
                {missions.filter(m =>
                    !isNaN(m.location_lat) && !isNaN(m.location_lng)
                ).map(m => (
                    <Marker
                        key={m.id}
                        coordinate={{
                            latitude: m.location_lat,
                            longitude: m.location_lng
                        }}
                        onPress={() => showPopup(m)}
                    >
                        <View style={[styles.markerCircle, { backgroundColor: getStatusColor(m.status) }]}>
                            <FontAwesome name="home" size={20} color="white"/>
                        </View>
                    </Marker>
                ))}
            </MapView>
            <View style={styles.dailyCommissionContainer}>
                <Text style={styles.dailyCommissionText}>${todaysCommissions.toFixed(2)}</Text>
            </View>

            <View style={styles.statusFilterContainer}>
                {['non visité','visité et accepté','visité et refusé','absent'].map(status => {
                    const isActive = filteredStatus === status;
                    const color = getStatusColor(status);
                    return (
                        <TouchableOpacity
                            key={status}
                            style={[
                                styles.statusIconButton,
                                { backgroundColor: isActive ? color : '#EEE' }
                            ]}
                            onPress={() => setFilteredStatus(fs => fs === status ? null : status)}
                        >
                            <FontAwesome
                                name="home"
                                size={24}
                                color={isActive ? 'white' : color}
                            />
                        </TouchableOpacity>
                    );
                })}
            </View>
            {selectedAddress && (
                <>
                    <TouchableOpacity style={styles.overlay} onPress={hidePopup} activeOpacity={1}/>
                    <Animated.View style={[
                        styles.popup,
                        {
                            transform: [{
                                translateY: popupAnimation.interpolate({ inputRange:[0,1], outputRange:[300,0] })
                            }],
                            opacity: popupAnimation
                        }
                    ]}>
                        <Text style={styles.modalTitle}>Détails de l'adresse</Text>
                        <Text>Adresse: {selectedAddress.address}</Text>
                        <Text>Statut: {selectedAddress.status}</Text>
                        <Text>Coordonnées: {selectedAddress.location_lat?.toFixed(6)}, {selectedAddress.location_lng?.toFixed(6)}</Text>
                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor:'#5B6CFF'}]}
                                onPress={() =>
                                    Linking.openURL(
                                        `https://www.google.com/maps/dir/?api=1&destination=${selectedAddress.location_lat},${selectedAddress.location_lng}`
                                    )
                                }
                            >
                                <MaterialIcons name="navigation" size={20} color="white"/>
                                <Text style={styles.actionButtonText}>Itinéraire</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#A569C1' }]}
                                onPress={openRecordModal}
                            >
                                <MaterialIcons name="edit" size={20} color="white"/>
                                <Text style={styles.actionButtonText}>Enregistrer visite</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.closeButton} onPress={hidePopup}>
                            <MaterialIcons name="close" size={24} color="white"/>
                        </TouchableOpacity>
                    </Animated.View>
                </>
            )}


            <Modal animationType="slide" transparent visible={showRecordModal} onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Enregistrement visite ({currentPage}/4)</Text>
                            <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBar}>
                                <View style={[styles.progressFill, { width: `${(currentPage/4)*100}%` }]} />
                            </View>
                        </View>
                        <ScrollView style={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                            {renderPageContent()}
                        </ScrollView>
                        <View style={styles.navigationButtons}>
                            {currentPage>1 && (
                                <TouchableOpacity style={[styles.navButton,styles.prevButton]} onPress={prevPage}>
                                    <MaterialIcons name="arrow-back" size={20} color="#666"/>
                                    <Text style={styles.prevButtonText}>Précédent</Text>
                                </TouchableOpacity>
                            )}
                            <View style={styles.flexSpacer}/>
                            {currentPage<4 ? (
                                <TouchableOpacity style={[styles.navButton,styles.nextButton]} onPress={nextPage}>
                                    <Text style={styles.nextButtonText}>Suivant</Text>
                                    <MaterialIcons name="arrow-forward" size={20} color="white"/>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={[styles.navButton,styles.submitButton]} onPress={submitVisitRecord}>
                                    <MaterialIcons name="save" size={20} color="white"/>
                                    <Text style={styles.submitButtonText}>Enregistrer</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal animationType="slide" transparent visible={isModalVisible} onRequestClose={closeProfileModal}>
                <View style={styles.profileModalOverlay}>
                    <View style={styles.profileModalContent}>
                        <LinearGradient colors={['#7078DC', '#8F71C1']} style={styles.profileHeader}>
                            <View style={styles.profileHeaderContent}>
                                <TouchableOpacity onPress={closeProfileModal} style={styles.profileCloseButton}>
                                    <MaterialIcons name="close" size={24} color="white" />
                                </TouchableOpacity>
                                <Image source={{ uri: userProfileImage }} style={styles.profileAvatar} />
                                <View style={styles.profileUserInfo}>
                                    <Text style={styles.profileWelcomeText}>Bienvenue</Text>
                                    <Text style={styles.profileUserName}>{userName || 'Utilisateur'}</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <ScrollView style={styles.profileContent} showsVerticalScrollIndicator={false}>
                            {profileLoading ? (
                                <View style={styles.profileLoadingContainer}>
                                    <ActivityIndicator size="large" color="#8B5CF6" />
                                </View>
                            ) : (
                                <>
                                    <View style={styles.profileCardRow}>
                                        <View style={[styles.profileBalanceCard, styles.profileHalfCard]}>
                                            <Text style={styles.profileCardTitle}>Total collecté</Text>
                                            <Text style={styles.profileBalanceAmount}>${totalCollected.toFixed(2)}</Text>
                                        </View>
                                        <View style={[styles.profileBalanceCard, styles.profileHalfCard]}>
                                            <View style={styles.profileBalanceHeader}>
                                                <Text style={styles.profileCardTitle}>Commissions</Text>
                                                <TouchableOpacity onPress={fetchProfileData}>
                                                    <MaterialIcons name="refresh" size={24} color="#7078DC" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={styles.profileBalanceAmount}>${walletBalance.toFixed(2)}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.profileSection}>
                                        <Text style={styles.profileSectionTitle}>Mes Donations</Text>
                                        <View style={styles.profileButtonGroup}>
                                            <TouchableOpacity
                                                style={[styles.profileActionButton, { backgroundColor: '#5B6CFF' }]}
                                                onPress={() => {
                                                    closeProfileModal();
                                                    navigation.navigate('profile');
                                                }}
                                            >
                                                <MaterialIcons name="edit" size={20} color="white" />
                                                <Text style={styles.profileActionText}>Modifier mon profil</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.profileActionButton, { backgroundColor: '#D0021B' }]}
                                                onPress={async () => {
                                                    closeProfileModal();
                                                    navigation.navigate('Login');
                                                }}
                                            >
                                                <MaterialIcons name="logout" size={20} color="white" />
                                                <Text style={styles.profileActionText}>Se déconnecter</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {donations.length === 0 ? (
                                            <Text style={styles.profileNoDonationText}>Aucune donation encore.</Text>
                                        ) : (
                                            donations.map(donation => (
                                                <View key={donation.id} style={styles.profileDonationItem}>
                                                    <Text style={styles.profileDonationAmount}>+ ${donation.amount.toFixed(2)}</Text>
                                                    <Text style={styles.profileDonationDate}>{new Date(donation.created_at).toLocaleDateString()}</Text>
                                                </View>
                                            ))
                                        )}
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <View style={styles.bottomNav}>
                {renderNavItem('home', 'Accueil', false, () => navigation.navigate('Dashboard'))}
                {renderNavItem('account-balance-wallet', 'Wallet', false, () => navigation.navigate('wallet'))}
                {renderNavItem('place', 'Missions', true, () => navigation.navigate('route'))}
                {renderNavItem('bar-chart', 'Stats', false, () => navigation.navigate('stats'))}
                {renderNavItem('menu-book', 'Formation', false, () => navigation.navigate('training'))}
                <TouchableOpacity
                    style={styles.profileNavItem}
                    onPress={() => setShowProfileOptions(true)}
                >
                    <Image source={{ uri: userProfileImage }} style={styles.navAvatar} />
                    <Text style={styles.navText}>Profil</Text>
                </TouchableOpacity>

            </View>

            <TouchableOpacity
                style={styles.floatingButton}
                onPress={() => {
                    setFreeDonationData({
                        contactPerson: '',
                        email: '',
                        donationAmount: '',
                        donationType: 'Espèces'
                    });
                    setShowFreeDonationModal(true);
                }}
            >
                <MaterialIcons name="volunteer-activism" size={28} color="white" />
            </TouchableOpacity>

            <Modal
                visible={showFreeDonationModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowFreeDonationModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Donation libre</Text>

                        <Text>Nom</Text>
                        <TextInput
                            value={freeDonationData.contactPerson}
                            onChangeText={text => setFreeDonationData({ ...freeDonationData, contactPerson: text })}
                            style={styles.textInput}
                            placeholder="Nom complet"
                        />

                        <Text>Email</Text>
                        <TextInput
                            value={freeDonationData.email}
                            onChangeText={text => setFreeDonationData({ ...freeDonationData, email: text })}
                            style={styles.textInput}
                            placeholder="exemple@email.com"
                            keyboardType="email-address"
                        />

                        <Text>Montant</Text>
                        <TextInput
                            value={freeDonationData.donationAmount}
                            onChangeText={text => setFreeDonationData({ ...freeDonationData, donationAmount: text })}
                            style={styles.textInput}
                            placeholder="50"
                            keyboardType="numeric"
                        />

                        <Text>Type</Text>
                        {['Espèces', 'Carte bancaire'].map(type => (
                            <TouchableOpacity
                                key={type}
                                onPress={() => setFreeDonationData({ ...freeDonationData, donationType: type })}
                                style={[styles.optionButton, freeDonationData.donationType === type && styles.optionButtonActive]}
                            >
                                <Text style={freeDonationData.donationType === type ? styles.optionTextActive : styles.optionText}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
                            <TouchableOpacity onPress={() => setShowFreeDonationModal(false)} style={styles.prevButton}>
                                <Text style={styles.prevButtonText}>Annuler</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={submitFreeDonation} style={styles.submitButton}>
                                <Text style={styles.submitButtonText}>Valider</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal
                transparent
                visible={showProfileOptions}
                animationType="fade"
                onRequestClose={() => setShowProfileOptions(false)}
            >
                <TouchableOpacity style={styles.modalOverlayy} onPress={() => setShowProfileOptions(false)}>
                    <View style={styles.modalBox}>
                        <TouchableOpacity
                            style={styles.modalOption}
                            onPress={() => {
                                setShowProfileOptions(false);
                                navigation.navigate('profile');
                            }}
                        >
                            <Text style={styles.modalText}>✏️ Modifier mon compte</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalOption}
                            onPress={() => {
                                setShowProfileOptions(false);
                                handleLogout();
                            }}
                        >
                            <Text style={[styles.modalText, { color: '#FF5E5E' }]}>🔓 Se déconnecter</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

        </View>
    );
};

const styles = StyleSheet.create({
    modalOverlayy: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBox: {
        backgroundColor: '#1C1C1E',
        padding: 20,
        borderRadius: 12,
        width: '80%',
    },
    modalOption: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalText: {
        color: '#FFF',
        fontSize: 16,
        textAlign: 'center',
    },
    markerCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center'
    },
    container: {
        flex: 1,
    },
    map: {
        width: '100%',
        height: '100%',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 20,
    },
    totalCounter: {
        position: 'absolute',
        top: 20,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        zIndex: 1000
    },
    counterText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
        textAlign: 'center'
    },
    bottomNav: {
        position: 'absolute',
        bottom: 20,
        left: 10,
        right: 10,
        flexDirection: 'row',
        backgroundColor: '#1C1C1E',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
    },
    profileNavItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
    },
    navAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    navText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
        fontWeight: '500',
    },
    activeNavText: {
        color: '#8B5CF6',
        fontWeight: '600',
    },
    floatingButton: {
        position: 'absolute',
        bottom: 100,
        right: 20,
        backgroundColor: '#8B5CF6',
        padding: 14,
        borderRadius: 50,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    modalTitle: {
        fontWeight: 'bold',
        fontSize: 18,
        marginBottom: 10
    },
    label: {
        fontWeight: 'bold'
    },
    closeButton: {
        marginTop: 20,
        backgroundColor: '#333',
        padding: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    dailyCommissionContainer: {
        position: 'absolute',
        top: 50,
        alignSelf: 'center',
        backgroundColor: '#222',
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 20,
        zIndex: 10,
        elevation: 5,
    },
    dailyCommissionText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusFilterContainer: {
        position: 'absolute',
        top: 40,
        left: 10,
        right: 10,
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 6,
        elevation: 4,
    },
    statusIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusButtonContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusCountText: {
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
    },
    overlay: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.23)',
        zIndex: 90
    },
    popup: {
        position: 'absolute',
        bottom: 100,
        left: 0,
        right: 0,
        backgroundColor: '#FFF',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        elevation: 16,
        padding: 18,
        zIndex: 100
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 10,
        marginHorizontal: 6
    },
    actionButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15,
        marginLeft: 8
    },
    distanceWarningText: {
        marginTop: 8,
        color: '#D0021B',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.16)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 13,
        paddingHorizontal: 6
    },
    progressContainer: {
        alignItems: 'center',
        marginBottom: 10
    },
    progressBar: {
        width: '92%',
        height: 7,
        backgroundColor: '#eee',
        borderRadius: 6,
        overflow: 'hidden'
    },
    progressFill: {
        height: 7,
        backgroundColor: '#A569C1',
        borderRadius: 6
    },
    modalScrollContent: {
        maxHeight: 300
    },
    navigationButtons: {
        flexDirection: 'row',
        marginTop: 12,
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    navButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 7,
        paddingHorizontal: 18,
        paddingVertical: 9
    },
    prevButton: {
        backgroundColor: '#eee',
        marginRight: 10
    },
    prevButtonText: {
        color: '#333',
        marginLeft: 6,
        fontWeight: 'bold'
    },
    nextButton: {
        backgroundColor: '#A569C1',
        marginLeft: 10
    },
    nextButtonText: {
        color: 'white',
        marginRight: 6,
        fontWeight: 'bold'
    },
    submitButton: {
        backgroundColor: '#7ED321'
    },
    submitButtonText: {
        color: 'white',
        marginLeft: 8,
        fontWeight: 'bold',
        fontSize: 16
    },
    flexSpacer: {
        flex: 1
    },
    textInput: {
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        marginVertical: 6,
        fontSize: 15
    },
    optionButton: {
        backgroundColor: '#eee',
        padding: 12,
        marginVertical: 6,
        borderRadius: 8
    },
    optionButtonActive: {
        backgroundColor: '#A569C1'
    },
    optionText: {
        color: '#333'
    },
    optionTextActive: {
        color: 'white'
    },
    summaryTitle: {
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 8
    },
    profileModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    profileModalContent: {
        backgroundColor: '#f8f9fa',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        maxHeight: '90%',
        minHeight: '80%',
    },
    profileHeader: {
        paddingVertical: 20,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
    },
    profileHeaderContent: {
        alignItems: 'center',
        paddingHorizontal: 20,
        position: 'relative',
    },
    profileCloseButton: {
        position: 'absolute',
        top: -10,
        right: 10,
        padding: 10,
        zIndex: 1,
    },
    profileAvatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: 'white',
        marginBottom: 10,
    },
    profileUserInfo: {
        alignItems: 'center',
    },
    profileWelcomeText: {
        color: 'white',
        fontSize: 16,
        opacity: 0.9,
    },
    profileUserName: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 4,
    },
    profileContent: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    profileLoadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    profileCardRow: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 15,
    },
    profileBalanceCard: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    profileHalfCard: {
        flex: 1,
    },
    profileBalanceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    profileCardTitle: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    profileBalanceAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1F2937',
        marginTop: 5,
    },
    profileSection: {
        backgroundColor: 'white',
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    profileSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1F2937',
        marginBottom: 15,
    },
    profileNoDonationText: {
        color: '#6B7280',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 20,
    },
    profileDonationItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    profileDonationAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#10B981',
    },
    profileDonationDate: {
        fontSize: 14,
        color: '#6B7280',
    },
    profileButtonGroup: {
        paddingHorizontal: 10,
        paddingBottom: 30,
        gap: 12,
    },
    profileActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 15,
        elevation: 2,
    },
    profileActionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
});
export default QuebecMapScreen;
