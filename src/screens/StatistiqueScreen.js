import React, { useEffect, useState, useRef } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    Animated,
    Easing,
    Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase";

/* ---------------- Helpers ---------------- */
const formatCurrency = (n, currency = "EUR") =>
    new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
    }).format(n);

function AnimatedNumber({ value, formatter = (v) => v, duration = 800, style }) {
    const animatedValue = useRef(new Animated.Value(value)).current;
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: value,
            duration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
        }).start();

        const listener = animatedValue.addListener(({ value }) => {
            setDisplayValue(value);
        });

        return () => {
            animatedValue.removeAllListeners();
        };
    }, [value]);

    return <Text style={style}>{formatter(Math.round(displayValue))}</Text>;
}

/* ---------------- Main Screen ---------------- */
export default function StatistiqueScreen() {
    const { theme, isDark, toggleTheme, cycleTheme } = useTheme();
    const { user, userName, userPosteLabel, logout } = useAuth();
    const s = createStyles(theme);

    const [personalStats, setPersonalStats] = useState(null);

    /* Charger les stats depuis Supabase */
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            try {
                // TODO: récupérer et calculer stats réelles (jour/semaine) depuis Supabase
                setPersonalStats({
                    donsJour: 72,
                    portesJour: 15,
                    acceptesJour: 10,
                    refusJour: 3,
                    absentsJour: 2,
                    tempsJour: 6.5,

                    donsSemaine: 356,
                    portesSemaine: 78,
                    acceptesSemaine: 48,
                    refusSemaine: 19,
                    absentsSemaine: 11,
                    tempsSemaine: 38,
                });
            } catch (e) {
                console.log("[Stats load error]:", e);
            }
        })();
    }, [user?.id]);

    /* Déconnexion */
    const confirmLogout = () => {
        Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
            { text: "Annuler", style: "cancel" },
            { text: "Oui", style: "destructive", onPress: logout },
        ]);
    };

    return (
        <SafeAreaView style={s.container}>
            <StatusBar style={isDark ? "light" : "dark"} />

            {/* ---------------- Header ---------------- */}
            <View style={s.header}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={[s.headerAvatarRing, { borderColor: theme.colors.accent }]}>
                        <Image
                            source={{ uri: "https://via.placeholder.com/150" }}
                            style={s.avatarImg}
                        />
                    </View>
                    <View>
                        <Text style={s.hello}>Bonjour</Text>
                        <Text style={s.headerName}>{userName || "Utilisateur"}</Text>
                        {(userPosteLabel || user?.poste?.nom) && (
                            <Text style={s.posteIdText}>
                                Poste :{" "}
                                <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>
                                    {userPosteLabel || user?.poste?.nom}
                                </Text>
                            </Text>
                        )}
                    </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Ionicons name={isDark ? "sunny" : "moon"} size={20} onPress={toggleTheme} />
                    <Ionicons name="sync" size={18} onPress={cycleTheme} />
                    <Ionicons
                        name="log-out-outline"
                        size={20}
                        color="#F43F5E"
                        onPress={confirmLogout}
                    />
                </View>
            </View>

            {/* ---------------- Body ---------------- */}
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                {personalStats ? (
                    <View style={{ gap: 20 }}>

                        {/* Statistiques du jour & semaine */}
                        <View style={{ flexDirection: "row", gap: 12 }}>
                            {/* Jour */}
                            <View style={[s.card, { flex: 1 }]}>
                                <Text style={s.cardTitle}>Statistiques du jour</Text>
                                <StatRow theme={theme} icon="dons" label="Dons" value={personalStats.donsJour} formatter={(v) => formatCurrency(v)} />
                                <StatRow theme={theme} icon="portes" label="Portes" value={personalStats.portesJour} />
                                <StatRow theme={theme} icon="acceptes" label="Acceptés" value={personalStats.acceptesJour} />
                                <StatRow theme={theme} icon="refus" label="Refus" value={personalStats.refusJour} />
                                <StatRow theme={theme} icon="absents" label="Absents" value={personalStats.absentsJour} />
                                <StatRow theme={theme} icon="tempsH" label="Temps" value={personalStats.tempsJour} suffix="h" />
                            </View>

                            {/* Semaine */}
                            <View style={[s.card, { flex: 1 }]}>
                                <Text style={s.cardTitle}>Statistiques de la semaine</Text>
                                <StatRow theme={theme} icon="dons" label="Dons" value={personalStats.donsSemaine} formatter={(v) => formatCurrency(v)} />
                                <StatRow theme={theme} icon="portes" label="Portes" value={personalStats.portesSemaine} />
                                <StatRow theme={theme} icon="acceptes" label="Acceptés" value={personalStats.acceptesSemaine} />
                                <StatRow theme={theme} icon="refus" label="Refus" value={personalStats.refusSemaine} />
                                <StatRow theme={theme} icon="absents" label="Absents" value={personalStats.absentsSemaine} />
                                <StatRow theme={theme} icon="tempsH" label="Temps" value={personalStats.tempsSemaine} suffix="h" />
                            </View>
                        </View>

                        {/* Performance Hebdomadaire */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Performance hebdomadaire</Text>
                            <Text style={s.sectionTitle}>Dons par jour</Text>
                            <View style={s.graphPlaceholder}>
                                <Text style={{ color: theme.colors.textSecondary }}>
                                    Graphique Dons (Lun → Dim)
                                </Text>
                            </View>
                            <Text style={[s.sectionTitle, { marginTop: 20 }]}>Portes frappées par jour</Text>
                            <View style={s.graphPlaceholder}>
                                <Text style={{ color: theme.colors.textSecondary }}>
                                    Graphique Portes (Lun → Dim)
                                </Text>
                            </View>
                        </View>

                        {/* Progression Objectifs */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Progression vers l'objectif hebdomadaire</Text>
                            <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 15 }}>
                                <View style={{ alignItems: "center" }}>
                                    <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.accent }}>71%</Text>
                                    <Text style={{ color: theme.colors.textSecondary }}>Objectif Dons</Text>
                                    <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>356€ / 500€</Text>
                                </View>
                                <View style={{ alignItems: "center" }}>
                                    <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.accent }}>156%</Text>
                                    <Text style={{ color: theme.colors.textSecondary }}>Objectif Portes</Text>
                                    <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>78 / 50</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                ) : (
                    <Text style={{ color: theme.colors.textSecondary }}>Chargement...</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/* ---------------- Stat Row ---------------- */
function StatRow({ theme, icon, label, value, suffix = "", formatter }) {
    const iconMap = {
        dons: <Ionicons name="cash-outline" size={16} color={theme.colors.accent} />,
        acceptes: <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.accent} />,
        portes: <MaterialCommunityIcons name="door-closed" size={16} color="#60A5FA" />,
        refus: <Ionicons name="close-circle-outline" size={16} color="#F43F5E" />,
        absents: <Ionicons name="remove-circle-outline" size={16} color={theme.colors.textSecondary} />,
        tempsH: <Ionicons name="time-outline" size={16} color="#F59E0B" />,
    };
    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
            {iconMap[icon]}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>{label}</Text>
            <View style={{ flex: 1 }} />
            <AnimatedNumber
                value={Number(value)}
                formatter={formatter || ((v) => `${v}${suffix}`)}
                style={{ color: theme.colors.textPrimary, fontWeight: "700" }}
            />
        </View>
    );
}

/* ---------------- Styles ---------------- */
const createStyles = (theme) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { paddingHorizontal: 12, paddingBottom: 24 },
        header: {
            paddingHorizontal: 18,
            paddingTop: 6,
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        hello: { color: theme.colors.textSecondary, fontSize: 14 },
        headerName: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: "700" },
        posteIdText: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 2 },
        headerAvatarRing: {
            width: 46,
            height: 46,
            borderRadius: 23,
            borderWidth: 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.card,
        },
        avatarImg: { width: 42, height: 42, borderRadius: 21 },
        card: {
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 16,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
        },
        cardTitle: {
            fontSize: 16,
            fontWeight: "700",
            color: theme.colors.textPrimary,
            marginBottom: 8,
        },
        sectionTitle: {
            fontSize: 14,
            fontWeight: "600",
            color: theme.colors.textPrimary,
            marginTop: 10,
        },
        graphPlaceholder: {
            height: 120,
            borderRadius: 10,
            marginTop: 8,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
        },
    });
