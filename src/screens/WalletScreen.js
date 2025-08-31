import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    SafeAreaView,
    Dimensions,
    ActivityIndicator,
    Modal,
    Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';

const { width } = Dimensions.get('window');

/* ---------------- Helpers ---------------- */
const decodeHexToString = (hex) => {
    if (!hex) return null;
    if (hex.startsWith('\\x') || hex.startsWith('\\\\x')) hex = hex.slice(2);
    let out = '';
    for (let i = 0; i < hex.length; i += 2) {
        const code = parseInt(hex.substr(i, 2), 16);
        if (!isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
};

const normalizePhoto = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'string' && raw.startsWith('\\x')) {
        const decoded = decodeHexToString(raw);
        return decoded || null;
    }
    if (/^(https?:\/\/|data:image\/)/i.test(String(raw))) return String(raw);
    return String(raw);
};

/* ---------------- Main Screen ---------------- */
export default function DonationWalletApp() {
    const { user, userName, userPosteLabel, logout } = useAuth();
    const { theme, isDark, toggleTheme, cycleTheme } = useTheme();
    const s = createStyles(theme);

    const [userProfileImage, setUserProfileImage] = useState('');
    const [walletBalance, setWalletBalance] = useState(0);
    const [courant, setCourant] = useState(350);
    const [caution, setCaution] = useState(120);
    const [epargne, setEpargne] = useState(432);
    const [objectifEpargne, setObjectifEpargne] = useState(1200);
    const [points, setPoints] = useState(1250);

    const [loading, setLoading] = useState(true);
    const [showProfileOptions, setShowProfileOptions] = useState(false);

    useEffect(() => {
        if (user?.id) fetchAllData();
    }, [user?.id]);

    async function fetchAllData() {
        setLoading(true);
        try {
            const { data: userData, error } = await supabase
                .from('users')
                .select(`photo`)
                .eq('id', user.id)
                .single();

            if (error) throw error;

            const normalized = normalizePhoto(userData?.photo);
            setUserProfileImage(
                normalized || 'https://via.placeholder.com/150?text=Profil'
            );

            setWalletBalance(Number(userData?.wallet_balance) || 0);
            setPoints(Number(userData?.nova_points) || 0);
            setCourant(Number(userData?.current) || 0);
            setCaution(Number(userData?.caution) || 0);
            setEpargne(Number(userData?.savings) || 0);
        } catch (e) {
            console.error('Erreur de chargement:', e);
        } finally {
            setLoading(false);
        }
    }

    /* --- Confirmation déconnexion --- */
    const confirmLogout = () => {
        Alert.alert(
            "Déconnexion",
            "Voulez-vous vraiment vous déconnecter ?",
            [
                { text: "Annuler", style: "cancel" },
                { text: "Oui", style: "destructive", onPress: logout },
            ]
        );
    };

    const total = (Number(courant) || 0) + (Number(caution) || 0) + (Number(epargne) || 0);
    const progress = Math.min(epargne / (objectifEpargne || 1), 1);
    const progressPercentage = Math.round(progress * 100);

    const posteLabel =
        userPosteLabel ||
        user?.poste_label ||
        user?.poste?.nom ||
        user?.poste?.name ||
        user?.poste_nom ||
        user?.role ||
        null;

    if (loading) {
        return (
            <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {/* -------- Header -------- */}
            <View style={s.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity onPress={() => setShowProfileOptions(true)} activeOpacity={0.8}>
                        <View style={[s.headerAvatarRing, { borderColor: theme.colors.accent }]}>
                            <Image source={{ uri: userProfileImage }} style={s.avatarImg} />
                        </View>
                    </TouchableOpacity>
                    <View>
                        <Text style={s.hello}>Bonjour</Text>
                        <Text style={s.headerName}>{userName || 'Utilisateur'}</Text>
                        {!!posteLabel && (
                            <Text style={s.posteIdText}>
                                Poste : <Text style={{ fontWeight: '700', color: theme.colors.textPrimary }}>{posteLabel}</Text>
                            </Text>
                        )}
                    </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={toggleTheme} activeOpacity={0.8}>
                        <View style={[s.headerIconBtn, { borderColor: theme.colors.accent }]}>
                            <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={theme.colors.textPrimary} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={cycleTheme} activeOpacity={0.8}>
                        <View style={[s.headerIconBtn, { borderColor: theme.colors.border }]}>
                            <Ionicons name="sync" size={18} color={theme.colors.textSecondary} />
                        </View>
                    </TouchableOpacity>
                    {/* --- Bouton logout direct --- */}
                    <TouchableOpacity onPress={confirmLogout} activeOpacity={0.8}>
                        <View style={[s.headerIconBtn, { borderColor: "#F43F5E" }]}>
                            <Ionicons name="log-out-outline" size={20} color="#F43F5E" />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* -------- Contenu (wallet) -------- */}
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                {/* Solde global */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Solde global</Text>
                    <Text style={s.totalAmount}>
                        {total.toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })}
                    </Text>
                </View>

                {/* 3 tuiles */}
                <View style={s.row}>
                    <View style={s.tile}>
                        <View style={s.tileIcon}>
                            <MaterialIcons name="account-balance-wallet" size={18} color={theme.colors.textPrimary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.tileTitle}>Courant</Text>
                            <Text style={s.tileValue}>
                                {(courant || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })}
                            </Text>
                        </View>
                    </View>

                    <View style={s.tile}>
                        <View style={s.tileIcon}>
                            <MaterialIcons name="verified-user" size={18} color={theme.colors.textPrimary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.tileTitle}>Caution</Text>
                            <Text style={s.tileValue}>
                                {(caution || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })}
                            </Text>
                        </View>
                    </View>

                    <View style={s.tile}>
                        <View style={s.tileIcon}>
                            <MaterialIcons name="savings" size={18} color={theme.colors.textPrimary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.tileTitle}>Épargne</Text>
                            <Text style={s.tileValue}>
                                {(epargne || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Objectif épargne */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Objectif épargne</Text>
                    <View style={s.progressTrack}>
                        <View style={[s.progressFill, { width: `${progressPercentage}%` }]} />
                    </View>
                    <View style={s.progressTextRow}>
                        <Text style={s.progressText}>{progressPercentage}% atteint</Text>
                        <Text style={s.progressText}>
                            {(epargne || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })} sur{' '}
                            {(objectifEpargne || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'CAD' })}
                        </Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={s.row}>
                    <TouchableOpacity style={[s.actionBtn, { borderColor: theme.colors.accent }]}>
                        <Text style={s.actionBtnText}>Transférer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn}>
                        <Text style={s.actionBtnText}>Historique</Text>
                    </TouchableOpacity>
                </View>

                {/* Points */}
                <View style={s.card}>
                    <Text style={[s.cardTitle, { marginBottom: 6 }]}>Points</Text>
                    <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
                        {Number(points || 0).toLocaleString('fr-FR')} pts
                    </Text>
                </View>
            </ScrollView>

            {/* -------- Modal profil -------- */}
            <Modal
                transparent
                visible={showProfileOptions}
                animationType="fade"
                onRequestClose={() => setShowProfileOptions(false)}
            >
                <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowProfileOptions(false)}>
                    <View style={s.modalBox}>
                        <TouchableOpacity
                            style={s.modalOption}
                            onPress={() => {
                                setShowProfileOptions(false);
                                // navigation.navigate('profile');
                            }}
                        >
                            <Text style={s.modalText}>✏️ Modifier mon compte</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={s.modalOption}
                            onPress={() => {
                                setShowProfileOptions(false);
                                confirmLogout();
                            }}
                        >
                            <Text style={[s.modalText, { color: '#F87171' }]}>🔓 Se déconnecter</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

