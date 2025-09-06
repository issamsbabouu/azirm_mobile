import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    SafeAreaView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';
const rankColorsLight = ['#2ecc71', '#f39c12', '#3498db', '#8e44ad', '#2980b9'];
const rankColorsDark  = ['#27ae60', '#e1b12c', '#2980b9', '#8e44ad', '#1f7ab5'];
const currency = (n) =>
    new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n ?? 0);
const Avatar = ({ uri, size = 32, ringColor = '#2ecc71' }) => (
    <View
        style={{
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            backgroundColor: '#0000',
            width: size + 8,
            height: size + 8,
            borderColor: ringColor,
            borderRadius: (size + 8) / 2,
        }}
    >
        <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
        />
    </View>
);
const SpotlightRow = ({ index = 1, item, type = 'money', theme, rankColors }) => {
    const s = createStyles(theme);
    return (
        <View style={s.spotlight}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.rankSpotlight}>#{index}</Text>
                <Avatar uri={item.avatar} size={40} ringColor={rankColors[0]} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={s.nameSpotlight}>{item.name}</Text>
                    <View style={s.valueRow}>
                        {type === 'money' && <Text style={s.valueSpotlight}>{currency(item.value)}</Text>}
                        {type === 'time'  && <Text style={s.valueSpotlight}>{item.valueLabel}</Text>}
                        {type === 'count' && <Text style={s.valueSpotlight}>{item.value}</Text>}
                        <Ionicons name="trophy" size={16} color={theme.colors.trophy} style={{ marginLeft: 8 }} />
                    </View>
                    {!!item.streak && (
                        <View style={s.streakRow}>
                            <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                                🔥 Streak: {item.streak} semaine{item.streak > 1 ? 's' : ''}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};
const RankRow = ({ index, item, max, type = 'money', theme, rankColors }) => {
    const s = createStyles(theme);
    const percent = Math.min(1, (item.value ?? 0) / Math.max(1, max ?? 1));
    return (
        <View style={s.rankRow}>
            <Text style={s.rankText}>#{index}</Text>
            <Avatar uri={item.avatar} ringColor={rankColors[(index - 1) % rankColors.length]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={s.rankName}>{item.name}</Text>
                <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${percent * 100}%` }]} />
                </View>
            </View>
            {type === 'money' && <Text style={s.rankValue}>{currency(item.value)}</Text>}
            {type === 'time'  && <Text style={s.rankValue}>{item.valueLabel}</Text>}
            {type === 'count' && <Text style={s.rankValue}>{item.value}</Text>}
        </View>
    );
};

const LeaderboardCard = ({ title, data = [], limit = 5, type = 'money', theme, rankColors }) => {
    const s = createStyles(theme);
    const top = useMemo(() => data.slice(0, limit), [data, limit]);
    const max = useMemo(() => Math.max(...top.map((x) => x.value ?? 0), 1), [top]);
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>{title}</Text>
            {top[0] && (
                <SpotlightRow index={1} item={top[0]} type={type} theme={theme} rankColors={rankColors} />
            )}
            {top.slice(1).map((item, i) => (
                <RankRow
                    key={item.id || item.name}
                    index={i + 2}
                    item={item}
                    max={max}
                    type={type}
                    theme={theme}
                    rankColors={rankColors}
                />
            ))}
            {!top.length && (
                <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>
                    Aucune donnée disponible pour cette période.
                </Text>
            )}
        </View>
    );
};

export default function DashboardScreen() {
    const { userName, userPosteLabel, user, logout } = useAuth();
    const { theme, isDark, toggleTheme, cycleTheme } = useTheme();
    const s = createStyles(theme);

    const [userProfileImage, setUserProfileImage] = useState('');
    const [loading, setLoading] = useState(true);

    const [topDay, setTopDay] = useState([]);
    const [topWeek, setTopWeek] = useState([]);
    const [topTime, setTopTime] = useState([]);
    const [topDoors, setTopDoors] = useState([]);
    const rankColors = isDark ? rankColorsDark : rankColorsLight;
    const posteLabel =
        userPosteLabel ||
        user?.poste_label ||
        user?.poste?.nom ||
        user?.poste?.name ||
        user?.poste_nom ||
        user?.role ||
        null;

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

    /* --- Fetch photo utilisateur --- */
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('photo, nom_complet, email')
                    .eq('id', user.id)
                    .single();
                if (error) throw error;
                const decoded = decodeHexToString(data?.photo) || data?.photo || data?.avatar_url || '';
                setUserProfileImage(decoded?.startsWith('http') ? decoded : 'https://via.placeholder.com/150');
            } catch (e) {
                console.log('[Dashboard photo] error:', e);
                setUserProfileImage('https://via.placeholder.com/150');
            }
        })();
    }, [user?.id]);

    /* --- Fetch leaderboard --- */
    const fetchTopByAmount = useCallback(async (fromDate, toDate, limit = 5) => {
        const { data, error } = await supabase
            .from('donations')
            .select('collector_id, total_donation, date')
            .gte('date', fromDate.toISOString())
            .lte('date', toDate.toISOString());
        if (error) throw error;
        const sums = new Map();
        for (const row of data ?? []) {
            const cid = row?.collector_id;
            if (!cid) continue;
            const amt = Number(row?.total_donation ?? row?.amount ?? 0);
            sums.set(cid, (sums.get(cid) || 0) + (Number.isFinite(amt) ? amt : 0));
        }
        const sorted = [...sums.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        const ids = sorted.map(([cid]) => cid);
        if (!ids.length) return [];
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, photo, nom_complet, email')
            .in('id', ids);
        if (usersError) throw usersError;
        const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));
        const normalizeName = (u) =>
            u?.nom_complet ||
            u?.full_name ||
            u?.name ||
            [u?.prenom, u?.nom].filter(Boolean).join(' ') ||
            u?.username ||
            u?.email?.split('@')[0] ||
            'Utilisateur';
        const normalizeAvatar = (u) => {
            const raw = decodeHexToString(u?.photo) || u?.photo || u?.avatar_url || '';
            return raw && String(raw).startsWith('http') ? raw : 'https://via.placeholder.com/150';
        };
        return sorted.map(([cid, total]) => {
            const u = usersById.get(cid) || {};
            return {
                id: cid,
                name: normalizeName(u),
                avatar: normalizeAvatar(u),
                value: total,
            };
        });
    }, []);
    const refreshLeaderboards = useCallback(async () => {
        try {
            setLoading(true);
            const now = new Date();
            const dayFrom = new Date(now);
            dayFrom.setHours(0,0,0,0);
            const dayTo = new Date(now);
            dayTo.setHours(23,59,59,999);
            const topDayData = await fetchTopByAmount(dayFrom, dayTo, 5);
            const weekNow = new Date();
            const diff = (weekNow.getDay() + 6) % 7;
            const weekFrom = new Date(weekNow);
            weekFrom.setDate(weekFrom.getDate() - diff);
            weekFrom.setHours(0,0,0,0);
            const topWeekData = await fetchTopByAmount(weekFrom, new Date(), 5);
            setTopDay(topDayData);
            setTopWeek(topWeekData);
            setTopTime([]);
            setTopDoors([]);
        } catch (e) {
            console.log('[Dashboard refreshLeaderboards] error:', e);
            setTopDay([]); setTopWeek([]); setTopTime([]); setTopDoors([]);
        } finally {
            setLoading(false);
        }
    }, [fetchTopByAmount, setLoading]);
    useEffect(() => {
        let cancelled = false;
        let debounceTimer = null;

        (async () => {
            if (cancelled) return;
            await refreshLeaderboards();
        })();

        const channel = supabase
            .channel('donations-top-refetch')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'donations' },
                (payload) => {
                    if (cancelled) return;
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        refreshLeaderboards();
                    }, 300);
                }
            )
            .subscribe();

        return () => {
            cancelled = true;
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    }, [refreshLeaderboards]);

    if (loading) {
        return (
            <SafeAreaView style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {}
            <View style={s.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[s.headerAvatarRing, { borderColor: theme.colors.accent }]}>
                        <Image source={{ uri: userProfileImage }} style={s.avatarImg} />
                    </View>
                    <View>
                        <Text style={s.hello}>Bonjour</Text>
                        <Text style={s.headerName}>{userName || 'Utilisateur'}</Text>
                        {!!posteLabel && (
                            <Text style={s.posteIdText}>
                                Poste:{' '}
                                <Text style={{ fontWeight: '700', color: theme.colors.textPrimary }}>{posteLabel}</Text>
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
                    {}
                    <TouchableOpacity onPress={confirmLogout} activeOpacity={0.8}>
                        <View style={[s.headerIconBtn, { borderColor: "#F43F5E" }]}>
                            <Ionicons name="log-out-outline" size={20} color="#F43F5E" />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
            {}
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                <View style={s.row}>
                    <View style={s.col}>
                        <LeaderboardCard
                            title="Top 5 du jour (somme des dons)"
                            data={topDay}
                            limit={5}
                            type="money"
                            theme={theme}
                            rankColors={rankColors}
                        />
                    </View>
                    <View style={s.col}>
                        <LeaderboardCard
                            title="Top 5 de la semaine (somme des dons)"
                            data={topWeek}
                            limit={5}
                            type="money"
                            theme={theme}
                            rankColors={rankColors}
                        />
                    </View>
                </View>
                <View style={s.row}>
                    <View style={s.col}>
                        <LeaderboardCard
                            title="Top 3 Temps terrain (semaine)"
                            data={topTime}
                            limit={3}
                            type="time"
                            theme={theme}
                            rankColors={rankColors}
                        />
                    </View>
                    <View style={s.col}>
                        <LeaderboardCard
                            title="Top 3 Portes frappées (semaine)"
                            data={topDoors}
                            limit={3}
                            type="count"
                            theme={theme}
                            rankColors={rankColors}
                        />
                    </View>
                </View>
                <View style={s.banner}>
                    <Image
                        source={{
                            uri: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?q=80&w=1600&auto=format&fit=crop',
                        }}
                        style={s.bannerImg}
                        resizeMode="cover"
                    />
                    <View style={s.bannerTextWrap}>
                        <Text style={s.bannerTitle}>Bravo!</Text>
                        <Text style={s.bannerSubtitle}>La team a dépassé l’objectif hebdo</Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* -------------------- Helpers -------------------- */
const decodeHexToString = (val) => {
    if (val == null) return null;
    let s = String(val);
    s = s.replace(/^\\x/i, '').replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]+$/.test(s)) return val;
    let out = '';
    for (let i = 0; i < s.length; i += 2) {
        const code = parseInt(s.substring(i, i + 2), 16);
        if (!isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
};

/* -------------------- Styles -------------------- */
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

        row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
        col: { flex: 1 },

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
        },
        cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: 8 },

        spotlight: {
            backgroundColor: theme.colors.cardAlt,
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.cardAltBorder,
            marginBottom: 8,
        },
        rankSpotlight: { fontWeight: '700', marginRight: 10, color: theme.colors.textPrimary },
        nameSpotlight: { fontWeight: '700', fontSize: 16, color: theme.colors.textPrimary },
        valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
        valueSpotlight: { fontWeight: '700', color: theme.colors.textPrimary },
        streakRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

        rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
        rankText: { width: 28, color: theme.colors.textSecondary, fontWeight: '600' },
        rankName: { color: theme.colors.textPrimary, fontWeight: '600', marginBottom: 6 },
        rankValue: { marginLeft: 8, color: theme.colors.textPrimary, fontWeight: '600' },

        progressTrack: {
            height: 6,
            backgroundColor: theme.colors.progressTrack,
            borderRadius: 999,
            overflow: 'hidden',
        },
        progressFill: { height: 6, backgroundColor: theme.colors.progressFill },

        banner: {
            backgroundColor: theme.colors.card,
            borderRadius: CARD_RADIUS,
            overflow: 'hidden',
            marginTop: 8,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
        },
        bannerImg: { width: '100%', height: 130 },
        bannerTextWrap: { padding: 12 },
        bannerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary },
        bannerSubtitle: { color: theme.colors.textSecondary, marginTop: 4 },
    });
