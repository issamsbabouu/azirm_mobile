import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
    SafeAreaView, Dimensions, ActivityIndicator,Modal
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from "@react-navigation/native";
import { supabase } from '../supabase';
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get('window');

const DonationWalletApp = () => {
    const { user, userName } = useAuth();
    const [userProfileImage, setUserProfileImage] = useState('');
    const [walletBalance, setWalletBalance] = useState(0);
    const [courant, setCourant] = useState(350);
    const [caution, setCaution] = useState(120);
    const [epargne, setEpargne] = useState(432);
    const [objectifEpargne, setObjectifEpargne] = useState(1200);
    const [points, setPoints] = useState(1250);
    const navigation = useNavigation();
    const [loading, setLoading] = useState(true);
    const [showProfileOptions, setShowProfileOptions] = useState(false);
    useEffect(() => {
        if (user) fetchAllData();
    }, [user]);

    async function fetchAllData() {
        setLoading(true);
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('profile_image')
                .eq('id', user.id)
                .single();
            setUserProfileImage(userData?.profile_image || 'https://via.placeholder.com/150');

            const { data: collectorData } = await supabase
                .from('collectors')
                .select('*')
                .eq('user_id', user.id)
                .single();

            setWalletBalance((collectorData?.wallet_balance || 0));
            setPoints(collectorData?.nova_points || 1250);
            setCourant(Number(collectorData?.current) || 0);
            setCaution(Number(collectorData?.caution) || 0);
            setEpargne(Number(collectorData?.savings) || 0);

        } catch (e) {
            console.error("Erreur de chargement:", e);
        } finally {
            setLoading(false);
        }
    }
    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigation.reset({
            index: 0,
            routes: [{ name: 'AuthNavigator' }],
        });
    };

    const total = (Number(courant) || 0) + (Number(caution) || 0) + (Number(epargne) || 0);
    const progress = Math.min(epargne / objectifEpargne, 1);
    const progressPercentage = Math.round(progress * 100);

    function renderNavItem(iconName, label, isActive, onPress) {
        return (
            <TouchableOpacity style={styles.navItem} onPress={onPress}>
                <MaterialIcons name={iconName} size={24} color={isActive ? '#8B5CF6' : '#9CA3AF'} />
                <Text style={[styles.navText, isActive && styles.activeNavText]}>{label}</Text>
            </TouchableOpacity>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#8B5CF6" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* ✅ HEADER */}
            <View style={styles.floatingHeader}>
                <TouchableOpacity onPress={() => setShowProfileOptions(true)}>
                    <Image source={{ uri: userProfileImage }} style={styles.avatar} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.userName}>{userName || 'Utilisateur'}</Text>
                </View>
                <Image source={require('../../assets/logo_whte.png')} style={styles.logoAzirm} />
            </View>

            {/* ✅ CONTENU */}
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Solde global</Text>
                    <Text style={styles.totalAmount}>${total.toFixed(2).replace('.', ',')}</Text>
                </View>

                <View style={styles.row}>
                    <View style={styles.smallCard}>
                        <Text style={styles.smallCardTitle}>Courant</Text>
                        <Text style={styles.smallCardAmount}>${courant.toFixed(2).replace('.', ',')}</Text>
                    </View>
                    <View style={styles.smallCard}>
                        <Text style={styles.smallCardTitle}>Caution</Text>
                        <Text style={styles.smallCardAmount}>${caution.toFixed(2).replace('.', ',')}</Text>
                    </View>
                    <View style={styles.smallCard}>
                        <Text style={styles.smallCardTitle}>Épargne</Text>
                        <Text style={styles.smallCardAmount}>${epargne.toFixed(2).replace('.', ',')}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Objectif épargne</Text>
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${progressPercentage}%` }]} />
                    </View>
                    <View style={styles.progressTextRow}>
                        <Text style={styles.progressText}>{progressPercentage}% atteint</Text>
                        <Text style={styles.progressText}>{epargne} sur {objectifEpargne}</Text>
                    </View>
                </View>

                <View style={styles.row}>
                    <TouchableOpacity style={styles.button}>
                        <Text style={styles.buttonText}>Transférer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.button}>
                        <Text style={styles.buttonText}>Historique</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.pointsSection}>
                    <Text style={styles.pointsLabel}>Points</Text>
                    <Text style={styles.pointsValue}>{points.toLocaleString('fr-FR')} pts</Text>
                </View>
            </ScrollView>

            {/* ✅ BOTTOM NAV */}
            <View style={styles.bottomNav}>
                {renderNavItem('home', 'Accueil', false, () => navigation.navigate('Dashboard'))}
                {renderNavItem('account-balance-wallet', 'Wallet', true, () => navigation.navigate('wallet'))}
                {renderNavItem('place', 'Missions', false, () => navigation.navigate('route'))}
                {renderNavItem('bar-chart', 'Stats', false, () => navigation.navigate('stats'))}
                {renderNavItem('menu-book', 'Formations', false, () => navigation.navigate('training'))}
            </View>
            <Modal
                transparent
                visible={showProfileOptions}
                animationType="fade"
                onRequestClose={() => setShowProfileOptions(false)}
            >
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowProfileOptions(false)}>
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

        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    modalOverlay: {
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
    floatingHeader: {
        position: 'absolute',
        top: 20,
        left: 10,
        right: 10,
        backgroundColor: 'rgba(28,28,30,0.95)',
        borderRadius: 25,
        paddingVertical: 14,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 12,
        zIndex: 999
    },
    logoAzirm: {
        width: 60,
        height: 60,
        resizeMode: 'contain'
    },
    userName:{
        color:'white',
        fontSize: 20,
        fontWeight: 'italic',
    },
    content: {
        padding: 20,
        paddingTop: 120
    },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    avatar: { width: 65, height: 65, borderRadius: 32.5, borderWidth: 3, borderColor: '#FFF' },
    card: {
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16
    },
    cardTitle: { color: '#fff', fontSize: 16, marginBottom: 10 },
    totalAmount: { color: '#fff', fontSize: 32, fontWeight: 'bold' },

    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    smallCard: {
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        padding: 16,
        width: '31%'
    },
    smallCardTitle: { color: '#fff', fontSize: 14 },
    smallCardAmount: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginTop: 8 },

    progressBarContainer: {
        backgroundColor: '#3A3A3C',
        height: 10,
        borderRadius: 10,
        marginTop: 10,
        overflow: 'hidden'
    },
    progressBar: {
        height: 10,
        backgroundColor: '#FF5E3A',
        borderRadius: 10
    },
    progressTextRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10
    },
    progressText: { color: '#fff' },

    button: {
        flex: 1,
        backgroundColor: '#1C1C1E',
        paddingVertical: 14,
        marginHorizontal: 5,
        borderRadius: 12,
        alignItems: 'center'
    },
    buttonText: { color: '#fff', fontWeight: '600' },

    pointsSection: { marginTop: 30 },
    pointsLabel: { color: '#FF3B30', fontSize: 16 },
    pointsValue: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginTop: 5 },

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
    navItem: { flex: 1, alignItems: 'center' },
    navText: { fontSize: 11, color: '#666', marginTop: 5 },
    activeNavText: { color: '#7078DC' }
});

export default DonationWalletApp;