/* ---------------- Styles ---------------- */
const CARD_RADIUS = 16;

const createStyles = (theme) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        header: {
            paddingHorizontal: 18,
            paddingTop: 6,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        hello: { color: theme.colors.textSecondary, fontSize: 14 },
        headerName: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: '700' },
        posteIdText: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 2 },
        headerAvatarRing: {
            width: 46,
            height: 46,
            borderRadius: 23,
            borderWidth: 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.card,
        },
        avatarImg: { width: 42, height: 42, borderRadius: 21 },
        headerIconBtn: {
            width: 42,
            height: 42,
            borderRadius: 21,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.card,
        },
        content: { paddingHorizontal: 12, paddingBottom: 24 },
        card: {
            backgroundColor: theme.colors.card,
            borderRadius: CARD_RADIUS,
            padding: 12,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            marginBottom: 12,
        },
        cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
        totalAmount: { color: theme.colors.textPrimary, fontSize: 32, fontWeight: '700', marginTop: 4 },
        row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
        tile: {
            flex: 1,
            backgroundColor: theme.colors.cardAlt,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        tileIcon: {
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        tileTitle: { color: theme.colors.textSecondary, fontSize: 12 },
        tileValue: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' },
        progressTrack: {
            height: 10,
            backgroundColor: theme.colors.cardAlt,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
            marginTop: 10,
        },
        progressFill: { height: '100%', backgroundColor: '#2563EB' },
        progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
        progressText: { color: theme.colors.textSecondary },
        actionBtn: {
            flex: 1,
            backgroundColor: theme.colors.card,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
        },
        actionBtnText: { color: theme.colors.textPrimary, fontWeight: '600' },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
        modalBox: { backgroundColor: theme.colors.card, padding: 20, borderRadius: 12, width: '82%', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
        modalOption: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
        modalText: { color: theme.colors.textPrimary, fontSize: 16, textAlign: 'center' },
    });
