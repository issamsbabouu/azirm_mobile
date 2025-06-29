import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
    SafeAreaView, Dimensions, ActivityIndicator
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
    const [totalCollected, setTotalCollected] = useState(0);
    const [totalCommission, setTotalCommission] = useState(0); // ✅ Bien initialisé à 0
    const [donations, setDonations] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();

    useEffect(() => {
        if (user) fetchAllData();
    }, [user]);

    async function fetchAllData() {
        setLoading(true);
        try {
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('profile_image')
                .eq('id', user.id)
                .single();
            if (userError) throw userError;
            setUserProfileImage(userData?.profile_image || 'https://via.placeholder.com/150');

            const { data: collectorData, error: collectorError } = await supabase
                .from('collectors')
                .select('id, wallet_balance, total_collected, commission')
                .eq('user_id', user.id)
                .single();
            if (collectorError) throw collectorError;

            const collectorId = collectorData.id;
            setWalletBalance(collectorData.wallet_balance || 0);
            setTotalCollected(collectorData.total_collected || 0);
            setTotalCommission(Number(collectorData.commission) || 0); // ✅ Sécurisé

            const { data: donationsData, error: donationsError } = await supabase
                .from('donations')
                .select('*')
                .eq('collector_id', collectorId)
                .order('created_at', { ascending: false });
            if (donationsError) throw donationsError;

            setDonations(donationsData || []);
        } catch (err) {
            console.error('Erreur lors du chargement:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleRefresh() {
        fetchAllData();
    }

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
            <LinearGradient colors={['#7078DC', '#8F71C1']} style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity>
                        <Image source={{ uri: userProfileImage }} style={styles.avatar} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.welcomeText}>Bienvenue</Text>
                        <Text style={styles.userName}>{userName || 'Utilisateur'}</Text>
                    </View>
                    <Image source={require('../../assets/logo_whte.png')} style={styles.logoAzirm} />
                </View>
            </LinearGradient>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.cardRow}>
                    <View style={[styles.balanceCard, styles.halfCard]}>
                        <Text style={styles.cardTitle}>Total collecté</Text>
                        <Text style={styles.balanceAmount}>${totalCollected.toFixed(2)}</Text>
                    </View>
                </View>

                {}
                <View style={styles.balanceCard}>
                    <Text style={styles.cardTitle}>Total des commissions</Text>
                    <Text style={styles.balanceAmount}>${(totalCommission || 0).toFixed(2)}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Mes Donations</Text>
                    {donations.length === 0 ? (
                        <Text style={styles.noDonationText}>Aucune donation encore.</Text>
                    ) : (
                        donations.map(donation => (
                            <View key={donation.id} style={styles.donationItem}>
                                <Text style={styles.donationAmount}>+ ${donation.amount.toFixed(2)}</Text>
                                <Text style={styles.donationDate}>{new Date(donation.created_at).toLocaleDateString()}</Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <View style={styles.bottomNav}>
                {renderNavItem('home', 'Accueil', false, () => navigation.navigate('Dashboard'))}
                {renderNavItem('account-balance-wallet', 'Wallet', true, () => navigation.navigate('wallet'))}
                {renderNavItem('place', 'Missions', false, () => navigation.navigate('route'))}
                {renderNavItem('bar-chart', 'Stats', false, () => navigation.navigate('stats'))}
                {renderNavItem('menu-book', 'Formation', false, () => navigation.navigate('training'))}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { paddingVertical: 20, backgroundColor: '#7078DC', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
    headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
    avatar: { width: 65, height: 65, borderRadius: 32.5, borderWidth: 3, borderColor: '#FFF' },
    logoAzirm: { width: 80, height: 80, resizeMode: 'contain' },
    welcomeText: { color: '#D1C4E9', fontSize: 15 },
    userName: { fontWeight: 'bold', fontSize: 24, color: '#FFF' },
    content: { flex: 1, padding: 20 },
    balanceCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 10, elevation: 5 },
    balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#555' },
    balanceAmount: { fontSize: 28, fontWeight: 'bold', color: '#4B3F72' },
    section: { marginTop: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    donationItem: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 3, flexDirection: 'row', justifyContent: 'space-between' },
    donationAmount: { fontSize: 16, fontWeight: 'bold', color: '#10B981' },
    donationDate: { fontSize: 14, color: '#555' },
    noDonationText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
    bottomNav: { position: 'absolute', bottom: 20, left: 10, right: 10, flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
    navItem: { flex: 1, alignItems: 'center' },
    navText: { fontSize: 11, color: '#666', marginTop: 5 },
    activeNavText: { color: '#7078DC' },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    halfCard: { flex: 1, marginHorizontal: 5 }
});

export default DonationWalletApp;
